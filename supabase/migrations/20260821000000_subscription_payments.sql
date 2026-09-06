-- Subscriptions can be paid for.
--
-- Until now they could not. `activateSubscriptionPlan` was called straight from
-- the purchase page with a payment id the browser made up:
--
--     const mockPaymentId = `pay_mock_${Math.floor(Math.random() * 10000)}`
--
-- so every membership in production was recorded as paid without any money being
-- taken - ten of them, totalling 26,491 rupees. Device bookings and food orders
-- have gone through Razorpay since 20260803000000; this brings the third thing
-- the arena sells onto the same path.
--
-- Two changes, both additive:
--
--  1. `purpose` accepts 'subscription'. The CHECK is rewritten rather than
--     dropped, so an unexpected value is still refused.
--  2. `subscription_id` records what a paid order actually created, the way
--     `booking_id` already does. Nullable, because the row is written before
--     fulfilment and only filled in once the membership exists.

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_purpose_check;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_purpose_check
  CHECK (purpose = ANY (ARRAY['device_booking'::text, 'food_order'::text, 'subscription'::text]));

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id);

-- Answering "was this membership paid for, and against which order" without
-- scanning every payment row. Partial, because only subscription orders ever
-- carry the column and the rest would only make the index bigger.
CREATE INDEX IF NOT EXISTS idx_payment_orders_subscription
  ON public.payment_orders (subscription_id)
  WHERE subscription_id IS NOT NULL;

COMMENT ON COLUMN public.payment_orders.subscription_id IS
  'The membership this order created, once fulfilment has run. Null until then, '
  'and null forever on orders that failed or were refunded.';
