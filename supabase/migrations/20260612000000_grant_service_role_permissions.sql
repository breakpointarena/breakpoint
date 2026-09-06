-- ================================================
-- Grant Service Role Permissions
-- ================================================
-- Purpose: Grant full access to service_role for all tables
-- This is needed for admin operations via server actions
-- ================================================

-- Grant ALL privileges on all tables in public schema to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Grant future tables/sequences/functions as well
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;

-- Specific tables that admin needs access to
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_device_slots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_food_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO service_role;

-- Grant usage on schemas
GRANT USAGE ON SCHEMA public TO service_role;

COMMENT ON SCHEMA public IS 'Service role has full access to all public schema objects for admin operations';
