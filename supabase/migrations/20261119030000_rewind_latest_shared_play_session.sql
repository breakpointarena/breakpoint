CREATE OR REPLACE FUNCTION public.delete_latest_shared_play_session_and_resume_previous(
  p_booking_id UUID,
  p_latest_start TIMESTAMPTZ,
  p_latest_end TIMESTAMPTZ,
  p_latest_participant_ids UUID[],
  p_previous_start TIMESTAMPTZ,
  p_previous_end TIMESTAMPTZ,
  p_previous_participant_ids UUID[],
  p_created_by UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_latest_participants UUID[];
  v_previous_participants UUID[];
  v_latest_end TIMESTAMPTZ;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_change_id UUID;
  v_before_periods JSONB;
  v_after_periods JSONB;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_booking.status <> 'checked_in'
     OR v_booking.completed_at IS NOT NULL
     OR v_booking.billed_on_actual_time IS DISTINCT FROM TRUE
     OR v_booking.shared_play_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'This shared-play booking is no longer active';
  END IF;
  IF p_latest_start IS NULL OR p_latest_end IS NULL OR p_latest_start >= p_latest_end
     OR p_previous_start IS NULL OR p_previous_end IS NULL OR p_previous_start >= p_previous_end
     OR p_previous_end > p_latest_start
     OR cardinality(COALESCE(p_latest_participant_ids, ARRAY[]::UUID[])) = 0
     OR cardinality(COALESCE(p_previous_participant_ids, ARRAY[]::UUID[])) = 0 THEN
    RAISE EXCEPTION 'A completed play interval and its previous players are required';
  END IF;

  PERFORM 1
  FROM public.shared_play_participants
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.shared_play_participants
    WHERE booking_id = p_booking_id
      AND (checked_out_at IS NOT NULL OR settled_amount > 0)
  ) THEN
    RAISE EXCEPTION 'This session cannot be rewound after a participant has checked out';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.shared_play_periods pp
    JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
    WHERE sp.booking_id = p_booking_id AND pp.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Sit all players out before deleting the last play interval';
  END IF;

  SELECT max(pp.ended_at) INTO v_latest_end
  FROM public.shared_play_periods pp
  JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
  WHERE sp.booking_id = p_booking_id;
  IF v_latest_end IS DISTINCT FROM p_latest_end THEN
    RAISE EXCEPTION 'The play session changed. Refresh before deleting an interval';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shared_play_periods pp
    JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
    WHERE sp.booking_id = p_booking_id
      AND ((pp.started_at > p_latest_start AND pp.started_at < p_latest_end)
        OR (pp.ended_at > p_latest_start AND pp.ended_at < p_latest_end))
  ) THEN
    RAISE EXCEPTION 'The latest play interval has changed. Refresh before deleting it';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sp.id ORDER BY sp.id), ARRAY[]::UUID[])
  INTO v_latest_participants
  FROM public.shared_play_periods pp
  JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
  WHERE sp.booking_id = p_booking_id
    AND pp.started_at <= p_latest_start
    AND pp.ended_at >= p_latest_end;

  SELECT COALESCE(array_agg(DISTINCT sp.id ORDER BY sp.id), ARRAY[]::UUID[])
  INTO v_previous_participants
  FROM public.shared_play_periods pp
  JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
  WHERE sp.booking_id = p_booking_id
    AND pp.started_at <= p_previous_start
    AND pp.ended_at >= p_previous_end;

  IF v_latest_participants IS DISTINCT FROM ARRAY(
       SELECT DISTINCT ids.participant_id FROM unnest(p_latest_participant_ids) AS ids(participant_id) ORDER BY ids.participant_id
     ) THEN
    RAISE EXCEPTION 'The latest play interval changed. Refresh before deleting it';
  END IF;
  IF v_previous_participants IS DISTINCT FROM ARRAY(
       SELECT DISTINCT ids.participant_id FROM unnest(p_previous_participant_ids) AS ids(participant_id) ORDER BY ids.participant_id
     ) THEN
    RAISE EXCEPTION 'The previous players changed. Refresh before resuming them';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(pp) ORDER BY pp.id), '[]'::JSONB)
  INTO v_before_periods
  FROM public.shared_play_periods pp
  JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
  WHERE sp.booking_id = p_booking_id;

  INSERT INTO public.shared_play_change_history (
    booking_id, action_label, before_shared_play_enabled, before_periods, created_by
  ) VALUES (
    p_booking_id, 'Sit in', TRUE, v_before_periods, p_created_by
  ) RETURNING id INTO v_change_id;

  UPDATE public.shared_play_periods pp
  SET ended_at = p_latest_start
  FROM public.shared_play_participants sp
  WHERE pp.participant_id = sp.id
    AND sp.booking_id = p_booking_id
    AND sp.id = ANY(v_latest_participants)
    AND pp.started_at < p_latest_start
    AND pp.ended_at > p_latest_start;

  DELETE FROM public.shared_play_periods pp
  USING public.shared_play_participants sp
  WHERE pp.participant_id = sp.id
    AND sp.booking_id = p_booking_id
    AND sp.id = ANY(v_latest_participants)
    AND pp.started_at >= p_latest_start
    AND pp.started_at < p_latest_end;

  INSERT INTO public.shared_play_periods (
    participant_id, started_at, hourly_rate, extra_player_rate, included_players
  )
  SELECT previous.id, v_now, prior.hourly_rate, prior.extra_player_rate, prior.included_players
  FROM unnest(v_previous_participants) AS previous_ids(id)
  JOIN public.shared_play_participants previous ON previous.id = previous_ids.id
  LEFT JOIN LATERAL (
    SELECT pp.hourly_rate, pp.extra_player_rate, pp.included_players
    FROM public.shared_play_periods pp
    WHERE pp.participant_id = previous.id
      AND pp.started_at <= p_previous_start
      AND pp.ended_at >= p_previous_end
    ORDER BY pp.started_at DESC, pp.id DESC
    LIMIT 1
  ) prior ON TRUE;

  UPDATE public.bookings
  SET shared_play_enabled = TRUE,
      updated_at = v_now
  WHERE id = p_booking_id;

  UPDATE public.shared_play_change_history
  SET undone_at = v_now
  WHERE booking_id = p_booking_id
    AND id <> v_change_id
    AND undone_at IS NULL;

  SELECT COALESCE(jsonb_agg(to_jsonb(pp) ORDER BY pp.id), '[]'::JSONB)
  INTO v_after_periods
  FROM public.shared_play_periods pp
  JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
  WHERE sp.booking_id = p_booking_id;

  UPDATE public.shared_play_change_history
  SET after_periods = v_after_periods
  WHERE id = v_change_id;

  RETURN 'Previous players resumed';
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_latest_shared_play_session_and_resume_previous(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_latest_shared_play_session_and_resume_previous(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID)
  TO service_role;

NOTIFY pgrst, 'reload schema';
