-- ================================================
-- A WALK-IN CAN BE HELD TO THE TIME THE CUSTOMER SAYS THEY ARE LEAVING
-- ================================================
-- Check-in claims the station for `p_provisional_hours` - five - because a
-- session has no chosen duration and something had to be written on the slot
-- row. It is a placeholder, and it says the same thing about a customer who is
-- leaving in twenty minutes as about one settling in for the evening.
--
-- The desk often knows better, because the customer just said so. So check-in
-- now takes an optional planned finish, and the slot row gets that window
-- instead of the placeholder. Passed NULL it behaves exactly as before, which is
-- what the Check In button on the bookings list sends.
--
-- **This changes no money.** The bill is still worked out at checkout from the
-- two real timestamps, and checkout still rewrites the slot to the window
-- actually played - so a customer who stays past their planned end pays for the
-- extra, and one who leaves early does not pay for the rest. It is an
-- expectation written down, not a duration sold.
--
-- A TIME, like `p_started_clock` and for the same reason: the desk enters a time
-- of day, and which day it belongs to is a question about the arena's calendar
-- that this function is already the right place to answer.

-- The planned end is kept on the booking as well as on the slot row, because the
-- two say different things. The slot row says "this station is claimed 19:00 to
-- 21:00", which is also exactly what a five-hour placeholder looks like; this
-- column says somebody actually named that time. `20260908000000` needs to tell
-- those apart to decide whether the hours after it can be sold.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS walk_in_planned_end TIMESTAMPTZ;

COMMENT ON COLUMN public.bookings.walk_in_planned_end IS 'When a walk-in customer said they would finish, as named at check-in. NULL means nobody said, and the slot row carries the provisional placeholder instead. Never a price: the bill is worked out at checkout from the time actually played.';

-- The ten-argument version has to go rather than be replaced: defaulted
-- arguments create a second overload, and a call naming the original ten would
-- match both and fail as ambiguous. Adding `held_until` to the returned row
-- needs the drop anyway.
DROP FUNCTION IF EXISTS public.checkin_walkin_session(
  UUID, UUID, TEXT, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TIME, NUMERIC
);

CREATE OR REPLACE FUNCTION public.checkin_walkin_session(
  p_booking_id UUID,
  p_device_type_id UUID,
  p_device_type TEXT,
  p_hourly_rate NUMERIC,
  p_player_count INTEGER,
  p_included_players INTEGER,
  p_extra_player_charge NUMERIC,
  -- How long the station is claimed for when nobody has said otherwise.
  p_provisional_hours NUMERIC,
  -- Time of day the customer actually started. NULL means now.
  p_started_clock TIME DEFAULT NULL,
  -- How far back p_started_clock may reach: MAX_BACKDATED_START_HOURS.
  p_max_backdate_hours NUMERIC DEFAULT 6,
  -- Time of day the customer expects to finish. NULL keeps the placeholder.
  p_planned_end TIME DEFAULT NULL,
  -- How long the station may be held from the start: MAX_PLANNED_SESSION_HOURS
  -- in lib/bookings/walkInSession.ts, which ties it to how long a session is
  -- believed to be live. The default here only covers a direct psql call.
  p_max_session_hours NUMERIC DEFAULT 12
)
RETURNS TABLE (
  started_at TIMESTAMPTZ,
  device_id UUID,
  station_number TEXT,
  -- When the station is claimed until: the planned end, or the placeholder.
  held_until TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  -- Named, and deliberately not current_setting('TimeZone'). The database runs
  -- in UTC and 20260815100000 replaced exactly that call here because of it: a
  -- session checked in at 00:07 IST was being filed under the previous day.
  v_zone TEXT := 'Asia/Kolkata';
  v_started TIMESTAMPTZ;
  v_held_until TIMESTAMPTZ;
  v_hours NUMERIC;
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
    IF v_started > v_now THEN
      v_started := v_started - INTERVAL '1 day';
    END IF;

    IF v_started < v_now - (p_max_backdate_hours || ' hours')::INTERVAL THEN
      RAISE EXCEPTION
        'A walk-in cannot be started more than % hours ago', p_max_backdate_hours
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_planned_end IS NULL THEN
    v_held_until := v_started + (p_provisional_hours || ' hours')::INTERVAL;
    v_hours := p_provisional_hours;
  ELSE
    -- Built on the day the session *starts*, not the day it is being typed on,
    -- so a 11:50 PM start planning to finish at 12:30 AM resolves against its
    -- own evening rather than against whatever midnight has done to today.
    v_held_until := ((v_started AT TIME ZONE v_zone)::DATE + p_planned_end) AT TIME ZONE v_zone;

    -- At or before the start means the small hours of the next day - the arena
    -- trades through midnight - which is also what makes a planned end that has
    -- already passed come out about a day long and get refused below.
    IF v_held_until <= v_started THEN
      v_held_until := v_held_until + INTERVAL '1 day';
    END IF;

    IF v_held_until <= v_now THEN
      RAISE EXCEPTION
        'A planned end has to be in the future'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_held_until > v_started + (p_max_session_hours || ' hours')::INTERVAL THEN
      RAISE EXCEPTION
        'A walk-in cannot be held for more than % hours', p_max_session_hours
        USING ERRCODE = 'check_violation';
    END IF;

    -- Exact, from the two instants. Deriving it in the application would mean
    -- handing down a fraction of an hour and rebuilding the same end from it,
    -- which is how a window ends up at 20:39:59.9.
    v_hours := EXTRACT(EPOCH FROM (v_held_until - v_started)) / 3600.0;
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
      -- Only when one was named. NULL here is what makes the placeholder a
      -- placeholder, and it is what the overlap rule keys on.
      walk_in_planned_end = CASE WHEN p_planned_end IS NULL THEN NULL ELSE v_held_until END,
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
  v_end := (v_held_until AT TIME ZONE v_zone)::TIME;

  -- The block runs from the real start, so a backdated session holds the station
  -- over the time it has already been played on. That is what makes the overlap
  -- test below meaningful: a station somebody else was on during those minutes
  -- is correctly refused rather than double-booked in the past.
  SELECT * INTO v_assigned
  FROM public.assign_device_slot(
    p_booking_id,
    p_device_type_id,
    v_date,
    v_start,
    v_end,
    v_hours,
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
        walk_in_planned_end = NULL,
        updated_at = v_now
    WHERE id = p_booking_id;
    RETURN;
  END IF;

  started_at := v_started;
  device_id := v_assigned.device_id;
  station_number := v_assigned.station_number;
  held_until := v_held_until;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.checkin_walkin_session IS 'Starts a walk-in session: claims a station atomically and stamps checked_in_at. Uses the database clock unless p_started_clock gives a time of day to start from, and holds the station for p_provisional_hours unless p_planned_end gives the time the customer expects to finish. Both are resolved against the arena calendar; the start is refused beyond p_max_backdate_hours, the planned end beyond p_max_session_hours or already past. Returns zero rows when the booking is not waiting for check-in, or when no station of that type is free. Prices nothing: the bill is still worked out at checkout from the time actually played.';

GRANT EXECUTE ON FUNCTION public.checkin_walkin_session TO service_role;

-- PostgREST caches the signature it saw at boot; without this the new arguments
-- come back as PGRST202 until something else reloads it.
NOTIFY pgrst, 'reload schema';
