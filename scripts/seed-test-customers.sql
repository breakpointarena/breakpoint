-- Seed test customers for development

-- Insert test customers
INSERT INTO public.customers (id, name, phone, email, date_of_birth, created_at, updated_at) VALUES
  (gen_random_uuid(), 'Rahul Sharma', '9876543210', 'rahul.sharma@example.com', '1995-03-15', NOW(), NOW()),
  (gen_random_uuid(), 'Priya Patel', '9876543211', 'priya.patel@example.com', '1998-07-22', NOW(), NOW()),
  (gen_random_uuid(), 'Amit Kumar', '9876543212', 'amit.kumar@example.com', '1992-11-08', NOW(), NOW()),
  (gen_random_uuid(), 'Sneha Singh', '9876543213', 'sneha.singh@example.com', '2000-01-30', NOW(), NOW()),
  (gen_random_uuid(), 'Rohan Verma', '9876543214', 'rohan.verma@example.com', '1997-05-19', NOW(), NOW())
ON CONFLICT (phone) DO NOTHING;

-- Add some customers with subscriptions
DO $$
DECLARE
  customer_id_1 UUID;
  customer_id_2 UUID;
  gold_plan_id UUID;
  silver_plan_id UUID;
BEGIN
  -- Get customer IDs
  SELECT id INTO customer_id_1 FROM public.customers WHERE phone = '9876543210';
  SELECT id INTO customer_id_2 FROM public.customers WHERE phone = '9876543211';

  -- Get subscription plan IDs
  SELECT id INTO gold_plan_id FROM public.subscriptions WHERE name = 'Gold Membership';
  SELECT id INTO silver_plan_id FROM public.subscriptions WHERE name = 'Silver Membership';

  -- Add active subscriptions for some customers
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

SELECT '✅ Test customers seeded successfully!' AS status;
