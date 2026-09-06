-- =========================================
-- Database Schema Update - Customer DOB 
-- =========================================

-- Add Date of Birth (DOB) column to the customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add customer_dob column to subscription_purchases_legacy (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_purchases_legacy') THEN
    ALTER TABLE public.subscription_purchases_legacy
    ADD COLUMN IF NOT EXISTS customer_dob DATE;
  END IF;
END $$;

-- Add customer_dob column to the bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS customer_dob DATE;

-- Create indices for streamlined indexing queries
CREATE INDEX IF NOT EXISTS idx_customers_dob ON public.customers(date_of_birth);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_purchases_legacy') THEN
    CREATE INDEX IF NOT EXISTS idx_subscription_purchases_legacy_dob ON public.subscription_purchases_legacy(customer_dob);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_customer_dob ON public.bookings(customer_dob);

--  function logic to add customer DOB inputs
CREATE OR REPLACE FUNCTION get_or_create_customer(
  p_phone VARCHAR(15),
  p_name VARCHAR(100) DEFAULT NULL,
  p_email VARCHAR(100) DEFAULT NULL,
  p_dob DATE DEFAULT NULL
)
RETURNS UUID AS $function$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Try to locate an existing customer
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE phone = p_phone;

  -- If not found, create a new customer layout 
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (phone, name, email, date_of_birth)
    VALUES (p_phone, COALESCE(p_name, 'Customer'), p_email, p_dob)
    RETURNING id INTO v_customer_id;
  ELSE
    -- update name, email, or DOB if customer exists
    IF p_name IS NOT NULL OR p_email IS NOT NULL OR p_dob IS NOT NULL THEN
      UPDATE public.customers
      SET
        name = COALESCE(p_name, name),
        email = COALESCE(p_email, email),
        date_of_birth = COALESCE(p_dob, date_of_birth),
        updated_at = NOW()
      WHERE id = v_customer_id;
    END IF;
  END IF;

  RETURN v_customer_id;
END;
$function$ LANGUAGE plpgsql;


