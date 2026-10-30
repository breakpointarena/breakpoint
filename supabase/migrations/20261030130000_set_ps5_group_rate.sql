-- PS5 Console: one player pays the solo rate; groups of two or more pay the
-- group rate per player. Private PS5 rates remain unchanged.
UPDATE public.device_types
SET regular_hourly_rate = 150.00,
    extra_player_charge = 150.00,
    single_player_hourly_rate = 200.00
WHERE name = 'ps5';
