-- Verification script for device_type_id migration
-- Run this to verify the migration was successful

-- 1. Check if device_type_id column exists
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'devices'
  AND column_name = 'device_type_id';

-- Expected: device_type_id | uuid | NO | (empty or null)

-- 2. Check if the foreign key constraint exists
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'devices'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'device_type_id';

-- Expected: Shows FK constraint to device_types table

-- 3. Check if the index exists
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'devices'
  AND indexname = 'idx_devices_type_status';

-- Expected: Shows index on (device_type_id, status)

-- 4. Check actual data - see if devices have device_type_id populated
SELECT
  id,
  type,
  device_type_id,
  station_number,
  status
FROM devices
LIMIT 5;

-- Expected: All rows should have device_type_id (not null)

-- 5. Count devices by device type
SELECT
  dt.display_name,
  dt.name,
  COUNT(d.id) as device_count
FROM device_types dt
LEFT JOIN devices d ON d.device_type_id = dt.id
GROUP BY dt.id, dt.display_name, dt.name
ORDER BY dt.display_order;

-- Expected: Shows count of devices per device type
