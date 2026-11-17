CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'tournament'
    CHECK (event_type IN ('tournament', 'gaming', 'community', 'other')),
  description TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT 'Breakpoint Arena',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  entry_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  registration_mode TEXT NOT NULL DEFAULT 'individual'
    CHECK (registration_mode IN ('individual', 'team')),
  team_size INTEGER NOT NULL DEFAULT 1 CHECK (team_size > 0),
  public_prize_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_valid_times CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT events_valid_registration_window CHECK (
    registration_opens_at IS NULL OR registration_closes_at IS NULL
    OR registration_closes_at >= registration_opens_at
  )
);

CREATE INDEX IF NOT EXISTS idx_events_public_schedule
  ON public.events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug);

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  registration_code TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  team_name TEXT,
  participant_names TEXT[] NOT NULL DEFAULT '{}',
  registration_status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (registration_status IN ('pending_payment', 'registered', 'waitlisted', 'cancelled', 'checked_in')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('not_required', 'pending', 'partial', 'paid', 'refunded', 'comped')),
  entry_fee NUMERIC(10, 2) NOT NULL CHECK (entry_fee >= 0),
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi', 'online')),
  registration_source TEXT NOT NULL DEFAULT 'customer'
    CHECK (registration_source IN ('customer', 'admin')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reservation_expires_at TIMESTAMPTZ,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_registration_amount_not_overpaid CHECK (amount_paid <= entry_fee),
  CONSTRAINT event_registration_mode_fields CHECK (
    (team_name IS NULL OR length(trim(team_name)) > 0)
    AND (registration_status <> 'pending_payment' OR reservation_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event
  ON public.event_registrations(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_registrations_phone
  ON public.event_registrations(customer_phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_active_phone
  ON public.event_registrations(event_id, customer_phone)
  WHERE registration_status IN ('pending_payment', 'registered', 'checked_in', 'waitlisted');

CREATE TABLE IF NOT EXISTS public.event_registration_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.event_registrations(id) ON DELETE RESTRICT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('payment', 'refund')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'upi', 'online')),
  payment_reference TEXT,
  razorpay_payment_id TEXT UNIQUE,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_registration_payments_date
  ON public.event_registration_payments(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_registration_payments_registration
  ON public.event_registration_payments(registration_id, paid_at);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_type TEXT NOT NULL DEFAULT 'general';

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_expense_type_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_expense_type_check
  CHECK (expense_type IN ('general', 'event_prize'));
CREATE INDEX IF NOT EXISTS idx_expenses_event ON public.expenses(event_id, date DESC)
  WHERE event_id IS NOT NULL;

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_purpose_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_purpose_check
  CHECK (purpose IN ('device_booking', 'food_order', 'subscription', 'wallet_top_up', 'event_registration'));
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS event_registration_id UUID
    REFERENCES public.event_registrations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payment_orders_event_registration
  ON public.payment_orders(event_registration_id)
  WHERE event_registration_id IS NOT NULL;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registration_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to events" ON public.events;
CREATE POLICY "Service role has full access to events" ON public.events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role has full access to event_registrations" ON public.event_registrations;
CREATE POLICY "Service role has full access to event_registrations" ON public.event_registrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role has full access to event_registration_payments" ON public.event_registration_payments;
CREATE POLICY "Service role has full access to event_registration_payments" ON public.event_registration_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.events, public.event_registrations, public.event_registration_payments FROM anon, authenticated;
GRANT ALL ON public.events, public.event_registrations, public.event_registration_payments TO service_role;

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
  p_reservation_expires_at TIMESTAMPTZ
)
RETURNS TABLE(registration_id UUID, registration_code TEXT, entry_fee NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event public.events%ROWTYPE;
  v_count INTEGER;
  v_id UUID := gen_random_uuid();
  v_code TEXT := 'EVT-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));
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
    OR now() >= v_event.starts_at
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

  IF p_amount_paid < 0 OR p_amount_paid > v_event.entry_fee THEN
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
    amount_paid, payment_method, registration_source, created_by, reservation_expires_at
  ) VALUES (
    v_id, p_event_id, v_code, trim(p_customer_name), regexp_replace(p_customer_phone, '\D', '', 'g'),
    nullif(trim(COALESCE(p_customer_email, '')), ''), nullif(trim(COALESCE(p_team_name, '')), ''),
    COALESCE(p_participant_names, '{}'), p_registration_status, p_payment_status, v_event.entry_fee,
    p_amount_paid, p_payment_method, p_registration_source, p_created_by, p_reservation_expires_at
  );

  IF p_amount_paid > 0 THEN
    INSERT INTO public.event_registration_payments (
      registration_id, amount, entry_type, payment_method, paid_at, created_by
    ) VALUES (v_id, p_amount_paid, 'payment', p_payment_method, now(), p_created_by);
  END IF;

  RETURN QUERY SELECT v_id, v_code, v_event.entry_fee;
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
     OR v_registration.entry_fee <> p_amount THEN
    RAISE EXCEPTION 'Registration reservation expired or payment amount does not match';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'published' OR now() >= v_event.starts_at THEN
    RAISE EXCEPTION 'Event is no longer available';
  END IF;

  IF v_event.capacity IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO v_count
    FROM public.event_registrations r
    WHERE r.event_id = p_event_id
      AND r.id <> p_registration_id
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

CREATE OR REPLACE FUNCTION public.record_event_registration_refund(
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
  v_remaining NUMERIC(10, 2);
BEGIN
  SELECT * INTO v_registration FROM public.event_registrations
  WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration was not found'; END IF;
  IF p_amount <= 0 OR p_payment_method NOT IN ('cash', 'card', 'upi', 'online') THEN
    RAISE EXCEPTION 'Invalid refund amount or method';
  END IF;

  SELECT COALESCE(sum(CASE WHEN entry_type = 'refund' THEN -amount ELSE amount END), 0)
    INTO v_net_paid
  FROM public.event_registration_payments
  WHERE registration_id = p_registration_id;
  IF p_amount > v_net_paid THEN RAISE EXCEPTION 'Refund exceeds collected registration payments'; END IF;

  INSERT INTO public.event_registration_payments (
    registration_id, amount, entry_type, payment_method, payment_reference, created_by
  ) VALUES (
    p_registration_id, p_amount, 'refund', p_payment_method,
    nullif(trim(COALESCE(p_payment_reference, '')), ''), p_created_by
  );

  v_remaining := greatest(0, v_net_paid - p_amount);
  UPDATE public.event_registrations
  SET amount_paid = v_remaining,
      payment_status = CASE WHEN v_remaining = 0 THEN 'refunded' ELSE 'partial' END,
      updated_at = now()
  WHERE id = p_registration_id;

  RETURN v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_event_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_event_registration_payment(UUID, UUID, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_event_registration_refund(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_event_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_event_registration_payment(UUID, UUID, TEXT, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_event_registration_refund(UUID, NUMERIC, TEXT, TEXT, UUID) TO service_role;
