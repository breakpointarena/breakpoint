-- Migration: Fix booking total_amount calculation to include happy_hour_discount
-- Date: 2026-07-12
-- Description: Recalculate all booking totals to properly account for happy_hour_discount

-- Fix all existing bookings where total_amount is incorrect
UPDATE bookings
SET total_amount = (
    COALESCE(device_subtotal, 0) +
    COALESCE(food_subtotal, 0) -
    COALESCE(subscription_discount, 0) -
    COALESCE(promo_discount, 0) -
    COALESCE(happy_hour_discount, 0)
)
WHERE
    -- Only update if the current total is incorrect
    total_amount != (
        COALESCE(device_subtotal, 0) +
        COALESCE(food_subtotal, 0) -
        COALESCE(subscription_discount, 0) -
        COALESCE(promo_discount, 0) -
        COALESCE(happy_hour_discount, 0)
    );

-- Fix payment status based on corrected amounts
UPDATE bookings
SET payment_status = CASE
    WHEN amount_paid >= total_amount THEN 'paid'
    WHEN amount_paid > 0 AND amount_paid < total_amount THEN 'partial'
    ELSE 'pending'
END
WHERE payment_status != CASE
    WHEN amount_paid >= total_amount THEN 'paid'
    WHEN amount_paid > 0 AND amount_paid < total_amount THEN 'partial'
    ELSE 'pending'
END;

-- Add comment explaining the calculation
COMMENT ON COLUMN public.bookings.total_amount IS 'Total amount = (device_subtotal + food_subtotal) - (subscription_discount + promo_discount + happy_hour_discount)';
