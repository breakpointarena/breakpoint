-- ================================================
-- Add Customers Table
-- ================================================
-- Purpose: Centralize customer data and link to subscriptions
-- ================================================

CREATE TABLE public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) UNIQUE NOT NULL,
  email VARCHAR(100),

  -- Active subscription reference (will be updated to use new 'subscriptions' table later)
  active_subscription_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for fast lookups
CREATE UNIQUE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_customers_email ON public.customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_active_subscription ON public.customers(active_subscription_id)
  WHERE active_subscription_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow public read customers"
  ON public.customers
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert customers"
  ON public.customers
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update customers"
  ON public.customers
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow admin delete customers"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (true);

-- ================================================
-- Update Related Tables
-- ================================================

-- Update bookings table to reference customers
ALTER TABLE public.bookings
  ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Index for customer bookings lookup
CREATE INDEX idx_bookings_customer_id ON public.bookings(customer_id)
  WHERE customer_id IS NOT NULL;

-- Update subscription_purchases_legacy to reference customers
ALTER TABLE public.subscription_purchases_legacy
  ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX idx_subscription_purchases_legacy_customer_id ON public.subscription_purchases_legacy(customer_id)
  WHERE customer_id IS NOT NULL;

-- ================================================
-- Helper Functions
-- ================================================

-- Function to get or create customer
CREATE OR REPLACE FUNCTION get_or_create_customer(
  p_phone VARCHAR(15),
  p_name VARCHAR(100) DEFAULT NULL,
  p_email VARCHAR(100) DEFAULT NULL
)
RETURNS UUID AS $function$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Try to find existing customer
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE phone = p_phone;

  -- If not found, create new customer
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (phone, name, email)
    VALUES (p_phone, COALESCE(p_name, 'Customer'), p_email)
    RETURNING id INTO v_customer_id;
  ELSE
    -- Update name/email if provided and customer exists
    IF p_name IS NOT NULL OR p_email IS NOT NULL THEN
      UPDATE public.customers
      SET
        name = COALESCE(p_name, name),
        email = COALESCE(p_email, email),
        updated_at = NOW()
      WHERE id = v_customer_id;
    END IF;
  END IF;

  RETURN v_customer_id;
END;
$function$ LANGUAGE plpgsql;

-- Function to get customer's active subscription (updated for new schema)
CREATE OR REPLACE FUNCTION get_customer_active_subscription(p_customer_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  subscription_name TEXT,
  discount_percentage INTEGER,
  end_date DATE
) AS $function$
BEGIN
  -- Check if new subscriptions table exists, otherwise use legacy
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    RETURN QUERY
    SELECT
      s.id,
      sp.name,
      sp.discount_percentage,
      s.end_date
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
    WHERE s.customer_id = p_customer_id
      AND s.status = 'active'
      AND s.end_date >= CURRENT_DATE
    ORDER BY s.end_date DESC
    LIMIT 1;
  ELSIF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_purchases_legacy') THEN
    RETURN QUERY
    SELECT
      spl.id,
      sp.name,
      sp.discount_percentage::INTEGER,
      spl.expires_at::DATE
    FROM public.subscription_purchases_legacy spl
    JOIN public.subscription_plans_legacy sp ON sp.id = spl.subscription_id
    WHERE spl.customer_id = p_customer_id
      AND spl.is_active = true
      AND spl.expires_at > NOW()
    ORDER BY spl.expires_at DESC
    LIMIT 1;
  END IF;
END;
$function$ LANGUAGE plpgsql;

-- Function to update customer's active subscription (updated for new schema)
CREATE OR REPLACE FUNCTION update_customer_active_subscription(p_customer_id UUID)
RETURNS VOID AS $function$
DECLARE
  v_active_subscription_id UUID;
BEGIN
  -- Check if new subscriptions table exists
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    -- Find the most recent active subscription from new table
    SELECT subscription_plan_id INTO v_active_subscription_id
    FROM public.subscriptions
    WHERE customer_id = p_customer_id
      AND status = 'active'
      AND end_date >= CURRENT_DATE
    ORDER BY end_date DESC
    LIMIT 1;
  ELSIF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_purchases_legacy') THEN
    -- Find from legacy table
    SELECT id INTO v_active_subscription_id
    FROM public.subscription_purchases_legacy
    WHERE customer_id = p_customer_id
      AND is_active = true
      AND expires_at > NOW()
    ORDER BY expires_at DESC
    LIMIT 1;
  END IF;

  -- Update customer record
  UPDATE public.customers
  SET
    active_subscription_id = v_active_subscription_id,
    updated_at = NOW()
  WHERE id = p_customer_id;
END;
$function$ LANGUAGE plpgsql;

-- ================================================
-- Triggers
-- ================================================

-- Trigger to update customer.updated_at on any change
CREATE OR REPLACE FUNCTION update_customer_updated_at()
RETURNS TRIGGER AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customer_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_updated_at();

-- ================================================
-- Migration Notes
-- ================================================
--
-- IMPORTANT: Existing bookings and subscription_purchases will have NULL customer_id
--
-- To migrate existing data (if any):
--
-- 1. Create customers from existing bookings:
--    INSERT INTO customers (phone, name, email)
--    SELECT DISTINCT
--      customer_phone,
--      COALESCE(customer_name, 'Customer'),
--      customer_email
--    FROM bookings
--    WHERE customer_phone IS NOT NULL
--    ON CONFLICT (phone) DO NOTHING;
--
-- 2. Update bookings with customer_id:
--    UPDATE bookings b
--    SET customer_id = c.id
--    FROM customers c
--    WHERE b.customer_phone = c.phone;
--
-- 3. Update subscription_purchases with customer_id:
--    UPDATE subscription_purchases sp
--    SET customer_id = c.id
--    FROM customers c
--    WHERE sp.customer_phone = c.phone;
--
-- 4. Update active subscriptions:
--    SELECT update_customer_active_subscription(id)
--    FROM customers;
--
-- ================================================
