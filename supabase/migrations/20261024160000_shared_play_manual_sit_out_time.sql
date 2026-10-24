-- Let staff record when a Shared Play participant actually sat out.
-- The selected clock is resolved in the arena timezone and shares the same
-- six-hour correction limit as the manual sit-in time.
DO $migration$
DECLARE
  v_old_oid OID :=
    'public.set_shared_play_participants(uuid, boolean, text[], text[], time without time zone)'::regprocedure::oid;
  v_definition TEXT;
  v_updated_definition TEXT;
  v_sit_out_validation TEXT := $validation$

  IF p_sit_out_clock IS NOT NULL THEN
    v_manual_ended_at := (((v_now AT TIME ZONE v_zone)::DATE + p_sit_out_clock) AT TIME ZONE v_zone);
    IF v_manual_ended_at > v_now THEN
      v_manual_ended_at := v_manual_ended_at - INTERVAL '1 day';
    END IF;
    IF v_now - v_manual_ended_at > INTERVAL '6 hours' THEN
      RAISE EXCEPTION 'A sit-out time must be within the last 6 hours. Check the AM/PM.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.shared_play_periods pp
      JOIN public.shared_play_participants p ON p.id = pp.participant_id
      WHERE p.booking_id = p_booking_id
        AND pp.ended_at IS NULL
        AND (NOT p_enabled OR lower(p.name) <> ALL (
          SELECT lower(btrim(n)) FROM unnest(COALESCE(p_active_names, ARRAY[]::TEXT[])) AS n
        ))
        AND pp.started_at >= v_manual_ended_at
    ) THEN
      RAISE EXCEPTION 'Sit-out time must be after the participant sat in';
    END IF;
  END IF;
$validation$;
BEGIN
  v_definition := pg_get_functiondef(v_old_oid);
  v_updated_definition := regexp_replace(
    v_definition,
    'p_sit_in_clock[[:space:]]+time without time zone[[:space:]]+DEFAULT[[:space:]]+NULL(::time without time zone)?',
    'p_sit_in_clock time without time zone DEFAULT NULL, p_sit_out_clock time without time zone DEFAULT NULL',
    'i'
  );
  v_updated_definition := replace(
    v_updated_definition,
    '  v_manual_started_at TIMESTAMPTZ;',
    '  v_manual_started_at TIMESTAMPTZ;' || E'\n  v_manual_ended_at TIMESTAMPTZ;'
  );
  v_updated_definition := replace(
    v_updated_definition,
    '  END IF;' || E'\n\n  FOREACH v_name IN ARRAY COALESCE(p_roster_names',
    '  END IF;' || v_sit_out_validation || E'\n  FOREACH v_name IN ARRAY COALESCE(p_roster_names'
  );
  v_updated_definition := replace(
    v_updated_definition,
    'UPDATE public.shared_play_periods pp SET ended_at = v_now',
    'UPDATE public.shared_play_periods pp SET ended_at = COALESCE(v_manual_ended_at, v_now)'
  );

  IF v_updated_definition = v_definition
     OR position('p_sit_out_clock' IN v_updated_definition) = 0
     OR position('COALESCE(v_manual_ended_at, v_now)' IN v_updated_definition) = 0 THEN
    RAISE EXCEPTION 'Could not add the Shared Play sit-out time handling';
  END IF;

  EXECUTE 'DROP FUNCTION public.set_shared_play_participants(uuid, boolean, text[], text[], time without time zone)';
  EXECUTE v_updated_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.set_shared_play_participants(UUID, BOOLEAN, TEXT[], TEXT[], TIME, TIME) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_shared_play_participants(UUID, BOOLEAN, TEXT[], TEXT[], TIME, TIME) TO service_role;

NOTIFY pgrst, 'reload schema';
