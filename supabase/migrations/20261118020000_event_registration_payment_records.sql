CREATE OR REPLACE FUNCTION public.record_event_registration_payment(
  p_registration_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_reference TEXT,
  p_created_by UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_registration public.event_registrations%ROWTYPE;
  v_net_paid NUMERIC(10, 2);
  v_new_total NUMERIC(10, 2);
BEGIN
  SELECT * INTO v_registration
  FROM public.event_registrations
  WHERE id = p_registration_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration was not found'; END IF;
  IF v_registration.registration_status NOT IN ('registered', 'checked_in') THEN
    RAISE EXCEPTION 'Only active registrations can receive a payment';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_payment_method NOT IN ('cash', 'card', 'upi') THEN
    RAISE EXCEPTION 'Invalid payment amount or method';
  END IF;

  SELECT COALESCE(sum(CASE WHEN entry_type = 'refund' THEN -amount ELSE amount END), 0)
    INTO v_net_paid
  FROM public.event_registration_payments
  WHERE registration_id = p_registration_id;

  v_new_total := v_net_paid + p_amount;
  IF v_new_total > v_registration.entry_fee THEN
    RAISE EXCEPTION 'Payment exceeds the remaining entry fee';
  END IF;

  INSERT INTO public.event_registration_payments (
    registration_id, amount, entry_type, payment_method, payment_reference, created_by
  ) VALUES (
    p_registration_id, p_amount, 'payment', p_payment_method,
    nullif(trim(COALESCE(p_payment_reference, '')), ''), p_created_by
  );

  UPDATE public.event_registrations
  SET amount_paid = v_new_total,
      payment_status = CASE
        WHEN v_new_total >= entry_fee THEN 'paid'
        WHEN v_new_total > 0 THEN 'partial'
        ELSE 'pending'
      END,
      payment_method = p_payment_method,
      updated_at = now()
  WHERE id = p_registration_id;

  RETURN v_new_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_event_registration_payment(UUID, NUMERIC, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_registration_payment(UUID, NUMERIC, TEXT, TEXT, UUID)
  TO service_role;
