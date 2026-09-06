-- ================================================
-- WALK-IN SESSIONS BILLED ON ACTUAL PLAYING TIME
-- ================================================
-- A walk-in used to be created with a start time and a duration chosen up front,
-- and a same-day one was inserted already `checked_in` with `checked_in_at = now`.
-- The moment the front desk typed the booking in became the moment the customer
-- was billed from - 8:55 for a customer who sat down at 9:00 - and the bill was
-- fixed before anybody had played anything.
--
-- Now a walk-in is created empty: no times, no station, no money. The customer is
-- checked in when they actually arrive, which is when a station is claimed and the
-- clock starts, and the bill is computed at checkout from the time between those
-- two server timestamps.
--
-- Advance counter bookings still exist and are unchanged: they keep a fixed slot
-- and a price known at creation. The two are told apart by the column below
-- rather than by `booking_source`, which both share.

-- ================================================
-- 1. WHICH BOOKINGS ARE BILLED ON ACTUAL TIME
-- ================================================
-- Only the new walk-in session sets this. Customer online bookings and advance
-- counter bookings never do, so nothing about their pricing can be reached by the
-- code paths this flag opens.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS billed_on_actual_time BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.billed_on_actual_time IS 'True for walk-in sessions priced from checked_in_at to completed_at. False for fixed-slot bookings, whose price is known when they are created.';

-- What the waiting customer asked for. A fixed booking records this on its slot
-- row, but a walk-in has no slot until it checks in and a station is allocated,
-- so the intent has to live somewhere until then.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS walk_in_device_type_id UUID REFERENCES public.device_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS walk_in_device_type_name TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_player_count INTEGER;

COMMENT ON COLUMN public.bookings.walk_in_device_type_id IS 'Device type a walk-in is waiting for. The station itself is only allocated at check-in.';

-- ================================================
-- 2. AN OPEN-ENDED SESSION CAN RUN LONG
-- ================================================
-- duration_hours was NUMERIC(3,2), so anything from 10 hours upwards overflowed.
-- A fixed booking could never reach that - the picker caps at 5 - but a session
-- that is billed by how long the customer actually stayed can, and an overnight
-- one certainly can. Widened rather than rounded, so the stored duration keeps
-- matching the two timestamps it was derived from.
ALTER TABLE public.booking_device_slots
  ALTER COLUMN duration_hours TYPE NUMERIC(6, 2);

-- ================================================
-- 3. CHECK-IN CLAIMS THE STATION
-- ================================================
-- The station is deliberately not reserved when the walk-in is created: the
-- booking is a note that somebody is waiting, and the machine is only allocated
-- when they actually sit down. That makes check-in the moment the allocation
-- races, so it has to be as atomic as the customer flow's - hence one function
-- that verifies the booking, claims a station and stamps the clock in a single
-- transaction.
--
-- Two members of staff pressing Check In on the same booking cannot both claim a
-- station: the first UPDATE moves the row out of 'confirmed' and the second finds
-- nothing to update. Two different bookings racing for the last station are
-- serialised by assign_device_slot's advisory lock, and the loser is told the
-- floor is full rather than being handed a machine somebody is already on.
--
-- The window claimed runs from now to now + p_provisional_hours. It is a
-- placeholder that keeps other bookings off the station while play is in
-- progress; checkout rewrites it to the time actually played.
CREATE OR REPLACE FUNCTION public.checkin_walkin_session(
  p_booking_id UUID,
  p_device_type_id UUID,
  p_device_type TEXT,
  p_hourly_rate NUMERIC,
  p_player_count INTEGER,
  p_included_players INTEGER,
  p_extra_player_charge NUMERIC,
  p_provisional_hours NUMERIC
)
-- `started_at` rather than `checked_in_at`: an OUT parameter named after a column
-- of the table being updated makes every unqualified mention of it ambiguous.
RETURNS TABLE (
  started_at TIMESTAMPTZ,
  device_id UUID,
  station_number TEXT
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_start TIME := (v_now AT TIME ZONE current_setting('TimeZone'))::TIME;
  v_date DATE := (v_now AT TIME ZONE current_setting('TimeZone'))::DATE;
  v_end TIME;
  v_assigned RECORD;
BEGIN
  -- Claim the booking first. Anything not sitting in 'confirmed' and waiting -
  -- already checked in, cancelled, completed, or an advance booking that is not
  -- an open-ended session - matches nothing and gets zero rows back.
  UPDATE public.bookings
  SET status = 'checked_in',
      checked_in_at = v_now,
      updated_at = v_now
  WHERE id = p_booking_id
    AND status = 'confirmed'
    AND checked_in_at IS NULL
    AND billed_on_actual_time = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_end := (v_start + (p_provisional_hours || ' hours')::INTERVAL)::TIME;

  SELECT * INTO v_assigned
  FROM public.assign_device_slot(
    p_booking_id,
    p_device_type_id,
    v_date,
    v_start,
    v_end,
    p_provisional_hours,
    p_hourly_rate,
    0,
    p_device_type,
    p_player_count,
    p_included_players,
    p_extra_player_charge,
    0
  );

  -- Floor is full. Undo the check-in so the booking goes back to waiting and the
  -- front desk can try again or move the customer to another device type -
  -- raising would do the same thing but lose the reason.
  IF NOT FOUND THEN
    UPDATE public.bookings
    SET status = 'confirmed',
        checked_in_at = NULL,
        updated_at = v_now
    WHERE id = p_booking_id;
    RETURN;
  END IF;

  started_at := v_now;
  device_id := v_assigned.device_id;
  station_number := v_assigned.station_number;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.checkin_walkin_session IS 'Starts a walk-in session: claims a station atomically and stamps checked_in_at from the database clock. Returns zero rows when the booking is not waiting for check-in, or when no station of that type is free.';

GRANT EXECUTE ON FUNCTION public.checkin_walkin_session TO service_role;

-- ================================================
-- 4. CHECKOUT STOPS THE CLOCK
-- ================================================
-- Stamps completed_at from the database clock and hands back both ends of the
-- session so the caller can price it. The status test is the whole guard: a
-- booking that was never checked in, or that has already been checked out,
-- matches nothing and gets zero rows - so a second press of Checkout cannot move
-- the end time, and a bill can never be raised for a session that never started.
--
-- Deliberately does no arithmetic. The money is worked out by the application
-- from the two timestamps returned here, using the same rounding helpers the
-- customer flow prices with, so there is one definition of what an hour costs.
CREATE OR REPLACE FUNCTION public.checkout_walkin_session(p_booking_id UUID)
RETURNS TABLE (
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  played_minutes INTEGER
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_started TIMESTAMPTZ;
BEGIN
  UPDATE public.bookings
  SET status = 'completed',
      completed_at = v_now,
      updated_at = v_now
  WHERE id = p_booking_id
    AND status = 'checked_in'
    AND checked_in_at IS NOT NULL
    AND billed_on_actual_time = true
  RETURNING bookings.checked_in_at INTO v_started;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  started_at := v_started;
  ended_at := v_now;
  -- Whole minutes, rounded up: a session is never billed as zero minutes long.
  played_minutes := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_now - v_started)) / 60.0))::INTEGER;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.checkout_walkin_session IS 'Ends a walk-in session, stamping completed_at from the database clock. Returns the played window so the caller can price it. Zero rows when the session is not in progress.';

GRANT EXECUTE ON FUNCTION public.checkout_walkin_session TO service_role;
