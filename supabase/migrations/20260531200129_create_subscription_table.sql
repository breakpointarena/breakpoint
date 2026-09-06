-- Create the Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- If a customer is deleted, wipe their subscription history (CASCADE)
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  -- Don't allow an admin to delete a plan if people have active subscriptions to it (RESTRICT)
  subscription_plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  payment_id TEXT,
  amount_paid NUMERIC NOT NULL CHECK (amount_paid >= 0),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optimize queries looking for a specific customer's history or active subscriptions
CREATE INDEX IF NOT EXISTS idx_subs_customer ON public.subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON public.subscriptions(status);

-- Enable Row Level Security on the table
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view subscription history
CREATE POLICY "Allow authenticated read access to subscriptions"
ON public.subscriptions FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert new subscription records (Activation)
CREATE POLICY "Allow authenticated insert to subscriptions"
ON public.subscriptions FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update subscriptions (e.g., marking as expired)
CREATE POLICY "Allow authenticated update to subscriptions"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);