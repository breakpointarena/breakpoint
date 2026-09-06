-- ================================================
-- Simplify Promo Codes Schema
-- ================================================
-- Removes advanced features that are not currently implemented:
-- - usage_limit and usage_count (no tracking implemented)
-- - max_discount (not used in current implementation)
-- - min_order_amount (not used in validation)
-- - applicable_to (not used in checkout flow)
--
-- These can be added back in future migrations if needed.
-- ================================================

-- Note: This migration assumes the promo_codes table was created
-- with these columns. If starting fresh, they may not exist.

-- Remove columns if they exist
ALTER TABLE public.promo_codes
DROP COLUMN IF EXISTS max_discount,
DROP COLUMN IF EXISTS usage_limit,
DROP COLUMN IF EXISTS usage_count,
DROP COLUMN IF EXISTS min_order_amount,
DROP COLUMN IF EXISTS applicable_to;

-- Remove the usage check constraint if it exists
ALTER TABLE public.promo_codes
DROP CONSTRAINT IF EXISTS valid_usage;

-- Update the valid_dates constraint to ensure it exists
ALTER TABLE public.promo_codes
DROP CONSTRAINT IF EXISTS valid_dates;

ALTER TABLE public.promo_codes
ADD CONSTRAINT valid_dates CHECK (valid_until > valid_from);

-- Update index to match new schema (drop and recreate if needed)
DROP INDEX IF EXISTS idx_promo_active;
CREATE INDEX IF NOT EXISTS idx_promo_active ON public.promo_codes(is_active, valid_from, valid_until);

-- Add comment for documentation
COMMENT ON TABLE public.promo_codes IS 'Simplified promo codes table for basic discount functionality. Advanced features (usage tracking, min order, applicability) can be added in future migrations.';
