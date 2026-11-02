-- Keep a manually entered start time when the floor is full at creation.
-- The booking remains waiting, then reuses these values on its later check-in.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS walk_in_pending_start_time TIME,
  ADD COLUMN IF NOT EXISTS walk_in_pending_end_time TIME;

COMMENT ON COLUMN public.bookings.walk_in_pending_start_time IS
  'A requested manual start time for a walk-in that could not claim a station yet. Used on its next check-in attempt, then cleared.';

COMMENT ON COLUMN public.bookings.walk_in_pending_end_time IS
  'A requested planned end time paired with walk_in_pending_start_time while a walk-in waits for a station. Used on its next check-in attempt, then cleared.';
