-- Completed bookings no longer occupy a station. The assignment query already
-- ignores their time ranges, but its exact-key guard must also allow a new
-- session at the same station and start time (for example, another 12:00 AM
-- walk-in after the previous one has checked out).
DO $migration$
DECLARE
  v_function_oid OID := to_regprocedure(
    'public.assign_device_slot(uuid,uuid,date,time without time zone,time without time zone,numeric,numeric,numeric,text,integer,integer,numeric,numeric)'
  );
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'Could not find public.assign_device_slot';
  END IF;

  v_definition := pg_get_functiondef(v_function_oid);
  v_updated_definition := replace(
    v_definition,
    'AND b2.status NOT IN (''cancelled'', ''expired'')',
    'AND b2.status NOT IN (''cancelled'', ''expired'', ''completed'')'
  );
  v_updated_definition := replace(
    v_updated_definition,
    'b.status IN (''cancelled'', ''expired'')',
    'b.status IN (''cancelled'', ''expired'', ''completed'')'
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Could not update the completed-slot guards in assign_device_slot';
  END IF;

  EXECUTE v_updated_definition;
END
$migration$;
