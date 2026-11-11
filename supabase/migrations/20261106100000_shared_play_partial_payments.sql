ALTER TABLE public.shared_play_participants
  ADD COLUMN IF NOT EXISTS charge_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

UPDATE public.shared_play_participants participant
SET charge_amount = GREATEST(
  COALESCE(participant.settled_amount, 0),
  COALESCE(participant.billed_amount, 0) + COALESCE((
    SELECT SUM(line_total)
    FROM public.booking_food_items
    WHERE participant_id = participant.id
  ), 0)
)
WHERE participant.checked_out_at IS NOT NULL
  AND participant.charge_amount = 0;

CREATE TABLE IF NOT EXISTS public.shared_play_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.shared_play_participants(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  charge_amount NUMERIC(10, 2) NOT NULL CHECK (charge_amount >= 0),
  cash_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  card_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (card_amount >= 0),
  upi_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (upi_amount >= 0),
  wallet_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (wallet_amount >= 0),
  paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, idempotency_key)
);

ALTER TABLE public.shared_play_payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages shared-play payment events"
  ON public.shared_play_payment_events FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.shared_play_payment_events FROM anon, authenticated;
GRANT ALL ON public.shared_play_payment_events TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_settle_shared_play_participant(
  p_booking_id UUID,
  p_participant_id UUID,
  p_charge_amount NUMERIC,
  p_cash_amount NUMERIC,
  p_card_amount NUMERIC,
  p_upi_amount NUMERIC,
  p_use_wallet BOOLEAN,
  p_checkout_at TIMESTAMPTZ,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_participant public.shared_play_participants%ROWTYPE;
  v_existing public.shared_play_payment_events%ROWTYPE;
  v_wallet_amount NUMERIC(10, 2) := 0;
  v_available NUMERIC(10, 2) := 0;
  v_wallet_transaction_id UUID;
  v_amount_paid NUMERIC(10, 2);
  v_external_amount NUMERIC(10, 2);
  v_payment_amount NUMERIC(10, 2);
  v_charge_amount NUMERIC(10, 2);
  v_balance_due NUMERIC(10, 2);
  v_food_amount NUMERIC(10, 2);
BEGIN
  IF p_charge_amount IS NULL OR p_cash_amount IS NULL OR p_card_amount IS NULL OR p_upi_amount IS NULL
     OR p_use_wallet IS NULL OR p_checkout_at IS NULL
     OR p_charge_amount < 0 OR p_cash_amount < 0 OR p_card_amount < 0 OR p_upi_amount < 0
     OR p_charge_amount <> round(p_charge_amount, 2)
     OR p_cash_amount <> round(p_cash_amount, 2)
     OR p_card_amount <> round(p_card_amount, 2)
     OR p_upi_amount <> round(p_upi_amount, 2)
     OR length(trim(COALESCE(p_idempotency_key, ''))) < 12 THEN
    RAISE EXCEPTION 'Participant payment must use valid non-negative rupee amounts';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND OR v_booking.status NOT IN ('checked_in', 'completed') OR NOT v_booking.shared_play_enabled THEN
    RAISE EXCEPTION 'This shared-play booking is no longer active';
  END IF;

  SELECT * INTO v_participant
  FROM public.shared_play_participants
  WHERE id = p_participant_id AND booking_id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found in this booking'; END IF;

  SELECT * INTO v_existing
  FROM public.shared_play_payment_events
  WHERE participant_id = p_participant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.charge_amount <> p_charge_amount
       OR v_existing.cash_amount <> p_cash_amount
       OR v_existing.card_amount <> p_card_amount
       OR v_existing.upi_amount <> p_upi_amount THEN
      RAISE EXCEPTION 'This payment request was already used with different amounts';
    END IF;
    RETURN jsonb_build_object(
      'charge_amount', v_existing.charge_amount,
      'paid_amount', v_existing.paid_amount,
      'wallet_amount', v_existing.wallet_amount,
      'external_amount', v_existing.cash_amount + v_existing.card_amount + v_existing.upi_amount,
      'remaining_due', GREATEST(0, round(v_participant.charge_amount - v_participant.settled_amount, 2)),
      'wallet_transaction_id', NULL,
      'already_processed', true
    );
  END IF;

  IF v_participant.checked_out_at IS NULL AND v_booking.status <> 'checked_in' THEN
    RAISE EXCEPTION 'A participant must check out before payment can be recorded';
  END IF;

  IF v_participant.charge_amount > 0 AND abs(v_participant.charge_amount - p_charge_amount) > 0.01 THEN
    RAISE EXCEPTION 'Participant bill changed; refresh the bill and try again';
  END IF;
  v_charge_amount := CASE WHEN v_participant.charge_amount > 0 THEN v_participant.charge_amount ELSE p_charge_amount END;
  v_balance_due := round(GREATEST(0, v_charge_amount - v_participant.settled_amount), 2);
  v_external_amount := round(p_cash_amount + p_card_amount + p_upi_amount, 2);

  IF p_use_wallet THEN
    IF v_participant.customer_id IS NULL THEN
      RAISE EXCEPTION 'Link this participant to a customer account to use wallet credits';
    END IF;
    SELECT GREATEST(0, balance - reserved_balance)::NUMERIC(10, 2)
      INTO v_available
      FROM public.customer_wallet_balances
      WHERE customer_id = v_participant.customer_id;
    v_wallet_amount := LEAST(v_balance_due, COALESCE(v_available, 0));
  END IF;

  v_payment_amount := round(v_external_amount + v_wallet_amount, 2);
  IF v_payment_amount > v_balance_due + 0.01 THEN
    RAISE EXCEPTION 'Payment cannot exceed this participant''s remaining balance of ₹%', v_balance_due;
  END IF;
  IF v_payment_amount <= 0 AND v_balance_due > 0 THEN
    RAISE EXCEPTION 'Enter a payment greater than zero';
  END IF;

  IF v_wallet_amount > 0 THEN
    v_wallet_transaction_id := public.wallet_spend_credits(
      v_participant.customer_id,
      v_wallet_amount,
      p_booking_id,
      'shared-play-checkout:' || p_idempotency_key,
      NULL
    );
    UPDATE public.wallet_transactions
      SET description = 'Wallet applied to shared-play checkout for ' || v_participant.name
      WHERE id = v_wallet_transaction_id;
  END IF;

  IF v_participant.checked_out_at IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.shared_play_periods
      WHERE participant_id = p_participant_id
        AND ended_at IS NULL
        AND started_at >= p_checkout_at
    ) THEN
      RAISE EXCEPTION 'Sit this participant out before checkout';
    END IF;

    UPDATE public.shared_play_periods
      SET ended_at = p_checkout_at
      WHERE participant_id = p_participant_id AND ended_at IS NULL;

    SELECT COALESCE(SUM(line_total), 0)::NUMERIC(10, 2) INTO v_food_amount
    FROM public.booking_food_items
    WHERE participant_id = p_participant_id;

    UPDATE public.shared_play_participants
      SET checked_out_at = p_checkout_at,
          charge_amount = v_charge_amount,
          billed_amount = GREATEST(0, v_charge_amount - v_food_amount)
      WHERE id = p_participant_id;

    UPDATE public.booking_food_items
      SET status = 'preparing'
      WHERE participant_id = p_participant_id AND status = 'pending';
  ELSE
    UPDATE public.shared_play_participants
      SET charge_amount = v_charge_amount
      WHERE id = p_participant_id;
  END IF;

  INSERT INTO public.shared_play_payment_events (
    booking_id, participant_id, idempotency_key, charge_amount,
    cash_amount, card_amount, upi_amount, wallet_amount, paid_amount
  ) VALUES (
    p_booking_id, p_participant_id, p_idempotency_key, v_charge_amount,
    p_cash_amount, p_card_amount, p_upi_amount, v_wallet_amount, v_payment_amount
  );

  UPDATE public.shared_play_participants
    SET settled_amount = settled_amount + v_payment_amount,
        wallet_amount = wallet_amount + v_wallet_amount
    WHERE id = p_participant_id;

  v_amount_paid := round(v_booking.amount_paid + v_payment_amount, 2);
  UPDATE public.bookings
    SET amount_paid = v_amount_paid,
        cash_amount = cash_amount + p_cash_amount,
        card_amount = card_amount + p_card_amount,
        upi_amount = upi_amount + p_upi_amount,
        wallet_amount = wallet_amount + v_wallet_amount,
        payment_status = CASE
          WHEN v_booking.status = 'checked_in' THEN CASE WHEN v_amount_paid > 0 THEN 'partial' ELSE 'pending' END
          WHEN v_amount_paid >= total_amount - 0.01 THEN 'paid'
          WHEN v_amount_paid > 0 THEN 'partial'
          ELSE 'pending'
        END,
        updated_at = NOW()
    WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'charge_amount', v_charge_amount,
    'paid_amount', v_payment_amount,
    'wallet_amount', v_wallet_amount,
    'external_amount', v_external_amount,
    'remaining_due', GREATEST(0, round(v_charge_amount - v_participant.settled_amount - v_payment_amount, 2)),
    'wallet_transaction_id', v_wallet_transaction_id,
    'already_processed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.wallet_settle_shared_play_participant(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_settle_shared_play_participant(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TIMESTAMPTZ, TEXT)
  TO service_role;
