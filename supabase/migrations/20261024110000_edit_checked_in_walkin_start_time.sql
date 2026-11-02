-- Correct the recorded start time on an active walk-in without creating a new
-- booking or device-slot row.
CREATE OR REPLACE FUNCTION public.change_checked_in_walkin_start_v1(
  p_booking_id UUID,
  p_started_clock TIME
)
RETURNS TABLE (checked_in_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_slot public.booking_device_slots%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_zone TEXT := 'Asia/Kolkata';
  v_started TIMESTAMPTZ;
  v_held_until TIMESTAMPTZ;
  v_requested TSRANGE;
  v_local_start TIMESTAMP;
  v_local_end TIMESTAMP;
  v_duration NUMERIC;
  v_slot_date DATE;
  v_slot_start TIME;
  v_slot_end TIME;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_booking.status <> 'checked_in'
     OR v_booking.billed_on_actual_time IS DISTINCT FROM TRUE
     OR v_booking.checked_in_at IS NULL
     OR v_booking.completed_at IS NOT NULL
     OR v_booking.shared_play_enabled IS TRUE THEN
    RAISE EXCEPTION 'Only an active, non-shared walk-in session can change its start time';
  END IF;

  SELECT * INTO v_slot
  FROM public.booking_device_slots
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND OR (SELECT count(*) FROM public.booking_device_slots WHERE booking_id = p_booking_id) <> 1 THEN
    RAISE EXCEPTION 'This session must have exactly one device slot';
  END IF;

  -- Resolve the time against the arena's local day; a later clock reading means
  -- the previous evening, as with the existing walk-in start-time entry.
  v_started := ((v_now AT TIME ZONE v_zone)::DATE + p_started_clock) AT TIME ZONE v_zone;
  IF v_started > v_now THEN
    v_started := v_started - INTERVAL '1 day';
  END IF;
  IF v_started < v_now - INTERVAL '6 hours' THEN
    RAISE EXCEPTION 'A start time has to be within the last 6 hours';
  END IF;

  v_held_until := CASE
    WHEN v_booking.walk_in_planned_end IS NOT NULL
      AND v_booking.walk_in_planned_end > v_now
      AND v_booking.walk_in_planned_end > v_started
      THEN v_booking.walk_in_planned_end
    ELSE v_started + INTERVAL '12 hours'
  END;
  v_local_start := v_started AT TIME ZONE v_zone;
  v_local_end := v_held_until AT TIME ZONE v_zone;
  v_requested := tsrange(v_local_start, v_local_end, '[)');

  -- Refuse a corrected interval that overlaps another booking on the same
  -- station. Include completed rows too, since their historical play time still
  -- cannot overlap this session.
  IF EXISTS (
    SELECT 1
    FROM public.booking_device_slots other_slot
    JOIN public.bookings other_booking ON other_booking.id = other_slot.booking_id
    WHERE other_slot.device_id = v_slot.device_id
      AND other_booking.id <> p_booking_id
      AND other_booking.status NOT IN ('cancelled', 'expired')
      AND (other_booking.status <> 'locked' OR other_booking.lock_expires_at > v_now)
      AND tsrange(
        other_slot.slot_date + other_slot.slot_start_time,
        GREATEST(
          (other_slot.slot_date + other_slot.slot_start_time) + CASE
            WHEN other_slot.slot_end_time > other_slot.slot_start_time
              THEN other_slot.slot_end_time - other_slot.slot_start_time
            ELSE other_slot.slot_end_time - other_slot.slot_start_time + INTERVAL '24 hours'
          END,
          CASE
            WHEN other_booking.billed_on_actual_time
             AND other_booking.status = 'checked_in'
             AND other_booking.checked_in_at IS NOT NULL
             AND NOT (
               other_booking.walk_in_planned_end IS NOT NULL
               AND other_booking.walk_in_planned_end > v_now
             )
            THEN (other_booking.checked_in_at AT TIME ZONE v_zone) + INTERVAL '12 hours'
          END
        ),
        '[)'
      ) && v_requested
  ) THEN
    RAISE EXCEPTION 'That start time overlaps another booking on this station';
  END IF;

  v_slot_date := v_local_start::DATE;
  v_slot_start := v_local_start::TIME;
  v_slot_end := v_local_end::TIME;
  v_duration := EXTRACT(EPOCH FROM (v_held_until - v_started)) / 3600.0;

  UPDATE public.bookings
  SET checked_in_at = v_started,
      updated_at = v_now
  WHERE id = p_booking_id;

  UPDATE public.booking_device_slots
  SET slot_date = v_slot_date,
      slot_start_time = v_slot_start,
      slot_end_time = v_slot_end,
      duration_hours = v_duration,
      slot_total = 0,
      extra_players_total = 0
  WHERE id = v_slot.id;

  RETURN QUERY SELECT v_started;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.change_checked_in_walkin_start_v1(UUID, TIME) TO service_role;
NOTIFY pgrst, 'reload schema';
