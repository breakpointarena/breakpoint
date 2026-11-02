CREATE OR REPLACE FUNCTION public.set_shared_play_participants(
  p_booking_id UUID,
  p_enabled BOOLEAN,
  p_roster_names TEXT[],
  p_active_names TEXT[]
)
RETURNS VOID LANGUAGE plpgsql AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_booking public.bookings%ROWTYPE;
  v_device_type_name TEXT;
  v_device_display_name TEXT;
  v_max_players INTEGER;
  v_name TEXT;
  v_participant_id UUID;
  v_slot_count INTEGER;
  v_started_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF v_booking.status <> 'checked_in' OR v_booking.billed_on_actual_time IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Shared play is only available during an active walk-in session';
  END IF;
  IF v_booking.walk_in_device_type_id IS NULL THEN
    RAISE EXCEPTION 'Shared play requires a standard device session';
  END IF;

  SELECT name, display_name, max_players
  INTO v_device_type_name, v_device_display_name, v_max_players
  FROM public.device_types
  WHERE id = v_booking.walk_in_device_type_id;
  IF v_device_type_name IS NULL
     OR v_device_type_name IN ('fi_simulator', 'other')
     OR lower(v_device_display_name) = 'fi simulator' THEN
    RAISE EXCEPTION 'Shared play is not available for this device type';
  END IF;

  SELECT count(*) INTO v_slot_count
  FROM public.booking_device_slots
  WHERE booking_id = p_booking_id;
  IF v_slot_count <> 1 THEN
    RAISE EXCEPTION 'Shared play requires a booking with one board';
  END IF;
  IF cardinality(COALESCE(p_active_names, ARRAY[]::TEXT[])) > COALESCE(v_max_players, 10) THEN
    RAISE EXCEPTION 'Active participants exceed the device maximum of %', COALESCE(v_max_players, 10);
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_roster_names, ARRAY[]::TEXT[])) AS n
    WHERE NULLIF(btrim(n), '') IS NULL
  ) OR EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_active_names, ARRAY[]::TEXT[])) AS n
    WHERE NULLIF(btrim(n), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Participant names cannot be empty';
  END IF;

  FOREACH v_name IN ARRAY COALESCE(p_roster_names, ARRAY[]::TEXT[]) LOOP
    INSERT INTO public.shared_play_participants (booking_id, name)
    VALUES (p_booking_id, btrim(v_name))
    ON CONFLICT (booking_id, lower(name)) DO NOTHING;
  END LOOP;
  FOREACH v_name IN ARRAY COALESCE(p_active_names, ARRAY[]::TEXT[]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.shared_play_participants
      WHERE booking_id = p_booking_id AND lower(name) = lower(btrim(v_name))
    ) THEN
      RAISE EXCEPTION 'Every active player must be on the participant list';
    END IF;
  END LOOP;

  UPDATE public.bookings SET shared_play_enabled = p_enabled WHERE id = p_booking_id;

  UPDATE public.shared_play_periods pp SET ended_at = v_now
  FROM public.shared_play_participants p
  WHERE pp.participant_id = p.id AND p.booking_id = p_booking_id
    AND pp.ended_at IS NULL
    AND (NOT p_enabled OR lower(p.name) <> ALL (
      SELECT lower(btrim(n)) FROM unnest(COALESCE(p_active_names, ARRAY[]::TEXT[])) AS n
    ));

  IF p_enabled THEN
    FOREACH v_name IN ARRAY COALESCE(p_active_names, ARRAY[]::TEXT[]) LOOP
      SELECT id INTO v_participant_id
      FROM public.shared_play_participants
      WHERE booking_id = p_booking_id AND lower(name) = lower(btrim(v_name));

      v_started_at := v_now;
      IF NOT v_booking.shared_play_enabled
         AND lower(btrim(v_name)) = lower(COALESCE(NULLIF(btrim(v_booking.customer_name), ''), 'Player 1')) THEN
        v_started_at := v_booking.checked_in_at;
      END IF;

      INSERT INTO public.shared_play_periods (participant_id, started_at)
      SELECT v_participant_id, v_started_at
      WHERE NOT EXISTS (
        SELECT 1 FROM public.shared_play_periods pp
        WHERE pp.participant_id = v_participant_id AND pp.ended_at IS NULL
      );
    END LOOP;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_shared_play_participants(UUID, BOOLEAN, TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_shared_play_participants(UUID, BOOLEAN, TEXT[], TEXT[]) TO service_role;
