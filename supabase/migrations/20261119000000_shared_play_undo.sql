CREATE TABLE IF NOT EXISTS public.shared_play_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  action_label TEXT NOT NULL CHECK (action_label IN ('Sit in', 'Sit out')),
  before_shared_play_enabled BOOLEAN NOT NULL,
  before_periods JSONB NOT NULL,
  after_periods JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shared_play_change_history_latest_idx
  ON public.shared_play_change_history (booking_id, created_at DESC)
  WHERE undone_at IS NULL AND after_periods IS NOT NULL;

ALTER TABLE public.shared_play_change_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages shared-play change history" ON public.shared_play_change_history;
CREATE POLICY "Service role manages shared-play change history"
  ON public.shared_play_change_history FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.shared_play_change_history FROM anon, authenticated;
GRANT ALL ON public.shared_play_change_history TO service_role;

CREATE OR REPLACE FUNCTION public.undo_latest_shared_play_change(p_booking_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_change public.shared_play_change_history%ROWTYPE;
  v_current_periods JSONB;
  v_expected_periods JSONB;
  v_checked_out_periods_before JSONB;
  v_checked_out_periods_after JSONB;
  v_checked_out_participant UUID;
  v_has_checked_out_participants BOOLEAN;
  v_latest_boundary TIMESTAMPTZ;
  v_started_at_boundary INTEGER;
  v_ended_at_boundary INTEGER;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF v_booking.status <> 'checked_in'
     OR v_booking.completed_at IS NOT NULL
     OR v_booking.billed_on_actual_time IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Undo is available only during an active play session';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.shared_play_participants
    WHERE booking_id = p_booking_id AND checked_out_at IS NOT NULL
  ) INTO v_has_checked_out_participants;

  SELECT * INTO v_change
  FROM public.shared_play_change_history
  WHERE booking_id = p_booking_id
    AND undone_at IS NULL
    AND after_periods IS NOT NULL
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    IF v_has_checked_out_participants THEN
      RAISE EXCEPTION 'This older play change cannot be safely undone after a participant checkout';
    END IF;
    -- Older active sessions predate the undo log. Their most recent unambiguous
    -- boundary can still be reversed: remove a newly opened period, or reopen
    -- periods closed by a sit-out. Ambiguous same-time sit-in/out changes are
    -- deliberately refused rather than guessing at a player's previous state.
    SELECT max(boundary_at) INTO v_latest_boundary
    FROM (
      SELECT pp.started_at AS boundary_at
      FROM public.shared_play_periods pp
      JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
      WHERE sp.booking_id = p_booking_id
      UNION ALL
      SELECT pp.ended_at AS boundary_at
      FROM public.shared_play_periods pp
      JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
      WHERE sp.booking_id = p_booking_id AND pp.ended_at IS NOT NULL
    ) boundaries;
    IF v_latest_boundary IS NULL THEN
      RAISE EXCEPTION 'There is no Sit in or Sit out change to undo';
    END IF;

    SELECT count(*) FILTER (WHERE pp.started_at = v_latest_boundary)::INTEGER,
           count(*) FILTER (WHERE pp.ended_at = v_latest_boundary)::INTEGER
    INTO v_started_at_boundary, v_ended_at_boundary
    FROM public.shared_play_periods pp
    JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
    WHERE sp.booking_id = p_booking_id;

    IF v_started_at_boundary > 0 AND v_ended_at_boundary = 0 THEN
      IF v_latest_boundary = v_booking.checked_in_at AND NOT EXISTS (
        SELECT 1
        FROM public.shared_play_periods pp
        JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
        WHERE sp.booking_id = p_booking_id AND pp.ended_at IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'The initial play period cannot be undone as a sit-in change';
      END IF;
      DELETE FROM public.shared_play_periods pp
      USING public.shared_play_participants sp
      WHERE pp.participant_id = sp.id
        AND sp.booking_id = p_booking_id
        AND pp.started_at = v_latest_boundary;
      RETURN 'Sit in';
    ELSIF v_ended_at_boundary > 0 AND v_started_at_boundary = 0 THEN
      UPDATE public.shared_play_periods pp
      SET ended_at = NULL
      FROM public.shared_play_participants sp
      WHERE pp.participant_id = sp.id
        AND sp.booking_id = p_booking_id
        AND pp.ended_at = v_latest_boundary;
      RETURN 'Sit out';
    ELSE
      RAISE EXCEPTION 'The latest play change is ambiguous and cannot be safely undone';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(pp) ORDER BY pp.id), '[]'::JSONB)
  INTO v_current_periods
  FROM public.shared_play_periods pp
  JOIN public.shared_play_participants sp ON sp.id = pp.participant_id
  WHERE sp.booking_id = p_booking_id AND sp.checked_out_at IS NULL;

  SELECT COALESCE(jsonb_agg(to_jsonb(expected) ORDER BY expected.id), '[]'::JSONB)
  INTO v_expected_periods
  FROM jsonb_populate_recordset(NULL::public.shared_play_periods, v_change.after_periods) AS expected
  JOIN public.shared_play_participants sp ON sp.id = expected.participant_id
  WHERE sp.booking_id = p_booking_id AND sp.checked_out_at IS NULL;

  IF v_current_periods IS DISTINCT FROM v_expected_periods THEN
    RAISE EXCEPTION 'The play session changed after this action. Refresh before undoing';
  END IF;

  IF v_has_checked_out_participants THEN
    FOR v_checked_out_participant IN
      SELECT id FROM public.shared_play_participants
      WHERE booking_id = p_booking_id AND checked_out_at IS NOT NULL
    LOOP
      SELECT COALESCE(jsonb_agg(to_jsonb(before_row) ORDER BY before_row.id), '[]'::JSONB)
      INTO v_checked_out_periods_before
      FROM jsonb_populate_recordset(NULL::public.shared_play_periods, v_change.before_periods) AS before_row
      WHERE before_row.participant_id = v_checked_out_participant;

      SELECT COALESCE(jsonb_agg(to_jsonb(after_row) ORDER BY after_row.id), '[]'::JSONB)
      INTO v_checked_out_periods_after
      FROM jsonb_populate_recordset(NULL::public.shared_play_periods, v_change.after_periods) AS after_row
      WHERE after_row.participant_id = v_checked_out_participant;

      IF v_checked_out_periods_before IS DISTINCT FROM v_checked_out_periods_after THEN
        RAISE EXCEPTION 'This play change affects a participant who has checked out; their settled play time cannot be changed';
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.shared_play_periods pp
  USING public.shared_play_participants sp
  WHERE pp.participant_id = sp.id AND sp.booking_id = p_booking_id
    AND (NOT v_has_checked_out_participants OR sp.checked_out_at IS NULL);

  INSERT INTO public.shared_play_periods (
    id, participant_id, started_at, ended_at, amount,
    hourly_rate, extra_player_rate, included_players
  )
  SELECT restored.id, restored.participant_id, restored.started_at, restored.ended_at,
         restored.amount, restored.hourly_rate, restored.extra_player_rate, restored.included_players
  FROM jsonb_populate_recordset(NULL::public.shared_play_periods, v_change.before_periods) AS restored
  LEFT JOIN public.shared_play_participants sp ON sp.id = restored.participant_id
  WHERE NOT v_has_checked_out_participants OR sp.checked_out_at IS NULL;

  IF NOT v_has_checked_out_participants THEN
    UPDATE public.bookings
    SET shared_play_enabled = v_change.before_shared_play_enabled,
        updated_at = now()
    WHERE id = p_booking_id;
  END IF;

  UPDATE public.shared_play_change_history
  SET undone_at = now()
  WHERE id = v_change.id;

  RETURN v_change.action_label;
END;
$function$;

REVOKE ALL ON FUNCTION public.undo_latest_shared_play_change(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_latest_shared_play_change(UUID) TO service_role;

