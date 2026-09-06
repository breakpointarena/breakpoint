-- ================================================
-- A WALK-IN SESSION CAN BE STARTED FROM A TIME TYPED BY HAND
-- ================================================
-- Check-in stamps `checked_in_at` from the database clock, which is right when
-- the button is pressed at the moment the customer sits down. It is wrong every
-- other time: the desk is busy, the customer has been playing for twenty minutes
-- before anybody types them in, and the bill then starts twenty minutes late.
-- That is the same class of error this table was changed to fix in
-- `20260814100000` - a time nobody chose being billed as though somebody had -
-- only pointing the other way.
--
-- So check-in now takes an optional time of day. Passed NULL it behaves exactly
-- as before and nothing about the existing Check In buttons changes; passed a
-- clock reading it starts the session there instead.
--
-- Deliberately a TIME and not a TIMESTAMPTZ. The front desk enters a time of day,
-- and the day it belongs to is a question about the arena's calendar, which this
-- function is already the right place to answer - the caller is a Node process
-- whose own clock is UTC on Vercel and IST on a laptop, and every attempt to work
-- that out up there has been a bug.

-- The eight-argument version has to go rather than be replaced: adding a
-- defaulted parameter creates a second overload, and a call naming the original
-- eight arguments would then match both and fail as ambiguous.
DROP FUNCTION IF EXISTS public.checkin_walkin_session(
  UUID, UUID, TEXT, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC
);

CREATE OR REPLACE FUNCTION public.checkin_walkin_session(
  p_booking_id UUID,
  p_device_type_id UUID,
  p_device_type TEXT,
  p_hourly_rate NUMERIC,
  p_player_count INTEGER,
  p_included_players INTEGER,
  p_extra_player_charge NUMERIC,
  p_provisional_hours NUMERIC,
  -- Time of day the customer actually started. NULL means now, which is what
  -- every existing caller wants and what the button on the bookings list sends.
  p_started_clock TIME DEFAULT NULL,
  -- How far back p_started_clock may reach. Passed in rather than hard-coded so
  -- it stays the same number the form validated against: MAX_BACKDATED_START_HOURS
  -- in lib/bookings/walkInSession.ts, which derives it from how long a session is
  -- believed to be live. The default here only covers a direct psql call.
  p_max_backdate_hours NUMERIC DEFAULT 6
)
RETURNS TABLE (
  started_at TIMESTAMPTZ,
  device_id UUID,
  station_number TEXT
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  -- Named, and deliberately not current_setting('TimeZone'). The database runs
  -- in UTC and 20260815100000 replaced exactly that call here because of it: a
  -- session checked in at 00:07 IST was being filed under the previous day, slot
  -- date, start time and booking number alike. Changing the database's TimeZone
  -- instead would move every other query's rendering with it. The zone is the
  -- arena's; the server's is nobody's business.
  v_zone TEXT := 'Asia/Kolkata';
  -- When the session is billed from. The same value all the way down: what the
  -- booking is stamped with, what the slot row is dated by, and what is handed
  -- back for the toast - so there is no second reading of the clock to disagree.
  v_started TIMESTAMPTZ;
  v_start TIME;
  v_date DATE;
  v_end TIME;
  v_assigned RECORD;
BEGIN
  IF p_started_clock IS NULL THEN
    v_started := v_now;
  ELSE
    -- Built from the arena's calendar day, then read back in the arena's zone,
    -- so a session starting at 00:15 is filed under the day the arena calls
    -- today and not under whatever UTC had reached.
    v_started := ((v_now AT TIME ZONE v_zone)::DATE + p_started_clock) AT TIME ZONE v_zone;

    -- A reading later in the day than right now cannot have happened yet today,
    -- so it was last night: 11:45 PM entered at 00:30 is forty-five minutes ago.
    -- The same shift turns a mistyped future time into something a day old,
    -- which the ceiling below then refuses.
    IF v_started > v_now THEN
      v_started := v_started - INTERVAL '1 day';
    END IF;

    IF v_started < v_now - (p_max_backdate_hours || ' hours')::INTERVAL THEN
      RAISE EXCEPTION
        'A walk-in cannot be started more than % hours ago', p_max_backdate_hours
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Claim the booking first. Anything not sitting in 'confirmed' and waiting -
  -- already checked in, cancelled, completed, or an advance booking that is not
  -- an open-ended session - matches nothing and gets zero rows back.
  --
  -- `updated_at` stays on the real clock while `checked_in_at` moves: one records
  -- when the row was touched, the other when the customer started playing, and
  -- backdating the first would falsify the audit trail to fix the bill.
  UPDATE public.bookings
  SET status = 'checked_in',
      checked_in_at = v_started,
      updated_at = v_now
  WHERE id = p_booking_id
    AND status = 'confirmed'
    AND checked_in_at IS NULL
    AND billed_on_actual_time = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_start := (v_started AT TIME ZONE v_zone)::TIME;
  v_date := (v_started AT TIME ZONE v_zone)::DATE;
  v_end := (v_start + (p_provisional_hours || ' hours')::INTERVAL)::TIME;

  -- The provisional block runs from the real start, so a backdated session holds
  -- the station over the time it has already been played on. That is what makes
  -- the overlap test below meaningful: a station somebody else was on during
  -- those minutes is correctly refused rather than double-booked in the past.
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

  started_at := v_started;
  device_id := v_assigned.device_id;
  station_number := v_assigned.station_number;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.checkin_walkin_session IS 'Starts a walk-in session: claims a station atomically and stamps checked_in_at. Uses the database clock unless p_started_clock gives a time of day to start from, which is resolved against the arena calendar and refused if it is further back than p_max_backdate_hours. Returns zero rows when the booking is not waiting for check-in, or when no station of that type is free.';

GRANT EXECUTE ON FUNCTION public.checkin_walkin_session TO service_role;

-- PostgREST caches the signature it saw at boot; without this the new arguments
-- come back as PGRST202 until something else reloads it.
NOTIFY pgrst, 'reload schema';
