-- The function definition is returned with CRLF endings by this PostgreSQL
-- image. Use character-built anchors so the declaration and shared-pool lock
-- are reliably inserted without replacing the allocator's occupancy logic.
DO $migration$
DECLARE
  v_oid OID := to_regprocedure(
    'public.assign_device_slot(uuid,uuid,date,time without time zone,time without time zone,numeric,numeric,numeric,text,integer,integer,numeric,numeric)'
  );
  v_definition TEXT;
  v_updated TEXT;
  v_from TEXT := '  v_device RECORD;' || chr(13) || chr(10) || 'BEGIN';
  v_to TEXT := '  v_device RECORD;' || chr(13) || chr(10) ||
    '  v_inventory_device_type_ids UUID[];' || chr(13) || chr(10) ||
    '  v_lock_device_type_id UUID;' || chr(13) || chr(10) ||
    'BEGIN' || chr(13) || chr(10) ||
    '  SELECT COALESCE(inventory_device_type_ids, ARRAY[id]) INTO v_inventory_device_type_ids' || chr(13) || chr(10) ||
    '  FROM public.device_types WHERE id = p_device_type_id;' || chr(13) || chr(10) ||
    '  IF NOT FOUND OR cardinality(v_inventory_device_type_ids) = 0 THEN RETURN; END IF;';
  v_lock_from TEXT := '  PERFORM pg_advisory_xact_lock(' || chr(13) || chr(10) ||
    '    hashtext(p_device_type_id::TEXT || '':'' || p_slot_date::TEXT)' || chr(13) || chr(10) ||
    '  );';
  v_lock_to TEXT := '  FOR v_lock_device_type_id IN' || chr(13) || chr(10) ||
    '    SELECT DISTINCT pool_id FROM unnest(v_inventory_device_type_ids) AS pool_ids(pool_id) ORDER BY pool_id' || chr(13) || chr(10) ||
    '  LOOP' || chr(13) || chr(10) ||
    '    PERFORM pg_advisory_xact_lock(hashtext(v_lock_device_type_id::TEXT || '':'' || p_slot_date::TEXT));' || chr(13) || chr(10) ||
    '  END LOOP;';
BEGIN
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Could not find public.assign_device_slot'; END IF;
  v_definition := pg_get_functiondef(v_oid);
  v_updated := replace(v_definition, v_from, v_to);
  v_updated := replace(v_updated, v_lock_from, v_lock_to);

  IF position('v_inventory_device_type_ids UUID[]' IN v_updated) = 0
     OR position('v_lock_device_type_id UUID' IN v_updated) = 0
     OR position('END LOOP;' IN v_updated) = 0 THEN
    RAISE EXCEPTION 'Could not repair shared inventory allocator declarations and locks';
  END IF;

  EXECUTE v_updated;
END
$migration$;

NOTIFY pgrst, 'reload schema';
