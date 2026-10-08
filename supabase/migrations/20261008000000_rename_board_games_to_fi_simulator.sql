UPDATE public.device_types
SET display_name = 'FI Simulator',
    description = 'FI simulator experience',
    updated_at = NOW()
WHERE name = 'other'
  AND display_name = 'Board Games';

UPDATE public.devices
SET specs = 'FI simulator experience. Contact staff for details.'
WHERE device_type_id = (SELECT id FROM public.device_types WHERE name = 'other')
  AND specs = 'Board games and tabletop entertainment. Contact staff for details.';

UPDATE public.booking_device_slots
SET device_type = 'FI Simulator'
WHERE device_type = 'Board Games';
