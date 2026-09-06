-- RENAME "Other Gaming Device" -> "Board Games"

UPDATE public.device_types
SET display_name = 'Board Games',
    description  = 'Board games and tabletop activities',
    updated_at   = NOW()
WHERE name = 'other';

UPDATE public.devices
SET specs = 'Board games and tabletop entertainment. Contact staff for details.'
WHERE device_type_id = (SELECT id FROM public.device_types WHERE name = 'other')
  AND specs = 'Other gaming and entertainment options. Contact staff for details.';

UPDATE public.devices
SET station_number = 'BG-001'
WHERE station_number = 'OTH-001'
  AND device_type_id = (SELECT id FROM public.device_types WHERE name = 'other')
  AND NOT EXISTS (SELECT 1 FROM public.devices WHERE station_number = 'BG-001');

UPDATE public.booking_device_slots
SET device_type = 'Board Games'
WHERE device_type = 'Other Gaming Device';

UPDATE public.booking_device_slots
SET device_station_number = 'BG-001'
WHERE device_station_number = 'OTH-001';

UPDATE public.happy_hour_rules
SET devices = REPLACE(devices, 'OTH-001', 'BG-001')
WHERE devices LIKE '%OTH-001%';
