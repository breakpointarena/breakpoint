-- Create customer_subscriptions table to track customer subscription purchases
-- This replaces the old subscription_purchases table

CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,

  -- Purchase details
  purchased_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_customer
  ON public.customer_subscriptions(customer_id, is_active);

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_expiry
  ON public.customer_subscriptions(expires_at, is_active);

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_subscription
  ON public.customer_subscriptions(subscription_id);

-- Add comments
COMMENT ON TABLE public.customer_subscriptions IS 'Tracks customer subscription purchases and their validity';
COMMENT ON COLUMN public.customer_subscriptions.is_active IS 'Whether subscription is currently active (can be manually disabled)';
COMMENT ON COLUMN public.customer_subscriptions.expires_at IS 'Expiration timestamp for the subscription';

-- Grant permissions
GRANT ALL ON public.customer_subscriptions TO service_role;
GRANT SELECT ON public.customer_subscriptions TO anon;
GRANT SELECT ON public.customer_subscriptions TO authenticated;

-- Enable RLS
ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public read customer_subscriptions"
  ON public.customer_subscriptions FOR SELECT USING (true);

CREATE POLICY "Allow service role all on customer_subscriptions"
  ON public.customer_subscriptions FOR ALL USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_customer_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customer_subscriptions_updated_at
  BEFORE UPDATE ON public.customer_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_subscriptions_updated_at();
