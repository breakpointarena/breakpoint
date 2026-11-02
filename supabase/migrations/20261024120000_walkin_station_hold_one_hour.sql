-- The station booking hold for an open-ended walk-in is one hour. Keep the
-- atomic allocator, the active-session device correction and the active-session
-- start-time correction in sync with the application's availability arithmetic.
DO $migration$
DECLARE
  v_function_oid OID;
  v_definition TEXT;
  v_updated_definition TEXT;
  v_functions OID[] := ARRAY[
    'public.assign_device_slot(uuid, uuid, date, time without time zone, time without time zone, numeric, numeric, numeric, text, integer, integer, numeric, numeric)'::regprocedure::oid,
    'public.change_checked_in_walkin_device_v1(uuid, uuid)'::regprocedure::oid,
    'public.change_checked_in_walkin_start_v1(uuid, time without time zone)'::regprocedure::oid
  ];
BEGIN
  FOREACH v_function_oid IN ARRAY v_functions LOOP
    v_definition := pg_get_functiondef(v_function_oid);
    v_updated_definition := replace(
      v_definition,
      'INTERVAL ''12 hours''',
      'INTERVAL ''1 hour'''
    );

    IF v_definition = v_updated_definition THEN
      RAISE EXCEPTION 'Could not find the 12-hour hold in function %', v_function_oid::regprocedure;
    END IF;

    EXECUTE v_updated_definition;
  END LOOP;
END;
$migration$;

COMMENT ON FUNCTION public.assign_device_slot(UUID, UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC) IS
  'Atomically picks a free station for the requested window. An open-ended walk-in uses a one-hour hold by default, or its stated planned finish when that extends further.';

NOTIFY pgrst, 'reload schema';
