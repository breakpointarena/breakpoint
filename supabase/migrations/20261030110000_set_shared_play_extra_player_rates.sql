-- Set the requested per-player hourly rates for the three shared-play table types.
-- These are master device-type rates; existing booking/session snapshots remain intact.
UPDATE public.device_types
SET extra_player_charge = CASE
  WHEN name = 'standard_snooker' OR display_name ILIKE '%standard%snooker%' THEN 80.00
  WHEN name = 'medium_snooker' OR display_name ILIKE '%medium%snooker%' THEN 50.00
  WHEN name = 'american_pool' OR display_name ILIKE '%american%pool%' OR display_name ILIKE '%american%snooker%' THEN 50.00
  ELSE extra_player_charge
END
WHERE name IN ('standard_snooker', 'medium_snooker', 'american_pool')
   OR display_name ILIKE '%standard%snooker%'
   OR display_name ILIKE '%medium%snooker%'
   OR display_name ILIKE '%american%pool%'
   OR display_name ILIKE '%american%snooker%';
