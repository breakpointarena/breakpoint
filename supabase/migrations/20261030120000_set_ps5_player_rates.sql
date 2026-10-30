-- For PS5 types, regular_hourly_rate is the per-player group rate and
-- single_player_hourly_rate overrides it for exactly one player.
ALTER TABLE public.device_types
  ADD COLUMN IF NOT EXISTS single_player_hourly_rate NUMERIC(10, 2)
  CHECK (single_player_hourly_rate IS NULL OR single_player_hourly_rate >= 0);

UPDATE public.device_types
SET regular_hourly_rate = 200.00,
    extra_player_charge = 200.00,
    single_player_hourly_rate = 200.00,
    description = 'PlayStation 5 gaming console - group sessions are billed per player'
WHERE name = 'ps5';

UPDATE public.device_types
SET regular_hourly_rate = 200.00,
    extra_player_charge = 200.00,
    single_player_hourly_rate = 250.00,
    description = 'PlayStation 5 gaming console for private sessions'
WHERE name = 'private_ps5';
