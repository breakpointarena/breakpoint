ALTER TABLE public.shared_play_participants
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.booking_food_items
  ADD COLUMN IF NOT EXISTS participant_id UUID
    REFERENCES public.shared_play_participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS booking_food_items_participant_idx
  ON public.booking_food_items(participant_id) WHERE participant_id IS NOT NULL;

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
  v_wallet_amount NUMERIC(10, 2) := 0;
  v_available NUMERIC(10, 2) := 0;
  v_wallet_transaction_id UUID;
  v_amount_paid NUMERIC(10, 2);
  v_external_amount NUMERIC(10, 2);
BEGIN
  IF p_charge_amount IS NULL OR p_cash_amount IS NULL OR p_card_amount IS NULL OR p_upi_amount IS NULL
     OR p_charge_amount < 0 OR p_cash_amount < 0 OR p_card_amount < 0 OR p_upi_amount < 0
     OR p_charge_amount <> round(p_charge_amount, 2)
     OR p_cash_amount <> round(p_cash_amount, 2)
     OR p_card_amount <> round(p_card_amount, 2)
     OR p_upi_amount <> round(p_upi_amount, 2) THEN
    RAISE EXCEPTION 'Participant payment must use non-negative rupee amounts';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.status <> 'checked_in' OR NOT v_booking.shared_play_enabled THEN
    RAISE EXCEPTION 'This shared-play booking is no longer active';
  END IF;

  SELECT * INTO v_participant FROM public.shared_play_participants
  WHERE id = p_participant_id AND booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found in this booking'; END IF;
  IF v_participant.checked_out_at IS NOT NULL THEN RAISE EXCEPTION 'This participant has already checked out'; END IF;

  v_external_amount := round(p_cash_amount + p_card_amount + p_upi_amount, 2);
  IF p_use_wallet THEN
    IF v_participant.customer_id IS NULL THEN
      RAISE EXCEPTION 'Link this participant to a customer account to use wallet credits';
    END IF;
    SELECT GREATEST(0, balance - reserved_balance)::NUMERIC(10, 2)
      INTO v_available
      FROM public.customer_wallet_balances
      WHERE customer_id = v_participant.customer_id;
    v_wallet_amount := LEAST(p_charge_amount, COALESCE(v_available, 0));
  END IF;

  IF abs(round(v_external_amount + v_wallet_amount, 2) - p_charge_amount) > 0.01 THEN
    RAISE EXCEPTION 'Payment amount changed; refresh the participant bill and try again';
  END IF;
  IF p_charge_amount > 0 AND v_external_amount = 0 AND v_wallet_amount = 0 THEN
    RAISE EXCEPTION 'The participant payment is not covered';
  END IF;

  IF v_wallet_amount > 0 THEN
    IF length(trim(COALESCE(p_idempotency_key, ''))) < 12 THEN
      RAISE EXCEPTION 'Wallet payment request is invalid';
    END IF;
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

  UPDATE public.shared_play_periods
    SET ended_at = p_checkout_at
    WHERE participant_id = p_participant_id AND ended_at IS NULL;

  UPDATE public.shared_play_participants
    SET checked_out_at = p_checkout_at,
        billed_amount = GREATEST(0, p_charge_amount - COALESCE((
          SELECT SUM(line_total) FROM public.booking_food_items
          WHERE participant_id = p_participant_id
        ), 0)),
        settled_amount = p_charge_amount,
        wallet_amount = v_wallet_amount
    WHERE id = p_participant_id;

  UPDATE public.booking_food_items
    SET status = 'preparing'
    WHERE participant_id = p_participant_id AND status = 'pending';

  v_amount_paid := round(v_booking.amount_paid + p_charge_amount, 2);
  UPDATE public.bookings
    SET amount_paid = v_amount_paid,
        cash_amount = cash_amount + p_cash_amount,
        card_amount = card_amount + p_card_amount,
        upi_amount = upi_amount + p_upi_amount,
        wallet_amount = wallet_amount + v_wallet_amount,
        payment_status = CASE
          WHEN v_amount_paid >= total_amount - 0.01 THEN 'paid'
          WHEN v_amount_paid > 0 THEN 'partial'
          ELSE 'pending'
        END,
        updated_at = now()
    WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'charge_amount', p_charge_amount,
    'wallet_amount', v_wallet_amount,
    'external_amount', v_external_amount,
    'wallet_transaction_id', v_wallet_transaction_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.wallet_settle_shared_play_participant(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_settle_shared_play_participant(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TIMESTAMPTZ, TEXT)
  TO service_role;
