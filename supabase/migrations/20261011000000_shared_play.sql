-- Shared play allocates the reserved board charge across the people playing in
-- each interval. It does not change the fixed booking's reserved-duration bill.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS shared_play_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.shared_play_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  billed_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX shared_play_participants_booking_name_idx
  ON public.shared_play_participants (booking_id, lower(name));

CREATE TABLE public.shared_play_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.shared_play_participants(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX shared_play_periods_active_idx
  ON public.shared_play_periods (participant_id) WHERE ended_at IS NULL;

ALTER TABLE public.shared_play_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_play_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages shared-play participants"
  ON public.shared_play_participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages shared-play periods"
  ON public.shared_play_periods FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.shared_play_participants, public.shared_play_periods FROM anon, authenticated;
GRANT ALL ON public.shared_play_participants, public.shared_play_periods TO service_role;

-- Start the first interval at check-in. The booking customer is the initial
-- player; staff can add other people in the Shared play panel.
CREATE OR REPLACE FUNCTION public.seed_shared_play_participant()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
DECLARE
  v_participant_id UUID;
BEGIN
  IF NOT NEW.billed_on_actual_time AND NEW.status = 'checked_in'
     AND OLD.status IS DISTINCT FROM NEW.status AND NEW.checked_in_at IS NOT NULL THEN
    INSERT INTO public.shared_play_participants (booking_id, name)
    VALUES (NEW.id, COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Player 1'))
    ON CONFLICT (booking_id, lower(name)) DO NOTHING;

    SELECT id INTO v_participant_id FROM public.shared_play_participants
    WHERE booking_id = NEW.id AND lower(name) = lower(COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Player 1'));

    INSERT INTO public.shared_play_periods (participant_id, started_at)
    SELECT v_participant_id, NEW.checked_in_at
    WHERE NOT EXISTS (
      SELECT 1 FROM public.shared_play_periods p
      WHERE p.participant_id = v_participant_id AND p.ended_at IS NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER seed_shared_play_participant_after_checkin
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.seed_shared_play_participant();

-- A single server call records who is playing at one timestamp, so each roster
-- change creates a clean boundary in the billing history.
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
  v_name TEXT;
  v_participant_id UUID;
  v_slot_count INTEGER;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.billed_on_actual_time OR v_booking.status <> 'checked_in' THEN
    RAISE EXCEPTION 'Shared play can only be changed after a standard booking starts';
  END IF;
  SELECT count(*) INTO v_slot_count FROM public.booking_device_slots WHERE booking_id = p_booking_id;
  IF v_slot_count <> 1 THEN
    RAISE EXCEPTION 'Shared play currently supports a booking with one board';
  END IF;
  IF p_enabled AND (p_active_names IS NULL OR cardinality(p_active_names) = 0) THEN
    RAISE EXCEPTION 'At least one participant must be playing';
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
    FOREACH v_name IN ARRAY p_active_names LOOP
      SELECT id INTO v_participant_id FROM public.shared_play_participants
      WHERE booking_id = p_booking_id AND lower(name) = lower(btrim(v_name));
      INSERT INTO public.shared_play_periods (participant_id, started_at)
      SELECT v_participant_id, v_now
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

-- Close participant periods whenever checkout closes a booking, including the
-- walk-in checkout RPC and the ordinary fixed-booking checkout action.
CREATE OR REPLACE FUNCTION public.end_shared_play_periods()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status = 'checked_in' AND NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
    UPDATE public.shared_play_periods pp SET ended_at = NEW.completed_at
    FROM public.shared_play_participants p
    WHERE pp.participant_id = p.id AND p.booking_id = NEW.id AND pp.ended_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER end_shared_play_periods_after_checkout
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.end_shared_play_periods();
