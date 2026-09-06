-- ================================================
-- SEED DATA FOR BREAK POINT ARENA
-- ================================================

-- Clear existing data (for re-seeding)
TRUNCATE TABLE public.devices CASCADE;
TRUNCATE TABLE public.device_types CASCADE;

-- ================================================
-- 1. DEVICE TYPES (Based on pricing table)
-- ================================================

INSERT INTO public.device_types (name, display_name, regular_hourly_rate, included_players, max_players, extra_player_charge, description, display_order) VALUES
  ('standard_snooker', 'Standard Snooker Table', 379.00, 4, 8, 79.00, 'Standard size snooker table - perfect for casual games with up to 4 players included', 1),
  ('medium_snooker', 'Medium Snooker Table', 299.00, 4, 8, 79.00, 'Medium size snooker table - great for smaller groups with up to 4 players included', 2),
  ('american_pool', 'American Pool Table', 249.00, 4, 8, 49.00, 'American pool table - classic billiards experience with up to 4 players included', 3),
  ('ps5', 'PS5 Console', 200.00, 1, 4, 150.00, 'PlayStation 5 gaming console - latest games and titles, 1 player included, ₹150 per additional controller', 4),
  ('other', 'Board Games', 200.00, 1, 4, 100.00, 'Board games and tabletop activities', 5);

-- ================================================
-- 2. SAMPLE DEVICES (One for each type)
-- ================================================

-- Get device type IDs
DO $$
DECLARE
  v_standard_snooker_id UUID;
  v_medium_snooker_id UUID;
  v_american_pool_id UUID;
  v_ps5_id UUID;
  v_other_id UUID;
BEGIN
  -- Get device type IDs
  SELECT id INTO v_standard_snooker_id FROM device_types WHERE name = 'standard_snooker';
  SELECT id INTO v_medium_snooker_id FROM device_types WHERE name = 'medium_snooker';
  SELECT id INTO v_american_pool_id FROM device_types WHERE name = 'american_pool';
  SELECT id INTO v_ps5_id FROM device_types WHERE name = 'ps5';
  SELECT id INTO v_other_id FROM device_types WHERE name = 'other';

  -- Insert sample devices
  INSERT INTO public.devices (device_type_id, station_number, status, specs) VALUES
    (v_standard_snooker_id, 'SS-001', 'available', 'Full size standard snooker table with professional grade cloth. Includes cues, balls, and triangle. Up to 8 players (4 included in base rate).'),
    (v_medium_snooker_id, 'MS-001', 'available', 'Medium size snooker table perfect for casual play. Includes all accessories. Up to 8 players (4 included in base rate).'),
    (v_american_pool_id, 'AP-001', 'available', 'Professional American pool table with aramith balls. Includes cues and chalk. Up to 8 players (4 included in base rate).'),
    (v_ps5_id, 'PS5-001', 'available', 'PlayStation 5 console with DualSense controller, 4K gaming, and latest game library. Up to 4 players (₹150 per additional controller).'),
    (v_other_id, 'BG-001', 'available', 'Board games and tabletop entertainment. Contact staff for details.');
END $$;

-- ================================================
-- 3. SAMPLE MENU ITEMS (Optional - for testing)
-- ================================================

INSERT INTO public.menu_items (name, category, price, quantity, status, description) VALUES
  -- Snacks
  ('Samosa', 'Snacks', 20.00, 50, 'available', 'Crispy vegetable samosa'),
  ('French Fries', 'Snacks', 80.00, 30, 'available', 'Golden crispy french fries'),
  ('Nachos', 'Snacks', 120.00, 25, 'available', 'Nachos with cheese dip'),

  -- Drinks
  ('Coke', 'Drinks', 40.00, 100, 'available', 'Chilled Coca Cola'),
  ('Coffee', 'Drinks', 50.00, 50, 'available', 'Hot coffee'),
  ('Lemonade', 'Drinks', 60.00, 40, 'available', 'Fresh lemonade'),

  -- Meals
  ('Veg Burger', 'Meals', 120.00, 20, 'available', 'Delicious veg burger with fries'),
  ('Chicken Burger', 'Meals', 150.00, 20, 'available', 'Grilled chicken burger with fries'),
  ('Pasta', 'Meals', 180.00, 15, 'available', 'White sauce pasta with garlic bread');

-- ================================================
-- SUCCESS MESSAGE
-- ================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Seed data inserted successfully!';
  RAISE NOTICE '📊 Device Types: 5 types added';
  RAISE NOTICE '🎮 Devices: 5 sample devices added (one per type)';
  RAISE NOTICE '🍔 Menu Items: 9 sample items added';
END $$;


-- 3. SEED DATA FOR TABLE: promo_codes
INSERT INTO public.promo_codes (code, description, discount_type, discount_value, valid_from, valid_until, is_active)
VALUES
  -- `valid_until` runs to the end of its day: the end date is inclusive, so the
  -- code is redeemable for the whole of that final day.
  ('ARENA20', 'Welcome Bonus Voucher providing an introductory 20% discount window across booking balances.', 'percentage', 20.00, CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '31 days' - INTERVAL '1 millisecond', true),
  ('ELITE500', 'Premium high-value absolute flat savings voucher deduction applied directly onto processing checkouts.', 'fixed', 500.00, CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '61 days' - INTERVAL '1 millisecond', true),
  ('HIDDENOFF', 'Undercover administration test code disabled from operational customer execution pathways by default.', 'percentage', 50.00, CURRENT_DATE, CURRENT_DATE + INTERVAL '91 days' - INTERVAL '1 millisecond', false)
ON CONFLICT (code) DO NOTHING;

-- ================================================
-- 4. SAMPLE CUSTOMERS (For testing)
-- ================================================

INSERT INTO public.customers (name, phone, email, date_of_birth, created_at, updated_at) VALUES
  ('Rahul Sharma', '9876543210', 'rahul.sharma@example.com', '1995-03-15', NOW(), NOW()),
  ('Priya Patel', '9876543211', 'priya.patel@example.com', '1998-07-22', NOW(), NOW()),
  ('Amit Kumar', '9876543212', 'amit.kumar@example.com', '1992-11-08', NOW(), NOW()),
  ('Sneha Singh', '9876543213', 'sneha.singh@example.com', '2000-01-30', NOW(), NOW()),
  ('Rohan Verma', '9876543214', 'rohan.verma@example.com', '1997-05-19', NOW(), NOW())
ON CONFLICT (phone) DO NOTHING;

-- Add subscriptions for some customers
DO $$
DECLARE
  customer_id_1 UUID;
  customer_id_2 UUID;
  gold_plan_id UUID;
  silver_plan_id UUID;
BEGIN
  SELECT id INTO customer_id_1 FROM public.customers WHERE phone = '9876543210' LIMIT 1;
  SELECT id INTO customer_id_2 FROM public.customers WHERE phone = '9876543211' LIMIT 1;
  SELECT id INTO gold_plan_id FROM public.subscription_plans WHERE name = 'Gold Membership' LIMIT 1;
  SELECT id INTO silver_plan_id FROM public.subscription_plans WHERE name = 'Silver Membership' LIMIT 1;

  IF customer_id_1 IS NOT NULL AND gold_plan_id IS NOT NULL THEN
    INSERT INTO public.customer_subscriptions (customer_id, subscription_id, purchased_at, expires_at, is_active)
    VALUES (customer_id_1, gold_plan_id, NOW() - INTERVAL '10 days', NOW() + INTERVAL '80 days', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF customer_id_2 IS NOT NULL AND silver_plan_id IS NOT NULL THEN
    INSERT INTO public.customer_subscriptions (customer_id, subscription_id, purchased_at, expires_at, is_active)
    VALUES (customer_id_2, silver_plan_id, NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;