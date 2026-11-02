BEGIN;

DO $cleanup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions t
    JOIN public.wallet_credit_lots l ON l.transaction_id = t.id
    JOIN public.wallet_spend_allocations a ON a.credit_lot_id = l.id
    WHERE t.source = 'hour_pack_conversion'
  ) THEN
    RAISE EXCEPTION
      'Hour-pack conversion credit has already been spent; review the wallet ledger before removing it.';
  END IF;
END;
$cleanup$;

DELETE FROM public.wallet_credit_lots
WHERE transaction_id IN (
  SELECT id
  FROM public.wallet_transactions
  WHERE source = 'hour_pack_conversion'
);

DELETE FROM public.wallet_transactions
WHERE source = 'hour_pack_conversion';

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('top_up', 'spend', 'refund', 'adjustment', 'expiry'));

ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS hour_pack_converted_minutes,
  DROP COLUMN IF EXISTS hour_pack_converted_credit;

COMMIT;
