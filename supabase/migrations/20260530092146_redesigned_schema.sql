-- ================================================
-- Break Point Arena - Complete Schema Redesign
-- ================================================
-- Features:
-- 1. Unified bookings (device slots + food orders)
-- 2. Payment groups (batch payments)
-- 3. Database-only slot locking (no Redis)
-- ================================================

-- ================================================
-- DROP OLD TABLES (Clean Slate)
-- ================================================
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;

-- ================================================
-- 1. DEVICES TABLE
-- ================================================
CREATE TABLE public.devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('PS5', 'Standard Snooker', 'Medium Snooker', 'American Snooker')),
  station_number TEXT NOT NULL UNIQUE,
  specs TEXT,
  hourly_rate NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  status TEXT DEFAULT 'available' NOT NULL CHECK (status IN ('available', 'occupied', 'maintenance', 'inactive')),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_devices_status ON public.devices(status) WHERE status = 'available';

-- Storage bucket for device images
INSERT INTO storage.buckets (id, name, public)
VALUES ('device-images', 'device-images', true)
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- 2. MENU ITEMS TABLE
-- ================================================
CREATE TABLE public.menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Snacks', 'Drinks', 'Meals')),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'out_of_stock', 'hidden')),
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_menu_items_category_status ON public.menu_items(category, status);

-- Storage bucket for food images
INSERT INTO storage.buckets (id, name, public)
VALUES ('food-images', 'food-images', true)
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- 3. ADMIN USERS TABLE
-- ================================================
CREATE TABLE public.admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff')),
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_admin_username ON public.admin_users(LOWER(username));

-- ================================================
-- 4. PAYMENT GROUPS TABLE
-- ================================================
CREATE TABLE public.payment_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_number TEXT UNIQUE NOT NULL,

  total_amount NUMERIC(10, 2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi', 'online')),
  payment_status TEXT DEFAULT 'pending' NOT NULL CHECK (payment_status IN ('pending', 'paid', 'refunded')),

  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  transaction_reference TEXT,

  collected_by_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  payment_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX idx_payment_groups_status ON public.payment_groups(payment_status);
CREATE INDEX idx_payment_groups_collected_by ON public.payment_groups(collected_by_admin_id);

-- ================================================
-- 5. PROMO CODES TABLE
-- ================================================
CREATE TABLE public.promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,

  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL,

  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,

  is_active BOOLEAN DEFAULT true NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT valid_dates CHECK (valid_until > valid_from)
);

CREATE UNIQUE INDEX idx_promo_code ON public.promo_codes(UPPER(code));
CREATE INDEX idx_promo_active ON public.promo_codes(is_active, valid_from, valid_until);

-- ================================================
-- 6. SUBSCRIPTION PLANS TABLE (renamed to avoid conflict)
-- ================================================
CREATE TABLE public.subscription_plans_legacy (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,

  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),

  device_discount_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (device_discount_percentage >= 0 AND device_discount_percentage <= 100),
  food_discount_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (food_discount_percentage >= 0 AND food_discount_percentage <= 100),

  is_active BOOLEAN DEFAULT true NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_subscription_plans_legacy_active ON public.subscription_plans_legacy(is_active, display_order);

-- ================================================
-- 7. SUBSCRIPTION PURCHASES TABLE (legacy - will be replaced)
-- ================================================
CREATE TABLE public.subscription_purchases_legacy (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscription_plans_legacy(id) ON DELETE RESTRICT,

  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,

  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,

  amount_paid NUMERIC(10, 2) NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,

  device_discount_percentage NUMERIC(5, 2) NOT NULL,
  food_discount_percentage NUMERIC(5, 2) NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  cancelled_at TIMESTAMPTZ,

  CONSTRAINT valid_period CHECK (expires_at > starts_at)
);

CREATE INDEX idx_subscription_purchases_legacy_customer ON public.subscription_purchases_legacy(customer_phone, is_active);
CREATE INDEX idx_subscription_purchases_legacy_validity ON public.subscription_purchases_legacy(expires_at, is_active);

-- ================================================
-- 8. BOOKINGS TABLE (MAIN)
-- ================================================
CREATE TABLE public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_number TEXT UNIQUE NOT NULL,

  -- Customer Information
  customer_name TEXT,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,

  -- Booking Status
  status TEXT DEFAULT 'draft' NOT NULL CHECK (status IN (
    'draft',
    'locked',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled',
    'expired'
  )),

  -- Lock Management
  lock_expires_at TIMESTAMPTZ,
  locked_by TEXT,

  -- Payment Information
  payment_group_id UUID REFERENCES public.payment_groups(id) ON DELETE SET NULL,
  payment_status TEXT DEFAULT 'pending' NOT NULL CHECK (payment_status IN (
    'pending',
    'partial',
    'paid',
    'refunded'
  )),

  -- Pricing
  device_subtotal NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  food_subtotal NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  subscription_discount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  promo_discount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  promo_code_id UUID REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  total_amount NUMERIC(10, 2) NOT NULL,

  -- Metadata
  notes TEXT,
  qr_code_data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  checked_in_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_bookings_phone ON public.bookings(customer_phone);
CREATE INDEX idx_bookings_lock_expiry ON public.bookings(lock_expires_at)
  WHERE status = 'locked' AND lock_expires_at IS NOT NULL;
CREATE INDEX idx_bookings_payment_group ON public.bookings(payment_group_id)
  WHERE payment_group_id IS NOT NULL;
CREATE UNIQUE INDEX idx_booking_number ON public.bookings(booking_number);

-- ================================================
-- 9. BOOKING DEVICE SLOTS TABLE
-- ================================================
CREATE TABLE public.booking_device_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,

  slot_date DATE NOT NULL,
  slot_start_time TIME NOT NULL,
  slot_end_time TIME NOT NULL,
  duration_hours NUMERIC(3, 2) NOT NULL,

  hourly_rate NUMERIC(10, 2) NOT NULL,
  slot_total NUMERIC(10, 2) NOT NULL,

  device_type TEXT NOT NULL,
  device_station_number TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Prevent double booking
  UNIQUE(device_id, slot_date, slot_start_time)
);

-- Critical index for availability checks
CREATE INDEX idx_device_slots_availability ON public.booking_device_slots(
  device_id, slot_date, slot_start_time
);
CREATE INDEX idx_device_slots_booking ON public.booking_device_slots(booking_id);

-- ================================================
-- 10. BOOKING FOOD ITEMS TABLE
-- ================================================
CREATE TABLE public.booking_food_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,

  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL,
  line_total NUMERIC(10, 2) NOT NULL,

  item_name TEXT NOT NULL,
  item_category TEXT NOT NULL,

  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN (
    'pending',
    'preparing',
    'ready',
    'served',
    'cancelled'
  )),

  special_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_food_items_booking ON public.booking_food_items(booking_id);
CREATE INDEX idx_food_items_status ON public.booking_food_items(status);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================

-- Devices
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access to devices" ON public.devices FOR SELECT USING (true);
CREATE POLICY "Allow admin insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow admin update devices" ON public.devices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow admin delete devices" ON public.devices FOR DELETE TO authenticated USING (true);

-- Menu Items
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access to menu_items" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Allow admin insert menu_items" ON public.menu_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow admin update menu_items" ON public.menu_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow admin delete menu_items" ON public.menu_items FOR DELETE TO authenticated USING (true);

-- Bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read bookings" ON public.bookings FOR SELECT USING (true);
CREATE POLICY "Allow public insert bookings" ON public.bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update bookings" ON public.bookings FOR UPDATE USING (true) WITH CHECK (true);

-- Booking Device Slots
ALTER TABLE public.booking_device_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read device_slots" ON public.booking_device_slots FOR SELECT USING (true);
CREATE POLICY "Allow public insert device_slots" ON public.booking_device_slots FOR INSERT WITH CHECK (true);

-- Booking Food Items
ALTER TABLE public.booking_food_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read food_items" ON public.booking_food_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert food_items" ON public.booking_food_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update food_items" ON public.booking_food_items FOR UPDATE USING (true) WITH CHECK (true);

-- Payment Groups
ALTER TABLE public.payment_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admin manage payment_groups" ON public.payment_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Promo Codes
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read promo_codes" ON public.promo_codes FOR SELECT USING (true);
CREATE POLICY "Allow admin manage promo_codes" ON public.promo_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Subscriptions
ALTER TABLE public.subscription_plans_legacy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read subscription_plans_legacy" ON public.subscription_plans_legacy FOR SELECT USING (true);
CREATE POLICY "Allow admin manage subscription_plans_legacy" ON public.subscription_plans_legacy FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Subscription Purchases
ALTER TABLE public.subscription_purchases_legacy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read subscription_purchases_legacy" ON public.subscription_purchases_legacy FOR SELECT USING (true);
CREATE POLICY "Allow public insert subscription_purchases_legacy" ON public.subscription_purchases_legacy FOR INSERT WITH CHECK (true);

-- Admin Users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admin manage admin_users" ON public.admin_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ================================================
-- STORAGE POLICIES
-- ================================================

-- Device Images
CREATE POLICY "Allow public read device-images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'device-images');

CREATE POLICY "Allow admin upload device-images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'device-images');

CREATE POLICY "Allow admin update device-images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'device-images')
WITH CHECK (bucket_id = 'device-images');

CREATE POLICY "Allow admin delete device-images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'device-images');

-- Food Images
CREATE POLICY "Allow public read food-images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'food-images');

CREATE POLICY "Allow admin upload food-images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'food-images');

CREATE POLICY "Allow admin update food-images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'food-images')
WITH CHECK (bucket_id = 'food-images');

CREATE POLICY "Allow admin delete food-images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'food-images');

-- ================================================
-- HELPER FUNCTIONS
-- ================================================

-- Function to generate booking number
CREATE OR REPLACE FUNCTION generate_booking_number()
RETURNS TEXT AS $function$
DECLARE
  today TEXT;
  sequence_num INTEGER;
  booking_num TEXT;
BEGIN
  today := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Get next sequence number for today
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(booking_number FROM LENGTH(booking_number) - 2) AS INTEGER
    )
  ), 0) + 1 INTO sequence_num
  FROM public.bookings
  WHERE booking_number LIKE 'BP-' || today || '-%';

  booking_num := 'BP-' || today || '-' || LPAD(sequence_num::TEXT, 3, '0');

  RETURN booking_num;
END;
$function$ LANGUAGE plpgsql;

-- Function to generate payment group number
CREATE OR REPLACE FUNCTION generate_payment_group_number()
RETURNS TEXT AS $function$
DECLARE
  today TEXT;
  sequence_num INTEGER;
  group_num TEXT;
BEGIN
  today := TO_CHAR(NOW(), 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(group_number FROM LENGTH(group_number) - 2) AS INTEGER
    )
  ), 0) + 1 INTO sequence_num
  FROM public.payment_groups
  WHERE group_number LIKE 'PG-' || today || '-%';

  group_num := 'PG-' || today || '-' || LPAD(sequence_num::TEXT, 3, '0');

  RETURN group_num;
END;
$function$ LANGUAGE plpgsql;

-- Function to check slot availability
CREATE OR REPLACE FUNCTION check_slot_available(
  p_device_id UUID,
  p_slot_date DATE,
  p_slot_start_time TIME
)
RETURNS BOOLEAN AS $function$
DECLARE
  slot_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO slot_count
  FROM public.booking_device_slots bds
  JOIN public.bookings b ON b.id = bds.booking_id
  WHERE bds.device_id = p_device_id
    AND bds.slot_date = p_slot_date
    AND bds.slot_start_time = p_slot_start_time
    AND b.status IN ('locked', 'confirmed', 'checked_in')
    AND (
      b.status != 'locked' OR
      b.lock_expires_at > NOW()
    );

  RETURN slot_count = 0;
END;
$function$ LANGUAGE plpgsql;

-- Function to auto-expire locks (call via cron or at query time)
CREATE OR REPLACE FUNCTION expire_locked_bookings()
RETURNS INTEGER AS $function$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.bookings
  SET status = 'expired'
  WHERE status = 'locked'
    AND lock_expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$function$ LANGUAGE plpgsql;

-- ================================================
-- SEED DATA (Optional - for testing)
-- ================================================

-- Insert default admin user (password: admin123 - CHANGE IN PRODUCTION!)
-- Password hash generated with bcrypt for 'admin123'
INSERT INTO public.admin_users (username, password_hash, full_name, role)
VALUES ('admin', '$2a$10$rqfN1YJ5ZxjOb8cDv8bwDOxV7wQjKZYW5X1E4Y8R4wH6L3MXB4aGO', 'System Administrator', 'owner')
ON CONFLICT (username) DO NOTHING;

-- ================================================
-- END OF MIGRATION
-- ================================================
