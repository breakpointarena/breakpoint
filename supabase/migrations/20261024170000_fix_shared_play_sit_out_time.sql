-- The previous migration added the sit-out argument, but function formatting
-- differs between branches. Ensure the body actually resolves and stores it.
DO $migration$
DECLARE
  v_function_oid OID :=
    'public.set_shared_play_participants(uuid, boolean, text[], text[], time without time zone, time without time zone)'::regprocedure::oid;
  v_definition TEXT;
  v_updated_definition TEXT;
  v_validation TEXT := $validation$

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
  v_definition := pg_get_functiondef(v_function_oid);
  v_updated_definition := regexp_replace(
    v_definition,
    'END IF;[[:space:]]*FOREACH v_name IN ARRAY COALESCE\(p_roster_names',
    'END IF;' || v_validation || E'\n  FOREACH v_name IN ARRAY COALESCE(p_roster_names',
    'i'
  );

  IF v_updated_definition = v_definition
     OR position('IF p_sit_out_clock IS NOT NULL' IN v_updated_definition) = 0
     OR position('COALESCE(v_manual_ended_at, v_now)' IN v_updated_definition) = 0 THEN
    RAISE EXCEPTION 'Could not wire the selected Shared Play sit-out time into the database function';
  END IF;

  EXECUTE v_updated_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
