-- ================================================
-- Create Expenses Table
-- ================================================
-- Purpose: Track business expenses for profit calculation
-- Date: 2026-06-14
-- ================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for date-based queries
CREATE INDEX idx_expenses_date ON public.expenses(date DESC);

-- Index for created_at queries
CREATE INDEX idx_expenses_created_at ON public.expenses(created_at DESC);

-- Add comments
COMMENT ON TABLE public.expenses IS 'Business expenses for profit/loss tracking';
COMMENT ON COLUMN public.expenses.date IS 'Date when expense occurred';
COMMENT ON COLUMN public.expenses.description IS 'Description of the expense';
COMMENT ON COLUMN public.expenses.amount IS 'Expense amount in rupees';
COMMENT ON COLUMN public.expenses.created_by IS 'Admin user who created the expense';

-- Enable Row Level Security
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role has full access to expenses"
  ON public.expenses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
