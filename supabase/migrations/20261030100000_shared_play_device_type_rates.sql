-- Let staff move a supported active shared-play booking to another supported
-- device type. The new device's pricing applies to the session's shared-play
-- calculation and the participant capacity is checked before moving it.
ALTER TABLE public.shared_play_periods
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS extra_player_rate NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS included_players INTEGER;

-- Existing play periods happened on the booking's current device. Snapshot its
-- configured rates so a later device change does not reprice the elapsed time.
UPDATE public.shared_play_periods pp
SET hourly_rate = COALESCE(pp.hourly_rate, bds.hourly_rate),
    extra_player_rate = COALESCE(pp.extra_player_rate, bds.extra_player_charge),
    included_players = COALESCE(pp.included_players, bds.included_players)
FROM public.shared_play_participants sp
JOIN public.booking_device_slots bds ON bds.booking_id = sp.booking_id
WHERE pp.participant_id = sp.id
  AND (pp.hourly_rate IS NULL OR pp.extra_player_rate IS NULL OR pp.included_players IS NULL);

CREATE OR REPLACE FUNCTION public.snapshot_shared_play_period_rates_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_hourly_rate NUMERIC(10, 2);
  v_extra_player_rate NUMERIC(10, 2);
  v_included_players INTEGER;
BEGIN
  SELECT bds.hourly_rate, bds.extra_player_charge, bds.included_players
  INTO v_hourly_rate, v_extra_player_rate, v_included_players
  FROM public.shared_play_participants sp
  JOIN public.booking_device_slots bds ON bds.booking_id = sp.booking_id
  WHERE sp.id = NEW.participant_id
  LIMIT 1;

  NEW.hourly_rate := COALESCE(NEW.hourly_rate, v_hourly_rate);
  NEW.extra_player_rate := COALESCE(NEW.extra_player_rate, v_extra_player_rate);
  NEW.included_players := COALESCE(NEW.included_players, v_included_players);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS snapshot_shared_play_period_rates_v1 ON public.shared_play_periods;
CREATE TRIGGER snapshot_shared_play_period_rates_v1
BEFORE INSERT ON public.shared_play_periods
FOR EACH ROW EXECUTE FUNCTION public.snapshot_shared_play_period_rates_v1();

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
     OR v_booking.billed_on_actual_time IS DISTINCT FROM TRUE
     OR v_booking.shared_play_enabled IS DISTINCT FROM TRUE
     OR v_booking.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active shared-play walk-in can change device';
  END IF;

  SELECT * INTO v_slot
  FROM public.booking_device_slots
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND OR (SELECT count(*) FROM public.booking_device_slots WHERE booking_id = p_booking_id) <> 1 THEN
    RAISE EXCEPTION 'This session must have exactly one device slot';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.devices d
    JOIN public.device_types current_type ON current_type.id = d.device_type_id
    WHERE d.id = v_slot.device_id
      AND current_type.name IN ('standard_snooker', 'medium_snooker', 'american_pool')
  ) THEN
    RAISE EXCEPTION 'Shared-play device changes are only available for Standard Snooker, Medium Snooker, and American Pool';
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
    AND is_active IS TRUE
    AND name IN ('standard_snooker', 'medium_snooker', 'american_pool');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose Standard Snooker, Medium Snooker, or American Pool';
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

  -- Reuse the existing slot window. The allocator inserts a temporary slot
  -- that is removed after claiming a station; the target device's rates are
  -- copied to the session below.
  SELECT * INTO v_assignment
  FROM public.assign_device_slot(
    p_booking_id,
    p_device_type_id,
    v_slot.slot_date,
    v_slot.slot_start_time,
    v_slot.slot_end_time,
    v_slot.duration_hours,
    v_type.regular_hourly_rate,
    0,
    v_type.display_name,
    v_slot.player_count,
    v_type.included_players,
    v_type.extra_player_charge,
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

  -- Recalculate the whole unsettled shared-play session at the newly selected
  -- device's rates. A participant who has already checked out keeps their
  -- settled amount and historical rates unchanged.
  UPDATE public.booking_device_slots
  SET device_id = v_new_slot.device_id,
      device_type = v_type.display_name,
      device_station_number = v_new_slot.device_station_number,
      hourly_rate = v_type.regular_hourly_rate,
      included_players = v_type.included_players,
      extra_player_charge = v_type.extra_player_charge
  WHERE id = v_slot.id;

  UPDATE public.bookings
  SET walk_in_device_type_id = p_device_type_id,
      walk_in_device_type_name = v_type.display_name,
      updated_at = NOW()
  WHERE id = p_booking_id;

  UPDATE public.shared_play_periods pp
  SET hourly_rate = v_type.regular_hourly_rate,
      extra_player_rate = v_type.extra_player_charge,
      included_players = v_type.included_players
  FROM public.shared_play_participants sp
  WHERE pp.participant_id = sp.id
    AND sp.booking_id = p_booking_id
    AND sp.checked_out_at IS NULL
    AND sp.settled_amount = 0;

  RETURN QUERY SELECT v_assignment.station_number::TEXT, v_type.display_name::TEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.change_checked_in_shared_play_device_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_checked_in_shared_play_device_v1(UUID, UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
