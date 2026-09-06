-- Link devices table to device_types table
-- This allows multiple physical devices to belong to one device type

-- Step 1: Add device_type_id column (nullable temporarily)
ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS device_type_id UUID REFERENCES public.device_types(id) ON DELETE RESTRICT;

-- Step 2: Migrate existing data - map old 'type' text to device_type_id
-- Match devices to device_types by name mapping
-- Only run if 'type' column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'devices'
    AND column_name = 'type'
  ) THEN
    UPDATE public.devices d
    SET device_type_id = (
      SELECT dt.id
      FROM public.device_types dt
      WHERE
        (d.type = 'PS5' AND dt.name = 'ps5') OR
        (d.type = 'Standard Snooker' AND dt.name = 'standard_snooker') OR
        (d.type = 'Medium Snooker' AND dt.name = 'medium_snooker') OR
        (d.type = 'American Snooker' AND dt.name = 'american_snooker')
      LIMIT 1
    )
    WHERE device_type_id IS NULL;
  END IF;
END $$;

-- Step 3: Make device_type_id NOT NULL after data migration
-- Only if not already NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'devices'
    AND column_name = 'device_type_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.devices
    ALTER COLUMN device_type_id SET NOT NULL;
  END IF;
END $$;

-- Step 4: Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_devices_type_status
ON public.devices(device_type_id, status)
WHERE status = 'available';

-- Step 5: Add comment for documentation
COMMENT ON COLUMN public.devices.device_type_id IS 'Foreign key to device_types - multiple devices can share the same type';

-- Note: We're keeping the old 'type' column for now for backwards compatibility
-- It can be dropped in a future migration after all code is updated
