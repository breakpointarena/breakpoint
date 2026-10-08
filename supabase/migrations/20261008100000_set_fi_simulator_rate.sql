UPDATE public.device_types
SET regular_hourly_rate = 2100.00,
    updated_at = NOW()
WHERE name = 'other'
  AND display_name = 'FI Simulator';
