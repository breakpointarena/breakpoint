-- Remove the managed platform offers and shared-inventory experiment.
-- Keep device_types rows intact; they may be referenced by configured devices.
DO $rollback$
DECLARE
  v_oid OID := to_regprocedure(
    'public.assign_device_slot(uuid,uuid,date,time without time zone,time without time zone,numeric,numeric,numeric,text,integer,integer,numeric,numeric)'
  );
  v_definition TEXT;
  v_updated TEXT;
  v_crlf TEXT := chr(13) || chr(10);
  v_declaration TEXT;
  v_lock_block TEXT;
BEGIN
  IF v_oid IS NOT NULL THEN
    v_definition := pg_get_functiondef(v_oid);
    v_declaration := '  v_device RECORD;' || v_crlf ||
      '  v_inventory_device_type_ids UUID[];' || v_crlf ||
      '  v_lock_device_type_id UUID;' || v_crlf ||
      'BEGIN' || v_crlf ||
      '  SELECT COALESCE(inventory_device_type_ids, ARRAY[id]) INTO v_inventory_device_type_ids' || v_crlf ||
      '  FROM public.device_types WHERE id = p_device_type_id;' || v_crlf ||
      '  IF NOT FOUND OR cardinality(v_inventory_device_type_ids) = 0 THEN RETURN; END IF;';
    v_updated := replace(v_definition, v_declaration, '  v_device RECORD;' || v_crlf || 'BEGIN');

    v_lock_block := '  FOR v_lock_device_type_id IN' || v_crlf ||
      '    SELECT DISTINCT pool_id FROM unnest(v_inventory_device_type_ids) AS pool_ids(pool_id) ORDER BY pool_id' || v_crlf ||
      '  LOOP' || v_crlf ||
      '    PERFORM pg_advisory_xact_lock(hashtext(v_lock_device_type_id::TEXT || '':'' || p_slot_date::TEXT));' || v_crlf ||
      '  END LOOP;';
    v_updated := replace(
      v_updated,
      v_lock_block,
      '  PERFORM pg_advisory_xact_lock(' || v_crlf ||
      '    hashtext(p_device_type_id::TEXT || '':'' || p_slot_date::TEXT)' || v_crlf ||
      '  );'
    );
    v_updated := replace(v_updated, 'WHERE d.device_type_id = ANY(v_inventory_device_type_ids)', 'WHERE d.device_type_id = p_device_type_id');

    IF position('v_inventory_device_type_ids' IN v_updated) > 0
       OR position('v_lock_device_type_id' IN v_updated) > 0 THEN
      RAISE EXCEPTION 'Could not fully restore assign_device_slot before managed device type rollback';
    END IF;
    IF v_updated <> v_definition THEN EXECUTE v_updated; END IF;
  END IF;
END
$rollback$;

DROP TABLE IF EXISTS public.device_type_offers;
ALTER TABLE public.device_types DROP COLUMN IF EXISTS inventory_device_type_ids;
NOTIFY pgrst, 'reload schema';
