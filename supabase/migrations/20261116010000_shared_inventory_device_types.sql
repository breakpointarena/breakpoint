-- A platform can keep its own price and customer-facing label while reserving
-- stations owned by another device type (for example, GTA 6 -> PS5 Console).
ALTER TABLE public.device_types
  ADD COLUMN IF NOT EXISTS inventory_device_type_ids UUID[];

-- Make the existing allocator use the shared physical inventory pool. Keep its
-- current overlap checks and status guards intact; only change its pool lookup
-- and advisory lock key so bookings through either label serialize together.
DO $migration$
DECLARE
  v_oid OID := to_regprocedure(
    'public.assign_device_slot(uuid,uuid,date,time without time zone,time without time zone,numeric,numeric,numeric,text,integer,integer,numeric,numeric)'
  );
  v_definition TEXT;
  v_updated TEXT;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Could not find public.assign_device_slot';
  END IF;

  v_definition := pg_get_functiondef(v_oid);
  v_updated := replace(
    v_definition,
    $from$  v_device RECORD;
BEGIN$from$,
    $to$  v_device RECORD;
  v_inventory_device_type_ids UUID[];
  v_lock_device_type_id UUID;
BEGIN
  SELECT COALESCE(inventory_device_type_ids, ARRAY[id]) INTO v_inventory_device_type_ids
  FROM public.device_types WHERE id = p_device_type_id;
  IF NOT FOUND OR cardinality(v_inventory_device_type_ids) = 0 THEN RETURN; END IF;$to$
  );
  v_updated := replace(
    v_updated,
    $lock$  PERFORM pg_advisory_xact_lock(
    hashtext(p_device_type_id::TEXT || ':' || p_slot_date::TEXT)
  );$lock$,
    $locks$  FOR v_lock_device_type_id IN
    SELECT DISTINCT pool_id FROM unnest(v_inventory_device_type_ids) AS pool_id ORDER BY pool_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext(v_lock_device_type_id::TEXT || ':' || p_slot_date::TEXT)
    );
  END LOOP;$locks$
  );
  v_updated := replace(v_updated, 'WHERE d.device_type_id = p_device_type_id', 'WHERE d.device_type_id = ANY(v_inventory_device_type_ids)');

  IF v_updated = v_definition THEN
    IF position('v_inventory_device_type_ids' IN v_definition) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'Could not update assign_device_slot for shared inventory';
  END IF;

  EXECUTE v_updated;
END
$migration$;

NOTIFY pgrst, 'reload schema';
