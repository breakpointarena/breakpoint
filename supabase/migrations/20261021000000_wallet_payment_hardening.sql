ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_purpose_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_purpose_check
  CHECK (purpose IN ('device_booking', 'food_order', 'subscription', 'wallet_top_up'));
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS wallet_transaction_id UUID
    REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.wallet_spend_credits(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_reference_id UUID,
  p_idempotency_key TEXT,
  p_reservation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_transaction_id UUID;
  v_existing public.wallet_transactions%ROWTYPE;
  v_reservation public.wallet_reservations%ROWTYPE;
  v_balance NUMERIC(10, 2);
  v_lot RECORD;
  v_take NUMERIC(10, 2);
  v_to_spend NUMERIC(10, 2);
  v_paid NUMERIC(10, 2) := 0;
  v_bonus NUMERIC(10, 2) := 0;
BEGIN
  IF p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Wallet spend amount must be a positive rupee amount';
  END IF;

  INSERT INTO public.customer_wallets (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING;
  PERFORM 1 FROM public.customer_wallets
  WHERE customer_id = p_customer_id
  FOR UPDATE;
  PERFORM public.wallet_expire_bonus_credits(p_customer_id);

  SELECT * INTO v_existing
  FROM public.wallet_transactions
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.customer_id <> p_customer_id
       OR v_existing.kind <> 'spend'
       OR v_existing.amount <> round(p_amount, 2)
       OR v_existing.reference_id IS DISTINCT FROM p_reference_id THEN
      RAISE EXCEPTION 'Wallet spend idempotency key was already used for a different spend';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation
    FROM public.wallet_reservations
    WHERE id = p_reservation_id
      AND customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND OR v_reservation.status <> 'reserved'
       OR v_reservation.expires_at <= now()
       OR v_reservation.amount + 0.001 < p_amount THEN
      RAISE EXCEPTION 'Wallet reservation is no longer valid';
    END IF;
  END IF;

  SELECT balance - reserved_balance
    + CASE WHEN p_reservation_id IS NOT NULL THEN v_reservation.amount ELSE 0 END
    INTO v_balance
  FROM public.customer_wallet_balances
  WHERE customer_id = p_customer_id;

  IF v_balance + 0.001 < p_amount THEN
    RAISE EXCEPTION 'Insufficient available wallet credit';
  END IF;

  INSERT INTO public.wallet_transactions (
    customer_id, kind, direction, amount, paid_amount, bonus_amount,
    description, source, reference_id, idempotency_key
  ) VALUES (
    p_customer_id, 'spend', 'debit', round(p_amount, 2),
    round(p_amount, 2), 0, 'Wallet applied to purchase', 'wallet_spend',
    p_reference_id, p_idempotency_key
  ) RETURNING id INTO v_transaction_id;

  v_to_spend := round(p_amount, 2);
  FOR v_lot IN
    SELECT id, credit_type, remaining_amount
    FROM public.wallet_credit_lots
    WHERE customer_id = p_customer_id
      AND remaining_amount > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY CASE WHEN credit_type = 'bonus' THEN 0 ELSE 1 END,
             expires_at ASC NULLS LAST, created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_to_spend <= 0;
    v_take := LEAST(v_to_spend, v_lot.remaining_amount);
    UPDATE public.wallet_credit_lots
    SET remaining_amount = remaining_amount - v_take
    WHERE id = v_lot.id;
    INSERT INTO public.wallet_spend_allocations(transaction_id, credit_lot_id, amount)
    VALUES (v_transaction_id, v_lot.id, v_take);
    IF v_lot.credit_type = 'bonus' THEN
      v_bonus := v_bonus + v_take;
    ELSE
      v_paid := v_paid + v_take;
    END IF;
    v_to_spend := v_to_spend - v_take;
  END LOOP;

  IF v_to_spend > 0.001 THEN
    RAISE EXCEPTION 'Wallet balance changed while applying credit';
  END IF;

  UPDATE public.wallet_transactions
  SET paid_amount = round(v_paid, 2), bonus_amount = round(v_bonus, 2)
  WHERE id = v_transaction_id;

  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.wallet_reservations
    SET status = 'committed', transaction_id = v_transaction_id
    WHERE id = p_reservation_id;
  END IF;

  RETURN v_transaction_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wallet_refund_spend(
  p_transaction_id UUID,
  p_idempotency_key TEXT,
  p_description TEXT DEFAULT 'Wallet credit restored'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_original public.wallet_transactions%ROWTYPE;
  v_existing public.wallet_transactions%ROWTYPE;
  v_refund_id UUID;
  v_allocation RECORD;
  v_paid NUMERIC(10, 2) := 0;
  v_bonus NUMERIC(10, 2) := 0;
BEGIN
  SELECT * INTO v_original
  FROM public.wallet_transactions
  WHERE id = p_transaction_id AND kind = 'spend' AND direction = 'debit';
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet spend was not found'; END IF;

  PERFORM 1 FROM public.customer_wallets
  WHERE customer_id = v_original.customer_id
  FOR UPDATE;

  SELECT * INTO v_existing
  FROM public.wallet_transactions
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.reverses_transaction_id <> p_transaction_id
       OR v_existing.kind <> 'refund' THEN
      RAISE EXCEPTION 'Wallet refund idempotency key was already used for another refund';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reverses_transaction_id = p_transaction_id
  ) THEN
    RAISE EXCEPTION 'Wallet spend has already been reversed';
  END IF;

  INSERT INTO public.wallet_transactions (
    customer_id, kind, direction, amount, paid_amount, bonus_amount,
    description, source, reference_id, idempotency_key, reverses_transaction_id
  ) VALUES (
    v_original.customer_id, 'refund', 'credit', v_original.amount,
    v_original.amount, 0, p_description, 'wallet_refund', v_original.reference_id,
    p_idempotency_key, p_transaction_id
  ) RETURNING id INTO v_refund_id;

  FOR v_allocation IN
    SELECT a.amount, l.credit_type, l.expires_at
    FROM public.wallet_spend_allocations a
    JOIN public.wallet_credit_lots l ON l.id = a.credit_lot_id
    WHERE a.transaction_id = p_transaction_id
  LOOP
    INSERT INTO public.wallet_credit_lots (
      customer_id, transaction_id, credit_type, original_amount,
      remaining_amount, expires_at
    ) VALUES (
      v_original.customer_id, v_refund_id, v_allocation.credit_type,
      v_allocation.amount, v_allocation.amount, v_allocation.expires_at
    );
    IF v_allocation.credit_type = 'bonus' THEN
      v_bonus := v_bonus + v_allocation.amount;
    ELSE
      v_paid := v_paid + v_allocation.amount;
    END IF;
  END LOOP;

  UPDATE public.wallet_transactions
  SET paid_amount = round(v_paid, 2), bonus_amount = round(v_bonus, 2)
  WHERE id = v_refund_id;

  RETURN v_refund_id;
END;
$function$;
