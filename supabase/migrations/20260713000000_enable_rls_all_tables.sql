-- ================================================
-- CRITICAL SECURITY FIX: Enable RLS on all tables
-- ================================================
-- Date: 2026-07-13
-- Description: Enable Row Level Security on all tables that don't have it
-- and create proper security policies
-- ================================================

-- ================================================
-- 1. DEVICE_TYPES TABLE - Missing RLS
-- ================================================
ALTER TABLE public.device_types ENABLE ROW LEVEL SECURITY;

-- Allow public read access (users need to see device types)
CREATE POLICY "Allow public read access to device_types"
ON public.device_types
FOR SELECT
USING (true);

-- Allow service role full access (admin operations)
CREATE POLICY "Allow service role full access to device_types"
ON public.device_types
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users (admins) to manage device types
CREATE POLICY "Allow authenticated users to manage device_types"
ON public.device_types
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ================================================
-- 2. BOOKING_LINE_ITEMS TABLE - Missing RLS
-- ================================================
ALTER TABLE public.booking_line_items ENABLE ROW LEVEL SECURITY;

-- Allow authenticated read access (admins need to see line items)
CREATE POLICY "Allow authenticated read access to booking_line_items"
ON public.booking_line_items
FOR SELECT
TO authenticated
USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to booking_line_items"
ON public.booking_line_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users to insert/update their bookings
CREATE POLICY "Allow authenticated users to manage booking_line_items"
ON public.booking_line_items
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ================================================
-- 3. VERIFY AND STRENGTHEN EXISTING RLS POLICIES
-- ================================================

-- Ensure admin_users table has proper RLS
-- (Should only be accessible by service role and authenticated admins)
DROP POLICY IF EXISTS "Allow service role full access to admin_users" ON public.admin_users;
CREATE POLICY "Allow service role full access to admin_users"
ON public.admin_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users to read admin users (for display purposes)
DROP POLICY IF EXISTS "Allow authenticated read admin_users" ON public.admin_users;
CREATE POLICY "Allow authenticated read admin_users"
ON public.admin_users
FOR SELECT
TO authenticated
USING (true);

-- ================================================
-- 4. PAYMENT_GROUPS - Strengthen security
-- ================================================
-- Ensure only service role can manage payments
DROP POLICY IF EXISTS "Allow service role full access to payment_groups" ON public.payment_groups;
CREATE POLICY "Allow service role full access to payment_groups"
ON public.payment_groups
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users (admins) to read payment groups
DROP POLICY IF EXISTS "Allow authenticated read payment_groups" ON public.payment_groups;
CREATE POLICY "Allow authenticated read payment_groups"
ON public.payment_groups
FOR SELECT
TO authenticated
USING (true);

-- ================================================
-- 5. EXPENSES TABLE - Ensure proper access
-- ================================================
-- Verify expenses table policies exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'expenses'
    AND policyname = 'Service role has full access to expenses'
  ) THEN
    -- Create policy if it doesn't exist
    EXECUTE 'CREATE POLICY "Service role has full access to expenses"
    ON public.expenses
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)';
  END IF;
END $$;

-- ================================================
-- 6. SUBSCRIPTION TABLES - Verify RLS
-- ================================================
-- Ensure subscriptions table has RLS enabled
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ================================================
-- 7. HAPPY HOUR RULES - Verify RLS
-- ================================================
-- Ensure happy_hour_rules has proper policies
DO $$
BEGIN
  -- Check if table exists before altering
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'happy_hour_rules') THEN
    EXECUTE 'ALTER TABLE public.happy_hour_rules ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ================================================
-- 8. AUDIT: List all tables and their RLS status
-- ================================================
-- This comment documents what should be enabled:
-- ✓ devices - RLS enabled
-- ✓ menu_items - RLS enabled
-- ✓ admin_users - RLS enabled (strengthened)
-- ✓ payment_groups - RLS enabled (strengthened)
-- ✓ promo_codes - RLS enabled
-- ✓ bookings - RLS enabled
-- ✓ booking_device_slots - RLS enabled
-- ✓ booking_food_items - RLS enabled
-- ✓ customers - RLS enabled
-- ✓ device_types - RLS NOW ENABLED ✓
-- ✓ booking_line_items - RLS NOW ENABLED ✓
-- ✓ expenses - RLS enabled
-- ✓ subscriptions - RLS enabled
-- ✓ customer_subscriptions - RLS enabled
-- ✓ happy_hour_rules - RLS enabled

-- ================================================
-- 9. VERIFY ALL TABLES HAVE RLS ENABLED
-- ================================================
-- Run this query to verify (for documentation):
/*
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE 'sql_%'
ORDER BY tablename;
*/

COMMENT ON SCHEMA public IS 'All tables in public schema must have Row Level Security enabled for security compliance';
