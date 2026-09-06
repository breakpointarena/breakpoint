-- ================================================
-- DEVICE TYPES TABLE
-- ================================================
-- Centralizes device type configurations including pricing and player rules

CREATE TABLE public.device_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,

  -- Pricing
  regular_hourly_rate NUMERIC(10, 2) NOT NULL CHECK (regular_hourly_rate >= 0),

  -- Player Configuration
  included_players INTEGER NOT NULL DEFAULT 1 CHECK (included_players > 0),
  max_players INTEGER NOT NULL CHECK (max_players >= included_players),
  extra_player_charge NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (extra_player_charge >= 0),

  -- Display & Ordering
  description TEXT,
  icon_name TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for active device types
CREATE INDEX idx_device_types_active ON public.device_types(is_active, display_order);

-- Insert device types based on pricing table
INSERT INTO public.device_types (name, display_name, regular_hourly_rate, included_players, max_players, extra_player_charge, description, display_order) VALUES
  ('standard_snooker', 'Standard Snooker Table', 379.00, 4, 8, 79.00, 'Standard size snooker table - perfect for casual games', 1),
  ('medium_snooker', 'Medium Snooker Table', 299.00, 4, 8, 79.00, 'Medium size snooker table - great for smaller groups', 2),
  ('american_pool', 'American Pool Table', 249.00, 4, 8, 49.00, 'American pool table - classic billiards experience', 3),
  ('ps5', 'PS5 Console', 200.00, 1, 4, 150.00, 'PlayStation 5 gaming console - latest games and titles', 4),
  ('other', 'Board Games', 200.00, 1, 4, 100.00, 'Board games and tabletop activities', 5);

-- Add foreign key to devices table
ALTER TABLE public.devices
ADD COLUMN device_type_id UUID REFERENCES public.device_types(id) ON DELETE RESTRICT;

-- Create index for device type lookup
CREATE INDEX idx_devices_device_type ON public.devices(device_type_id);

-- Migrate existing device type data to use device_types table
UPDATE public.devices d
SET device_type_id = dt.id
FROM public.device_types dt
WHERE LOWER(d.type) = CASE
  WHEN dt.name = 'ps5' THEN 'ps5'
  WHEN dt.name = 'standard_snooker' THEN 'standard snooker'
  WHEN dt.name = 'medium_snooker' THEN 'medium snooker'
  WHEN dt.name = 'american_pool' THEN 'american snooker'
  ELSE 'other'
END;

-- Make device_type_id required after migration
ALTER TABLE public.devices
ALTER COLUMN device_type_id SET NOT NULL;

-- Remove old columns (no longer needed - data comes from device_types)
ALTER TABLE public.devices
DROP COLUMN IF EXISTS type,
DROP COLUMN IF EXISTS hourly_rate;

COMMENT ON TABLE public.device_types IS 'Master table for device/activity types with pricing and player configuration';
COMMENT ON COLUMN public.device_types.included_players IS 'Number of players included in base hourly rate';
COMMENT ON COLUMN public.device_types.max_players IS 'Maximum number of players allowed';
COMMENT ON COLUMN public.device_types.extra_player_charge IS 'Additional charge per extra player beyond included_players';
