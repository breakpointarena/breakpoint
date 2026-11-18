-- Long-running gaming events accept registrations until their configured close date.
CREATE OR REPLACE FUNCTION public.create_event_registration(
  p_event_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_team_name TEXT,
  p_participant_names TEXT[],
  p_registration_status TEXT,
  p_payment_status TEXT,
  p_amount_paid NUMERIC,
  p_payment_method TEXT,
  p_registration_source TEXT,
  p_created_by UUID,
  p_reservation_expires_at TIMESTAMPTZ,
  p_service_charge_amount NUMERIC
)
RETURNS TABLE(registration_id UUID, registration_code TEXT, entry_fee NUMERIC, service_charge_amount NUMERIC, total_due NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event public.events%ROWTYPE;
  v_count INTEGER;
  v_id UUID := gen_random_uuid();
  v_code TEXT := 'EVT-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));
  v_service_charge NUMERIC(10, 2);
  v_total_due NUMERIC(10, 2);
BEGIN
  IF length(trim(COALESCE(p_customer_name, ''))) = 0
     OR length(regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'Invalid customer name or phone number';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' THEN
    RAISE EXCEPTION 'Event is not available for registration';
  END IF;

  IF p_registration_source = 'customer' AND (
    (v_event.registration_opens_at IS NOT NULL AND now() < v_event.registration_opens_at)
    OR (v_event.registration_closes_at IS NOT NULL AND now() > v_event.registration_closes_at)
    OR (now() >= v_event.starts_at AND NOT (v_event.event_type = 'gaming' AND v_event.registration_closes_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'Registration is closed';
  END IF;

  IF v_event.registration_mode = 'team' AND length(trim(COALESCE(p_team_name, ''))) = 0 THEN
    RAISE EXCEPTION 'A team name is required';
  END IF;
  IF v_event.registration_mode = 'individual' AND p_team_name IS NOT NULL THEN
    RAISE EXCEPTION 'Team name is not accepted for individual registration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_registrations r
    WHERE r.event_id = p_event_id
      AND r.customer_phone = p_customer_phone
      AND r.registration_status IN ('pending_payment', 'registered', 'checked_in', 'waitlisted')
  ) THEN
    RAISE EXCEPTION 'This phone number already has an active registration';
  END IF;

  IF v_event.capacity IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO v_count
    FROM public.event_registrations r
    WHERE r.event_id = p_event_id
      AND (
        r.registration_status IN ('registered', 'checked_in')
        OR (r.registration_status = 'pending_payment' AND r.reservation_expires_at > now())
      );
    IF p_registration_status <> 'waitlisted' AND v_count >= v_event.capacity THEN
      RAISE EXCEPTION 'Event is full';
    END IF;
  END IF;

  v_service_charge := CASE
    WHEN v_event.entry_fee = 0 OR p_payment_status = 'comped' THEN 0
    ELSE round(v_event.entry_fee * v_event.service_fee_percent / 100, 2)
  END;
  IF p_service_charge_amount IS NULL OR p_service_charge_amount <> v_service_charge THEN
    RAISE EXCEPTION 'Event service charge changed; refresh and try again';
  END IF;
  v_total_due := v_event.entry_fee + v_service_charge;

  IF p_amount_paid < 0 OR p_amount_paid > v_total_due THEN
    RAISE EXCEPTION 'Invalid collected amount';
  END IF;
  IF v_event.entry_fee = 0 AND p_payment_status <> 'not_required' THEN
    RAISE EXCEPTION 'Free registrations do not need payment';
  END IF;
  IF p_registration_source = 'customer' AND p_payment_status NOT IN ('pending', 'paid', 'not_required') THEN
    RAISE EXCEPTION 'Invalid customer payment status';
  END IF;

  INSERT INTO public.event_registrations (
    id, event_id, registration_code, customer_name, customer_phone, customer_email,
    team_name, participant_names, registration_status, payment_status, entry_fee,
    service_charge_amount, amount_paid, payment_method, registration_source, created_by, reservation_expires_at
  ) VALUES (
    v_id, p_event_id, v_code, trim(p_customer_name), regexp_replace(p_customer_phone, '\D', '', 'g'),
    nullif(trim(COALESCE(p_customer_email, '')), ''), nullif(trim(COALESCE(p_team_name, '')), ''),
    COALESCE(p_participant_names, '{}'), p_registration_status, p_payment_status, v_event.entry_fee,
    v_service_charge, p_amount_paid, p_payment_method, p_registration_source, p_created_by, p_reservation_expires_at
  );

  IF p_amount_paid > 0 THEN
    INSERT INTO public.event_registration_payments (
      registration_id, amount, entry_type, payment_method, paid_at, created_by
    ) VALUES (v_id, p_amount_paid, 'payment', p_payment_method, now(), p_created_by);
  END IF;

  RETURN QUERY SELECT v_id, v_code, v_event.entry_fee, v_service_charge, v_total_due;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_event_registration_payment(
  p_registration_id UUID,
  p_event_id UUID,
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_amount NUMERIC
)
RETURNS TABLE(registration_id UUID, registration_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_registration public.event_registrations%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_registration
  FROM public.event_registrations
  WHERE id = p_registration_id AND event_id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration was not found'; END IF;

  IF v_registration.registration_status = 'registered'
     AND v_registration.razorpay_payment_id = p_razorpay_payment_id THEN
    RETURN QUERY SELECT v_registration.id, v_registration.registration_code;
    RETURN;
  END IF;

  IF v_registration.registration_status <> 'pending_payment'
     OR v_registration.reservation_expires_at <= now()
     OR v_registration.entry_fee + v_registration.service_charge_amount <> p_amount THEN
    RAISE EXCEPTION 'Registration reservation expired or payment amount does not match';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR (now() >= v_event.starts_at AND NOT (v_event.event_type = 'gaming' AND v_event.registration_closes_at IS NOT NULL AND now() <= v_event.registration_closes_at)) THEN
    RAISE EXCEPTION 'Event is no longer available';
  END IF;

  IF v_event.capacity IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO v_count
    FROM public.event_registrations r
    WHERE r.event_id = p_event_id AND r.id <> p_registration_id
      AND (r.registration_status IN ('registered', 'checked_in')
        OR (r.registration_status = 'pending_payment' AND r.reservation_expires_at > now()));
    IF v_count >= v_event.capacity THEN RAISE EXCEPTION 'Event is full'; END IF;
  END IF;

  UPDATE public.event_registrations
  SET registration_status = 'registered', payment_status = 'paid', amount_paid = p_amount,
      payment_method = 'online', razorpay_order_id = p_razorpay_order_id,
      razorpay_payment_id = p_razorpay_payment_id, reservation_expires_at = NULL,
      updated_at = now()
  WHERE id = p_registration_id;

  INSERT INTO public.event_registration_payments (
    registration_id, amount, entry_type, payment_method, payment_reference,
    razorpay_payment_id, paid_at
  ) VALUES (
    p_registration_id, p_amount, 'payment', 'online', p_razorpay_order_id,
    p_razorpay_payment_id, now()
  ) ON CONFLICT (razorpay_payment_id) DO NOTHING;

  RETURN QUERY SELECT p_registration_id, v_registration.registration_code;
END;
$function$;



