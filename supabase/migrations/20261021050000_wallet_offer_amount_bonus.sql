-- Treat paid_credits as the total wallet value customers receive. The bonus is
-- the difference between that value and the amount paid.
UPDATE public.wallet_offers
SET paid_credits = round(paid_credits + bonus_credits, 2);

ALTER TABLE public.wallet_offers
  DROP COLUMN IF EXISTS bonus_percentage;
