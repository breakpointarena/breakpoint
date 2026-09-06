-- ================================================
-- INDEXES FOR THE BOUNDED REVENUE WINDOW
-- ================================================
-- The dashboard's revenue figures - today's takings and the last seven days -
-- used to be computed from an unbounded read: every settled booking the arena
-- had ever taken was fetched on each dashboard load, and a loop in JS discarded
-- all but the days it wanted. That read grows for as long as the arena trades.
--
-- The two actions behind those figures (getDashboardData and
-- getTodaysRevenueDetails) now bound the read, and they do it in two queries
-- because a booking can qualify by either of two dates:
--
--   (a) bookings.updated_at            - a booking with no payment group, which
--                                        today is every booking
--   (b) payment_groups.paid_at         - a booking settled as part of a group,
--                                        possibly long after it was created
--
-- These indexes are what make those bounds cheap. Without them Postgres still
-- sequentially scans `bookings` and only the transfer size improves.
--
-- Partial on payment_status because that is a constant predicate on both
-- queries, so the planner can match it and the index stays smaller than the
-- table it serves.
--
-- Not CONCURRENTLY: Supabase runs each migration inside a transaction, and
-- CREATE INDEX CONCURRENTLY cannot run in one. On a bookings table of any
-- realistic size for this arena the build is short; if this is ever applied to
-- a table large enough for the lock to matter, run the two statements by hand
-- with CONCURRENTLY instead and skip this file.

CREATE INDEX IF NOT EXISTS idx_bookings_revenue_window
  ON public.bookings (updated_at)
  WHERE payment_status IN ('paid', 'partial');

-- Only the settled groups are ever filtered on, and today the table is empty -
-- so this stays tiny until group payments are actually wired up.
CREATE INDEX IF NOT EXISTS idx_payment_groups_paid_at
  ON public.payment_groups (paid_at)
  WHERE paid_at IS NOT NULL;
