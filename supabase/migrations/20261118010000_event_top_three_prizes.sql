ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS first_place_prize_description TEXT,
  ADD COLUMN IF NOT EXISTS second_place_prize_description TEXT,
  ADD COLUMN IF NOT EXISTS third_place_prize_description TEXT;

COMMENT ON COLUMN public.events.first_place_prize_description IS
  'Optional public description of the first-place prize. Payout costs belong in admin-only expenses.';
COMMENT ON COLUMN public.events.second_place_prize_description IS
  'Optional public description of the second-place prize. Payout costs belong in admin-only expenses.';
COMMENT ON COLUMN public.events.third_place_prize_description IS
  'Optional public description of the third-place prize. Payout costs belong in admin-only expenses.';
