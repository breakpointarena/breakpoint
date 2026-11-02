CREATE OR REPLACE FUNCTION public.wallet_apply_booking_payment(
  p_booking_id UUID,
  p_cash_amount NUMERIC,
  p_card_amount NUMERIC,
  p_upi_amount NUMERIC,
  p_wallet_amount NUMERIC,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_balance_due NUMERIC(10, 2);
  v_amount_paid NUMERIC(10, 2);
  v_wallet_transaction_id UUID;
BEGIN
  IF p_cash_amount IS NULL OR p_card_amount IS NULL OR p_upi_amount IS NULL
     OR p_wallet_amount IS NULL OR p_cash_amount < 0 OR p_card_amount < 0
     OR p_upi_amount < 0 OR p_wallet_amount < 0
     OR p_cash_amount <> round(p_cash_amount, 2)
     OR p_card_amount <> round(p_card_amount, 2)
     OR p_upi_amount <> round(p_upi_amount, 2)
     OR p_wallet_amount <> round(p_wallet_amount, 2) THEN
    RAISE EXCEPTION 'Payment amounts must be non-negative rupee values';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF COALESCE(v_booking.billed_on_actual_time, false) AND v_booking.completed_at IS NULL THEN
    RAISE EXCEPTION 'Check out this session before settling its bill';
  END IF;
  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled bookings cannot be paid';
  END IF;

  v_balance_due := round(GREATEST(0, v_booking.total_amount - v_booking.amount_paid), 2);
  IF abs(round(p_cash_amount + p_card_amount + p_upi_amount + p_wallet_amount, 2) - v_balance_due) > 0.01 THEN
    RAISE EXCEPTION 'Payment split does not match the outstanding balance';
  END IF;

  IF p_wallet_amount > 0 THEN
    IF v_booking.customer_id IS NULL THEN
      RAISE EXCEPTION 'This booking is not linked to a customer wallet';
    END IF;
    IF length(trim(COALESCE(p_idempotency_key, ''))) < 12 THEN
      RAISE EXCEPTION 'Wallet payment request is invalid';
    END IF;

    v_wallet_transaction_id := public.wallet_spend_credits(
      v_booking.customer_id,
      p_wallet_amount,
      p_booking_id,
      'booking-wallet-payment:' || p_idempotency_key,
      NULL
    );
    UPDATE public.wallet_transactions
    SET description = 'Wallet applied to booking ' || v_booking.booking_number
    WHERE id = v_wallet_transaction_id;
  END IF;

  v_amount_paid := round(v_booking.amount_paid + p_cash_amount + p_card_amount + p_upi_amount + p_wallet_amount, 2);
  UPDATE public.bookings
  SET amount_paid = v_amount_paid,
      cash_amount = cash_amount + p_cash_amount,
      card_amount = card_amount + p_card_amount,
      upi_amount = upi_amount + p_upi_amount,
      wallet_amount = wallet_amount + p_wallet_amount,
      payment_status = CASE
        WHEN v_amount_paid >= total_amount - 0.01 THEN 'paid'
        WHEN v_amount_paid > 0 THEN 'partial'
        ELSE 'pending'
      END,
      updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.booking_line_items
  SET is_paid = true
  WHERE booking_id = p_booking_id;

  UPDATE public.booking_food_items
  SET status = 'preparing'
  WHERE booking_id = p_booking_id AND status = 'pending';

  RETURN v_wallet_transaction_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.wallet_apply_booking_payment(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_apply_booking_payment(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT)
TO service_role;
