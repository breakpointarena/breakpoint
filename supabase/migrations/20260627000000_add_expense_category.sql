-- ================================================
-- Add Expense Category (OpEx/CapEx)
-- ================================================
-- Purpose: Differentiate between Operational and Capital Expenditure
-- Date: 2026-06-27
-- ================================================

-- Add category column to expenses table
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'operational';

-- Add constraint to ensure only valid categories
ALTER TABLE public.expenses
ADD CONSTRAINT expenses_category_check
CHECK (category IN ('operational', 'capital'));

-- Add index for category-based queries
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- Add comments
COMMENT ON COLUMN public.expenses.category IS 'Expense category: operational (OpEx) or capital (CapEx)';

-- Update existing expenses to operational by default (already done by DEFAULT clause)
-- No need for UPDATE statement as DEFAULT handles new constraint
