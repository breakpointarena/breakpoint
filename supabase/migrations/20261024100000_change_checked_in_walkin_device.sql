-- Let staff correct the device type on an active, actual-time walk-in session.
-- Checkout reads the rate snapshot from booking_device_slots, so updating that
-- same slot row also makes the corrected device's rate apply to the session.
CREATE OR REPLACE FUNCTION public.change_checked_in_walkin_device_v1(
  p_booking_id UUID,
  p_device_type_id UUID
)
RETURNS TABLE (station_number TEXT, device_type_name TEXT)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_slot public.booking_device_slots%ROWTYPE;
  v_type public.device_types%ROWTYPE;
  v_assignment RECORD;
  v_new_slot public.booking_device_slots%ROWTYPE;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_date DATE;
  v_start_time TIME;
  v_end_time TIME;
  v_duration NUMERIC;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_booking.status <> 'checked_in'
     OR v_booking.billed_on_actual_time IS DISTINCT FROM TRUE
     OR v_booking.completed_at IS NOT NULL
     OR v_booking.shared_play_enabled IS TRUE THEN
    RAISE EXCEPTION 'Only an active, non-shared walk-in session can change device';
  END IF;

  SELECT * INTO v_slot
  FROM public.booking_device_slots
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND OR (SELECT count(*) FROM public.booking_device_slots WHERE booking_id = p_booking_id) <> 1 THEN
    RAISE EXCEPTION 'This session must have exactly one device slot';
  END IF;

  SELECT * INTO v_type
  FROM public.device_types
  WHERE id = p_device_type_id
    AND is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That device type is not available';
  END IF;

  IF v_slot.player_count > v_type.max_players THEN
    RAISE EXCEPTION 'This device supports up to % players', v_type.max_players;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.id = v_slot.device_id
      AND d.device_type_id = p_device_type_id
  ) THEN
    RAISE EXCEPTION 'Choose a different device type';
  END IF;

  v_start := v_booking.checked_in_at;
  v_end := CASE
    WHEN v_booking.walk_in_planned_end IS NOT NULL
      AND v_booking.walk_in_planned_end > NOW()
      THEN v_booking.walk_in_planned_end
    ELSE v_start + INTERVAL '12 hours'
  END;
  v_date := (v_start AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_start_time := (v_start AT TIME ZONE 'Asia/Kolkata')::TIME;
  v_end_time := (v_end AT TIME ZONE 'Asia/Kolkata')::TIME;
  v_duration := EXTRACT(EPOCH FROM (v_end - v_start)) / 3600.0;

  -- The allocator checks and locks a free station of the new type. It briefly
  -- inserts a slot for this same booking; below, its station and rate are copied
  -- onto the existing slot row and the temporary row is removed.
  SELECT * INTO v_assignment
  FROM public.assign_device_slot(
    p_booking_id,
    p_device_type_id,
    v_date,
    v_start_time,
    v_end_time,
    v_duration,
    v_type.regular_hourly_rate,
    0,
    v_type.display_name,
    v_slot.player_count,
    v_type.included_players,
    v_type.extra_player_charge,
    0
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No station of this device type is free for this session';
  END IF;

  SELECT * INTO v_new_slot
  FROM public.booking_device_slots
  WHERE booking_id = p_booking_id
    AND id <> v_slot.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not prepare the device change';
  END IF;

  DELETE FROM public.booking_device_slots WHERE id = v_new_slot.id;

  UPDATE public.booking_device_slots
  SET device_id = v_new_slot.device_id,
      slot_date = v_new_slot.slot_date,
      slot_start_time = v_new_slot.slot_start_time,
      slot_end_time = v_new_slot.slot_end_time,
      duration_hours = v_new_slot.duration_hours,
      hourly_rate = v_new_slot.hourly_rate,
      slot_total = v_new_slot.slot_total,
      device_type = v_new_slot.device_type,
      device_station_number = v_new_slot.device_station_number,
      player_count = v_new_slot.player_count,
      included_players = v_new_slot.included_players,
      extra_player_charge = v_new_slot.extra_player_charge,
      extra_players_total = v_new_slot.extra_players_total
  WHERE id = v_slot.id;

  UPDATE public.bookings
  SET walk_in_device_type_id = p_device_type_id,
      walk_in_device_type_name = v_type.display_name,
      updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN QUERY SELECT v_assignment.station_number::TEXT, v_type.display_name::TEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.change_checked_in_walkin_device_v1(UUID, UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
