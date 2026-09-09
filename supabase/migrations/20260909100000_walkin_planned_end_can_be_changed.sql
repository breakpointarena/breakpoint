-- ================================================
-- THE PLANNED END CAN BE CHANGED, AND IS SPENT AT CHECKOUT
-- ================================================
-- `20260907000000` let the desk record when a customer says they are leaving,
-- and `20260908000000` made the hours after that time sellable. Neither gave
-- anybody a way to change their mind - and customers do: they order food, they
-- win a frame, they stay another hour. Until now the only way to alter the hold
-- was to check them out.
--
-- That matters more than it sounds because of what the planned end now does. A
-- station is on sale from the moment the stated finish passes, so a customer who
-- says "nine" and means "ten" spends an hour looking free while somebody is
-- sitting at it. Extending has to be possible, and it has to be *checked* -
-- which is the whole reason this is a function and not an UPDATE in the
-- application: between the planned end being set and being extended, the hours
-- it freed may already have been sold.
--
-- Also clears the plan at checkout. It is spent then: the booking carries two
-- real timestamps, and a stale expectation sitting beside them is something a
-- later report can only read wrongly.

-- ================================================
-- 1. CHANGING THE PLAN
-- ================================================
CREATE OR REPLACE FUNCTION public.set_walkin_planned_end(
  p_booking_id UUID,
  -- The new finish, or NULL to take the plan off and go back to the
  -- provisional block a session with no stated end holds.
  p_planned_end TIME DEFAULT NULL,
  -- How long the station may be held from the start: MAX_PLANNED_SESSION_HOURS.
  p_max_session_hours NUMERIC DEFAULT 12,
  -- The placeholder to fall back to when the plan is removed:
  -- PROVISIONAL_SESSION_HOURS.
  p_provisional_hours NUMERIC DEFAULT 5
)
RETURNS TABLE (
  held_until TIMESTAMPTZ,
  station_number TEXT
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  -- Named, not current_setting('TimeZone'): the database runs in UTC and
  -- slot_date/slot_start_time are arena local, which is what 20260815100000
  -- exists for.
  v_zone TEXT := 'Asia/Kolkata';
  v_started TIMESTAMPTZ;
  v_slot RECORD;
  v_held_until TIMESTAMPTZ;
  v_hours NUMERIC;
  v_next_booked TIMESTAMPTZ;
  v_requested TSRANGE;
BEGIN
  -- The session, and the row that holds the station for it. Locked so two
  -- people cannot extend the same booking onto two different windows.
  SELECT b.checked_in_at, s.id AS slot_id, s.device_id, s.slot_date,
         s.slot_start_time, s.device_type
  INTO v_slot
  FROM public.bookings b
  JOIN public.booking_device_slots s ON s.booking_id = b.id
  WHERE b.id = p_booking_id
    AND b.status = 'checked_in'
    AND b.billed_on_actual_time = true
    AND b.checked_in_at IS NOT NULL
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_started := v_slot.checked_in_at;

  IF p_planned_end IS NULL THEN
    /**
     * Taking the plan off goes back to the placeholder - but clamped to whatever
     * is booked next on this station rather than refused if it collides.
     *
     * Refusing was the first attempt and it is wrong: the hours this session
     * freed may well have been sold while the plan was shorter, and a desk that
     * cannot un-say a mistaken finish is left with a station that goes back on
     * sale at a time nobody believes. Removing the plan is a statement that
     * nobody knows when they are leaving, which is true whether or not somebody
     * else has a booking at nine.
     *
     * So the hold runs to the placeholder or to the next booking on the station,
     * whichever comes first, and never behind the time already played. The
     * overrun that may follow is the floor's problem, exactly as it is for a
     * fixed slot somebody will not get up from.
     */
    v_held_until := v_started + (p_provisional_hours || ' hours')::INTERVAL;

    SELECT MIN((bds.slot_date + bds.slot_start_time) AT TIME ZONE v_zone)
    INTO v_next_booked
    FROM public.booking_device_slots bds
    JOIN public.bookings b ON b.id = bds.booking_id
    WHERE bds.device_id = v_slot.device_id
      AND bds.booking_id <> p_booking_id
      AND b.status IN ('locked', 'confirmed', 'checked_in')
      AND (b.status <> 'locked' OR b.lock_expires_at > NOW())
      AND bds.slot_date BETWEEN v_slot.slot_date - 1 AND v_slot.slot_date + 1
      AND (bds.slot_date + bds.slot_start_time) AT TIME ZONE v_zone > v_started;

    IF v_next_booked IS NOT NULL AND v_next_booked < v_held_until THEN
      v_held_until := v_next_booked;
    END IF;

    -- A station cannot be released into the past: whatever else is true, this
    -- customer has been on it since check-in.
    IF v_held_until < v_now THEN
      v_held_until := v_now;
    END IF;

    v_hours := EXTRACT(EPOCH FROM (v_held_until - v_started)) / 3600.0;
  ELSE
    -- Built on the day the session started, so a plan changed at 12:10 AM for a
    -- session that began at 11:50 PM resolves against its own evening.
    v_held_until := ((v_started AT TIME ZONE v_zone)::DATE + p_planned_end) AT TIME ZONE v_zone;

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

    v_hours := EXTRACT(EPOCH FROM (v_held_until - v_started)) / 3600.0;
  END IF;

  -- Serialise against `assign_device_slot` for this device type and date, using
  -- the same key it locks on, so an extension and a booking of the hours being
  -- extended into cannot both decide they are fine.
  PERFORM pg_advisory_xact_lock(
    hashtext(
      (SELECT d.device_type_id::TEXT FROM public.devices d WHERE d.id = v_slot.device_id)
      || ':' || v_slot.slot_date::TEXT
    )
  );

  v_requested := tsrange(
    v_slot.slot_date + v_slot.slot_start_time,
    (v_slot.slot_date + v_slot.slot_start_time) + (v_hours || ' hours')::INTERVAL
  );

  -- Anybody else already holding this station inside the new window. Only this
  -- station matters: the customer is sitting at it and is not being moved.
  --
  -- Only for a stated finish. Removing the plan has already clamped itself to
  -- the next booking above, and must not be refusable - a desk that cannot take
  -- a wrong finish off would be stuck with it.
  IF p_planned_end IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.booking_device_slots bds
    JOIN public.bookings b ON b.id = bds.booking_id
    WHERE bds.device_id = v_slot.device_id
      AND bds.booking_id <> p_booking_id
      AND b.status IN ('locked', 'confirmed', 'checked_in')
      AND (b.status <> 'locked' OR b.lock_expires_at > NOW())
      AND bds.slot_date BETWEEN v_slot.slot_date - 1 AND v_slot.slot_date + 1
      AND tsrange(
            bds.slot_date + bds.slot_start_time,
            (bds.slot_date + bds.slot_start_time) + CASE
              WHEN bds.slot_end_time > bds.slot_start_time
                THEN (bds.slot_end_time - bds.slot_start_time)
              ELSE (bds.slot_end_time - bds.slot_start_time) + INTERVAL '24 hours'
            END
          ) && v_requested
  ) THEN
    RAISE EXCEPTION
      'That station is booked before the new finish time'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  UPDATE public.bookings
  SET walk_in_planned_end = CASE WHEN p_planned_end IS NULL THEN NULL ELSE v_held_until END,
      updated_at = v_now
  WHERE id = p_booking_id;

  UPDATE public.booking_device_slots
  SET slot_end_time = (v_held_until AT TIME ZONE v_zone)::TIME,
      duration_hours = ROUND(v_hours::NUMERIC, 2)
  WHERE id = v_slot.slot_id;

  held_until := v_held_until;
  station_number := (
    SELECT d.station_number FROM public.devices d WHERE d.id = v_slot.device_id
  );
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.set_walkin_planned_end IS 'Changes when a live walk-in is expected to finish, or removes the plan with NULL. Rewrites the slot row to the new window under the same advisory lock assign_device_slot uses, and refuses if that window runs into another booking on the station. Prices nothing: the bill is still worked out at checkout from the time actually played. Returns zero rows when the booking is not a session in progress.';

GRANT EXECUTE ON FUNCTION public.set_walkin_planned_end TO service_role;

-- ================================================
-- 2. THE PLAN IS SPENT AT CHECKOUT
-- ================================================
-- Everything that reads `walk_in_planned_end` already ignores it once the
-- booking is not `checked_in`, so this changes no behaviour today. It stops the
-- row *saying* something that was never true: they were expected at nine and
-- left at half past ten, and only the second of those is what they paid for.
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
      walk_in_planned_end = NULL,
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

COMMENT ON FUNCTION public.checkout_walkin_session IS 'Ends a walk-in session, stamping completed_at from the database clock and clearing any planned end, which is spent once the real times exist. Returns the played window so the caller can price it. Zero rows when the session is not in progress.';

GRANT EXECUTE ON FUNCTION public.checkout_walkin_session TO service_role;

NOTIFY pgrst, 'reload schema';
