-- ================================================
-- CLOSE THE PAYMENT BYPASS: remove anonymous write access
-- ================================================
--
-- The booking tables carried `FOR INSERT/UPDATE/SELECT ... USING (true)` policies
-- for the `public` role, which includes `anon`. Since the anon key ships in every
-- browser bundle by design, anyone could POST straight to /rest/v1/bookings and:
--
--   * insert a `confirmed` / `payment_status = 'paid'` booking plus a real
--     booking_device_slots row, reserving a station without paying anything;
--   * flip an existing unpaid booking (walk-in, food-on-tab) to 'paid';
--   * read every customer's name, phone, email, DOB and payment history;
--   * cancel or edit other people's bookings.
--
-- Verifying the Razorpay signature perfectly is worth nothing if the payment path
-- can be skipped entirely. This migration makes the service-role server actions
-- the ONLY way a booking is created or modified.
--
-- SAFE FOR THE APP: every customer flow already goes through `"use server"`
-- actions that use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. The only
-- browser-side reads of these tables are in the admin notification poller
-- (lib/hooks/useAdminNotificationPolling.ts), which runs as `authenticated` -
-- those SELECT policies are preserved below.
-- ================================================

-- ================================================
-- 1. BOOKINGS
-- ================================================
DROP POLICY IF EXISTS "Allow public read bookings"   ON public.bookings;
DROP POLICY IF EXISTS "Allow public insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Allow public update bookings" ON public.bookings;

CREATE POLICY "Service role manages bookings"
  ON public.bookings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin UI (notification poller, dashboards) reads as an authenticated user.
CREATE POLICY "Staff read bookings"
  ON public.bookings FOR SELECT TO authenticated USING (true);

-- ================================================
-- 2. BOOKING DEVICE SLOTS
-- ================================================
DROP POLICY IF EXISTS "Allow public read device_slots"   ON public.booking_device_slots;
DROP POLICY IF EXISTS "Allow public insert device_slots" ON public.booking_device_slots;

CREATE POLICY "Service role manages device_slots"
  ON public.booking_device_slots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Staff read device_slots"
  ON public.booking_device_slots FOR SELECT TO authenticated USING (true);

-- ================================================
-- 3. BOOKING FOOD ITEMS
-- ================================================
DROP POLICY IF EXISTS "Allow public read food_items"   ON public.booking_food_items;
DROP POLICY IF EXISTS "Allow public insert food_items" ON public.booking_food_items;
DROP POLICY IF EXISTS "Allow public update food_items" ON public.booking_food_items;

CREATE POLICY "Service role manages food_items"
  ON public.booking_food_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Staff read food_items"
  ON public.booking_food_items FOR SELECT TO authenticated USING (true);

-- ================================================
-- 4. CUSTOMERS - personal data, never anonymous
-- ================================================
-- Name, phone, email and date of birth. Anonymous read access here is a standing
-- personal-data exposure; the admin customer registry uses a server action.
DROP POLICY IF EXISTS "Allow public read customers"   ON public.customers;
DROP POLICY IF EXISTS "Allow public insert customers" ON public.customers;
DROP POLICY IF EXISTS "Allow public update customers" ON public.customers;

CREATE POLICY "Service role manages customers"
  ON public.customers FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Staff read customers"
  ON public.customers FOR SELECT TO authenticated USING (true);

-- ================================================
-- 5. PROMO CODES - discount values are not public
-- ================================================
-- Codes were world-readable, so every discount could simply be listed. Validation
-- happens in validatePromoCode() / the payment quote, both service role.
DROP POLICY IF EXISTS "Allow public read promo_codes" ON public.promo_codes;

CREATE POLICY "Service role manages promo_codes"
  ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Staff read promo_codes"
  ON public.promo_codes FOR SELECT TO authenticated USING (true);

-- ================================================
-- 6. REVOKE THE UNDERLYING TABLE GRANTS
-- ================================================
-- Policies alone are not enough: PostgREST also needs a table-level GRANT, and
-- these tables carry the legacy blanket grant to anon. Without this REVOKE a
-- future permissive policy would silently re-open anonymous access.
REVOKE ALL ON public.bookings             FROM anon;
REVOKE ALL ON public.booking_device_slots FROM anon;
REVOKE ALL ON public.booking_food_items   FROM anon;
REVOKE ALL ON public.booking_line_items   FROM anon;
REVOKE ALL ON public.customers            FROM anon;
REVOKE ALL ON public.promo_codes          FROM anon;

-- Same for `authenticated`. A staff login is a real Supabase JWT that reaches
-- PostgREST directly, and legacy blanket grants plus surviving permissive
-- policies (e.g. "Allow admin manage promo_codes" FOR ALL TO authenticated)
-- would otherwise let a logged-in browser write these tables straight from the
-- console. Every admin mutation already goes through a "use server" action on the
-- service role, so nothing legitimate needs write access here.
REVOKE ALL ON public.bookings             FROM authenticated;
REVOKE ALL ON public.booking_device_slots FROM authenticated;
REVOKE ALL ON public.booking_food_items   FROM authenticated;
REVOKE ALL ON public.booking_line_items   FROM authenticated;
REVOKE ALL ON public.customers            FROM authenticated;
REVOKE ALL ON public.promo_codes          FROM authenticated;

-- Staff read what the admin UI needs; all writes go through the service role.
GRANT SELECT ON public.bookings             TO authenticated;
GRANT SELECT ON public.booking_device_slots TO authenticated;
GRANT SELECT ON public.booking_food_items   TO authenticated;
GRANT SELECT ON public.booking_line_items   TO authenticated;
GRANT SELECT ON public.customers            TO authenticated;
GRANT SELECT ON public.promo_codes          TO authenticated;

GRANT ALL ON public.bookings             TO service_role;
GRANT ALL ON public.booking_device_slots TO service_role;
GRANT ALL ON public.booking_food_items   TO service_role;
GRANT ALL ON public.booking_line_items   TO service_role;
GRANT ALL ON public.customers            TO service_role;
GRANT ALL ON public.promo_codes          TO service_role;

-- ================================================
-- 7. PROMO CODE USAGE LIMITS
-- ================================================
-- A code with no usage cap is unlimited free money once it leaks - and until this
-- migration every code was readable by anyone. A 100% code also routes into the
-- zero-total path that books without any payment at all.
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS max_uses INTEGER,
  ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.promo_codes.max_uses IS 'Total redemptions allowed. NULL = unlimited.';
COMMENT ON COLUMN public.promo_codes.uses_count IS 'Redemptions so far; incremented when a booking is created with this code.';

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_uses_within_limit;
ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_uses_within_limit
  CHECK (max_uses IS NULL OR uses_count <= max_uses);

-- Atomically claim one redemption. Returns false when the code is exhausted, so
-- two customers racing on the last use cannot both get it.
CREATE OR REPLACE FUNCTION public.claim_promo_code(p_promo_code_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $function$
DECLARE
  v_claimed INTEGER;
BEGIN
  IF p_promo_code_id IS NULL THEN
    RETURN TRUE; -- no promo applied
  END IF;

  UPDATE public.promo_codes
  SET uses_count = uses_count + 1
  WHERE id = p_promo_code_id
    AND (max_uses IS NULL OR uses_count < max_uses);

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed = 1;
END;
$function$;

COMMENT ON FUNCTION public.claim_promo_code IS 'Atomically consumes one promo redemption. False = code exhausted.';

REVOKE ALL ON FUNCTION public.claim_promo_code(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_promo_code(UUID) TO service_role;
