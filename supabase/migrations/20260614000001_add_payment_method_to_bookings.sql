-- ================================================
-- Add payment_method field to bookings table
-- ================================================
-- Purpose: Track how payment was received (cash/card/upi)
-- Date: 2026-06-14
-- ================================================

-- Add payment_method column
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi'));

-- Add comment
COMMENT ON COLUMN public.bookings.payment_method IS 'Payment method used: cash, card, or upi (null = online/not specified)';
