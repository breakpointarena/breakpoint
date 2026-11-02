-- Add a separate PS5 category for private sessions. Keep its pricing aligned
-- with the standard PS5 until the private-session rate is configured.
INSERT INTO public.device_types (
  name,
  display_name,
  regular_hourly_rate,
  included_players,
  max_players,
  extra_player_charge,
  description,
  display_order
)
VALUES (
  'private_ps5',
  'Private PS5 Console',
  200.00,
  1,
  4,
  150.00,
  'PlayStation 5 gaming console for private sessions',
  6
)
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_active = true;
