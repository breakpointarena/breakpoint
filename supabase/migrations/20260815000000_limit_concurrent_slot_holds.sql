-- ================================================
-- CAP CONCURRENT SLOT HOLDS PER CLIENT
-- ================================================
-- `initializeSoftLockReservation` is a public, unauthenticated server action, and
-- since holds became real each call takes a station out of circulation for the
-- length of the hold window. The arena has four stations, so a loop against that
-- action can switch off online booking entirely and keep it off by re-holding.
--
-- The obvious guard - checkRateLimit() in lib/redis/client.ts - is a no-op here:
-- it returns `{ allowed: true }` whenever Redis is unconfigured, and Upstash is
-- not set in any environment. A limit that silently passes is worse than none,
-- because it reads as protection.
--
-- So the count is kept where the holds already are. Every hold records the client
-- that asked for it, and a new hold is refused once that client already has
-- `MAX_ACTIVE_HOLDS_PER_CLIENT` live ones. Expired holds fall out of the count on
-- their own - the window is part of the query, not something that needs sweeping.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_client_ip TEXT;

COMMENT ON COLUMN public.bookings.hold_client_ip IS 'Client that requested a pre-payment hold, used only to cap how many a single caller may hold at once. Set while status = locked, cleared on conversion.';

-- Supports exactly one query: "how many live holds does this client have?".
-- Partial, so it stays small - it only ever indexes rows that are currently held,
-- not the whole booking history.
CREATE INDEX IF NOT EXISTS idx_bookings_active_holds_by_client
  ON public.bookings(hold_client_ip, lock_expires_at)
  WHERE status = 'locked' AND hold_client_ip IS NOT NULL;
