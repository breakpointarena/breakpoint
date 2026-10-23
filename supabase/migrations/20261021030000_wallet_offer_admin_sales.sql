BEGIN;

ALTER TABLE public.wallet_transactions
  ADD COLUMN sale_payment_method TEXT;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_sale_payment_method_check
  CHECK (
    sale_payment_method IS NULL OR (
      sale_payment_method IN ('cash', 'card', 'upi')
      AND kind = 'top_up'
      AND direction = 'credit'
      AND source = 'admin_wallet_sale'
    )
  );

CREATE OR REPLACE FUNCTION public.wallet_add_admin_sale(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_payment_method TEXT,
  p_idempotency_key TEXT,
  p_created_by TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_transaction_id UUID;
  v_updated_rows INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2)
     OR p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card', 'upi')
     OR length(trim(COALESCE(p_description, ''))) < 3 THEN
    RAISE EXCEPTION 'Wallet sale details are invalid';
  END IF;

  v_transaction_id := public.wallet_add_credits(
    p_customer_id,
    p_amount,
    0,
    NULL,
    'top_up',
    trim(p_description),
    'admin_wallet_sale',
    NULL,
    p_idempotency_key,
    p_created_by
  );

  UPDATE public.wallet_transactions
  SET sale_payment_method = p_payment_method
  WHERE id = v_transaction_id
    AND customer_id = p_customer_id
    AND kind = 'top_up'
    AND direction = 'credit'
    AND source = 'admin_wallet_sale'
    AND (sale_payment_method IS NULL OR sale_payment_method = p_payment_method);

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION 'Wallet sale idempotency key was already used for a different sale';
  END IF;

  RETURN v_transaction_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.wallet_add_admin_sale(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_add_admin_sale(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT)
TO service_role;

COMMIT;
