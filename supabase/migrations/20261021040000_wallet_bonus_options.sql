ALTER TABLE public.wallet_offers
  DROP CONSTRAINT IF EXISTS wallet_offers_check2;

DO $migration$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.wallet_offers'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%bonus_credits%bonus_validity_days%'
  LOOP
    EXECUTE format('ALTER TABLE public.wallet_offers DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.wallet_add_credits(
  p_customer_id UUID,
  p_paid_amount NUMERIC,
  p_bonus_amount NUMERIC,
  p_bonus_expires_at TIMESTAMPTZ,
  p_kind TEXT,
  p_description TEXT,
  p_source TEXT,
  p_reference_id UUID,
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
  v_existing public.wallet_transactions%ROWTYPE;
  v_amount NUMERIC(10, 2);
BEGIN
  IF p_paid_amount < 0 OR p_bonus_amount < 0
     OR p_paid_amount + p_bonus_amount <= 0 THEN
    RAISE EXCEPTION 'Wallet credit amounts are invalid';
  END IF;

  IF p_kind NOT IN ('top_up', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'Unsupported wallet credit type';
  END IF;

  INSERT INTO public.customer_wallets (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING;

  PERFORM 1 FROM public.customer_wallets
  WHERE customer_id = p_customer_id
  FOR UPDATE;

  SELECT * INTO v_existing
  FROM public.wallet_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.customer_id <> p_customer_id
       OR v_existing.kind <> p_kind
       OR v_existing.amount <> round(p_paid_amount + p_bonus_amount, 2)
       OR v_existing.paid_amount <> round(p_paid_amount, 2)
       OR v_existing.bonus_amount <> round(p_bonus_amount, 2) THEN
      RAISE EXCEPTION 'Wallet idempotency key was already used for a different credit';
    END IF;
    RETURN v_existing.id;
  END IF;

  v_amount := round(p_paid_amount + p_bonus_amount, 2);
  INSERT INTO public.wallet_transactions (
    customer_id, kind, direction, amount, paid_amount, bonus_amount,
    description, source, reference_id, idempotency_key, created_by
  ) VALUES (
    p_customer_id, p_kind, 'credit', v_amount,
    round(p_paid_amount, 2), round(p_bonus_amount, 2),
    p_description, p_source, p_reference_id, p_idempotency_key, p_created_by
  ) RETURNING id INTO v_transaction_id;

  IF p_paid_amount > 0 THEN
    INSERT INTO public.wallet_credit_lots (
      customer_id, transaction_id, credit_type, original_amount, remaining_amount
    ) VALUES (
      p_customer_id, v_transaction_id, 'paid',
      round(p_paid_amount, 2), round(p_paid_amount, 2)
    );
  END IF;

  IF p_bonus_amount > 0 THEN
    INSERT INTO public.wallet_credit_lots (
      customer_id, transaction_id, credit_type, original_amount, remaining_amount, expires_at
    ) VALUES (
      p_customer_id, v_transaction_id, 'bonus',
      round(p_bonus_amount, 2), round(p_bonus_amount, 2), p_bonus_expires_at
    );
  END IF;

  RETURN v_transaction_id;
END;
$function$;
