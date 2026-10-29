-- Let staff move an active shared-play booking to another device type while
-- keeping every existing price and billing snapshot on its booking slot intact.
CREATE OR REPLACE FUNCTION public.change_checked_in_shared_play_device_v1(
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
  v_active_players INTEGER;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_booking.status <> 'checked_in'
     OR v_booking.billed_on_actual_time IS DISTINCT FROM FALSE
     OR v_booking.shared_play_enabled IS DISTINCT FROM TRUE
     OR v_booking.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active shared-play booking can change device';
  END IF;

  SELECT * INTO v_slot
  FROM public.booking_device_slots
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND OR (SELECT count(*) FROM public.booking_device_slots WHERE booking_id = p_booking_id) <> 1 THEN
    RAISE EXCEPTION 'This session must have exactly one device slot';
  END IF;

  SELECT count(*)::INTEGER INTO v_active_players
  FROM public.shared_play_periods pp
  JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
  WHERE sp.booking_id = p_booking_id
    AND sp.checked_out_at IS NULL
    AND pp.ended_at IS NULL;

  IF v_active_players < 1 THEN
    RAISE EXCEPTION 'At least one player must be active to change device';
  END IF;

  SELECT * INTO v_type
  FROM public.device_types
  WHERE id = p_device_type_id
    AND is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That device type is not available';
  END IF;

  IF GREATEST(v_slot.player_count, v_active_players) > v_type.max_players THEN
    RAISE EXCEPTION 'This device supports up to % players', v_type.max_players;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.id = v_slot.device_id
      AND d.device_type_id = p_device_type_id
  ) THEN
    RAISE EXCEPTION 'Choose a different device type';
  END IF;

  -- Reuse the existing slot window, and pass through the original price
  -- snapshot. The temporary row exists only so the allocator can lock and
  -- claim a free station; none of its price values are copied back.
  SELECT * INTO v_assignment
  FROM public.assign_device_slot(
    p_booking_id,
    p_device_type_id,
    v_slot.slot_date,
    v_slot.slot_start_time,
    v_slot.slot_end_time,
    v_slot.duration_hours,
    v_slot.hourly_rate,
    v_slot.slot_total,
    v_type.display_name,
    v_slot.player_count,
    v_slot.included_players,
    v_slot.extra_player_charge,
    v_slot.extra_players_total
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

  -- Only the physical assignment changes. Rate, duration, totals, discounts,
  -- participant history, payments, and food remain exactly as they were.
  UPDATE public.booking_device_slots
  SET device_id = v_new_slot.device_id,
      device_type = v_type.display_name,
      device_station_number = v_new_slot.device_station_number
  WHERE id = v_slot.id;

  RETURN QUERY SELECT v_assignment.station_number::TEXT, v_type.display_name::TEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.change_checked_in_shared_play_device_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_checked_in_shared_play_device_v1(UUID, UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
