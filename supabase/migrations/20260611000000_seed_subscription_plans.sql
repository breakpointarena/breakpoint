-- Seed Subscription Plans with actual membership data
INSERT INTO public.subscription_plans (name, description, duration_months, price, discount_percentage, is_active, created_at) VALUES
(
  'Starter Membership',
  'Perfect for casual gamers. Get up to 5% savings on all bookings. Includes access to all gaming zones, priority booking, and exclusive member-only events.',
  1,
  999,
  5,
  true,
  CURRENT_TIMESTAMP
),
(
  'Pro Membership',
  'Best for regular players. Enjoy up to 10% savings on all bookings. Includes all Starter benefits plus extended gaming hours, 2 guest passes per month, and priority support.',
  3,
  2499,
  10,
  true,
  CURRENT_TIMESTAMP
),
(
  'Elite Membership',
  'For serious gamers. Save up to 15% on all bookings. Includes all Pro benefits plus free beverage every visit, 4 guest passes per month, tournament entry access, and birthday special perks.',
  6,
  4499,
  15,
  true,
  CURRENT_TIMESTAMP
),
(
  'Legend Membership',
  'Ultimate gaming experience. Maximum savings of up to 20% on all bookings. Includes all Elite benefits plus VIP lounge access, unlimited guest passes, exclusive merchandise, and dedicated account manager.',
  12,
  7999,
  20,
  true,
  CURRENT_TIMESTAMP
);
