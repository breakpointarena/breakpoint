CREATE TABLE public.wallet_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  paid_credits NUMERIC(10, 2) NOT NULL CHECK (paid_credits > 0),
  bonus_credits NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  bonus_validity_days INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (bonus_validity_days IS NULL OR bonus_validity_days > 0)
);

INSERT INTO public.wallet_offers
  (name, price, paid_credits, bonus_credits, bonus_validity_days, display_order)
VALUES
  ('Wallet ₹1,000', 1000, 1000, 0, NULL, 1),
  ('Wallet ₹2,700', 2700, 2700, 300, 90, 2),
  ('Wallet ₹5,000', 5000, 5000, 500, 90, 3),
  ('Wallet ₹10,000', 10000, 10000, 1000, 90, 4)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE public.customer_wallets (
  customer_id UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN (
    'top_up', 'spend', 'refund', 'adjustment', 'expiry'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  bonus_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  description TEXT NOT NULL,
  source TEXT,
  reference_id UUID,
  idempotency_key TEXT UNIQUE,
  reverses_transaction_id UUID UNIQUE REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (abs(amount - paid_amount - bonus_amount) < 0.01)
);

CREATE INDEX idx_wallet_transactions_customer_created
  ON public.wallet_transactions(customer_id, created_at DESC, id DESC);

CREATE TABLE public.wallet_credit_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('paid', 'bonus')),
  original_amount NUMERIC(10, 2) NOT NULL CHECK (original_amount > 0),
  remaining_amount NUMERIC(10, 2) NOT NULL CHECK (
    remaining_amount >= 0 AND remaining_amount <= original_amount
  ),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((credit_type = 'paid' AND expires_at IS NULL) OR credit_type = 'bonus')
);

CREATE INDEX idx_wallet_credit_lots_available
  ON public.wallet_credit_lots(customer_id, credit_type, expires_at, created_at)
  WHERE remaining_amount > 0;

CREATE TABLE public.wallet_spend_allocations (
  transaction_id UUID NOT NULL REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  credit_lot_id UUID NOT NULL REFERENCES public.wallet_credit_lots(id) ON DELETE RESTRICT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (transaction_id, credit_lot_id)
);

CREATE TABLE public.wallet_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  purpose TEXT NOT NULL CHECK (purpose IN ('device_booking', 'food_order', 'booking_food')),
  reference_id UUID,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'committed', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_reservations_available
  ON public.wallet_reservations(customer_id, expires_at)
  WHERE status = 'reserved';

CREATE OR REPLACE VIEW public.customer_wallet_balances AS
SELECT
  w.customer_id,
  COALESCE(SUM(l.remaining_amount) FILTER (
    WHERE l.expires_at IS NULL OR l.expires_at > now()
  ), 0)::NUMERIC(10, 2) AS balance,
  COALESCE(SUM(l.remaining_amount) FILTER (
    WHERE l.credit_type = 'paid'
      AND (l.expires_at IS NULL OR l.expires_at > now())
  ), 0)::NUMERIC(10, 2) AS paid_balance,
  COALESCE(SUM(l.remaining_amount) FILTER (
    WHERE l.credit_type = 'bonus'
      AND (l.expires_at IS NULL OR l.expires_at > now())
  ), 0)::NUMERIC(10, 2) AS bonus_balance,
  COALESCE((
    SELECT SUM(r.amount)
    FROM public.wallet_reservations r
    WHERE r.customer_id = w.customer_id
      AND r.status = 'reserved'
      AND r.expires_at > now()
  ), 0)::NUMERIC(10, 2) AS reserved_balance
FROM public.customer_wallets w
LEFT JOIN public.wallet_credit_lots l ON l.customer_id = w.customer_id
GROUP BY w.customer_id;

ALTER VIEW public.customer_wallet_balances SET (security_invoker = true);

ALTER TABLE public.wallet_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_credit_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_spend_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wallet_offers, public.customer_wallets,
  public.wallet_transactions, public.wallet_credit_lots,
  public.wallet_spend_allocations, public.wallet_reservations,
  public.customer_wallet_balances
FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wallet_offers, public.customer_wallets,
  public.wallet_transactions, public.wallet_credit_lots,
  public.wallet_spend_allocations, public.wallet_reservations
TO service_role;
GRANT SELECT ON public.customer_wallet_balances TO service_role;

-- Hour-pack plans are retired without converting balances.

ALTER TABLE public.bookings
  ADD COLUMN wallet_amount NUMERIC(10, 2) NOT NULL DEFAULT 0
    CHECK (wallet_amount >= 0);

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS check_payment_split;
ALTER TABLE public.bookings
  ADD CONSTRAINT check_payment_split CHECK (
    ABS((cash_amount + card_amount + upi_amount + online_amount + wallet_amount) - amount_paid) < 0.01
  );

DO $payment_method_constraint$
DECLARE
  v_constraint_name TEXT;
BEGIN
  FOR v_constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'bookings'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;
END;
$payment_method_constraint$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'upi', 'online', 'wallet'));

ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_purpose_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_purpose_check
  CHECK (purpose IN ('device_booking', 'food_order', 'subscription', 'wallet_top_up'));
ALTER TABLE public.payment_orders
  ADD COLUMN wallet_transaction_id UUID
    REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_payment_method_from_split()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_method TEXT;
BEGIN
  IF NEW.cash_amount > 0 THEN v_count := v_count + 1; v_method := 'cash'; END IF;
  IF NEW.card_amount > 0 THEN v_count := v_count + 1; v_method := 'card'; END IF;
  IF NEW.upi_amount > 0 THEN v_count := v_count + 1; v_method := 'upi'; END IF;
  IF NEW.online_amount > 0 THEN v_count := v_count + 1; v_method := 'online'; END IF;
  IF NEW.wallet_amount > 0 THEN v_count := v_count + 1; v_method := 'wallet'; END IF;
  NEW.payment_method := CASE WHEN v_count = 1 THEN v_method ELSE NULL END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_set_payment_method ON public.bookings;
CREATE TRIGGER trigger_set_payment_method
  BEFORE INSERT OR UPDATE OF cash_amount, card_amount, upi_amount, online_amount, wallet_amount
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_payment_method_from_split();

COMMENT ON COLUMN public.bookings.wallet_amount IS
  'Wallet credit applied as tender; included in amount_paid but not in cash, card, UPI, or online collections.';

ALTER TABLE public.booking_line_items
  DROP CONSTRAINT IF EXISTS booking_line_items_item_type_check;
ALTER TABLE public.booking_line_items
  ADD CONSTRAINT booking_line_items_item_type_check
  CHECK (item_type IN (
    'device', 'extra_players', 'food', 'addon',
    'subscription_discount', 'promo_discount', 'happy_hour_discount',
    'hour_pass_discount', 'wallet_payment'
  ));

CREATE OR REPLACE FUNCTION public.wallet_expire_bonus_credits(p_customer_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lot RECORD;
  v_transaction_id UUID;
  v_expired_count INTEGER := 0;
BEGIN
  INSERT INTO public.customer_wallets (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING;

  PERFORM 1 FROM public.customer_wallets
  WHERE customer_id = p_customer_id
  FOR UPDATE;

  FOR v_lot IN
    SELECT id, transaction_id, remaining_amount, expires_at
    FROM public.wallet_credit_lots
    WHERE customer_id = p_customer_id
      AND credit_type = 'bonus'
      AND remaining_amount > 0
      AND expires_at <= now()
    ORDER BY expires_at, id
    FOR UPDATE
  LOOP
    v_transaction_id := NULL;
    INSERT INTO public.wallet_transactions (
      customer_id, kind, direction, amount, paid_amount, bonus_amount,
      description, source, reference_id, idempotency_key
    ) VALUES (
      p_customer_id, 'expiry', 'debit',
      v_lot.remaining_amount, 0, v_lot.remaining_amount,
      'Expired promotional wallet credit', 'bonus_expiry', v_lot.id,
      'bonus-expiry:' || v_lot.id::TEXT
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_transaction_id;

    IF v_transaction_id IS NOT NULL THEN
      INSERT INTO public.wallet_spend_allocations (transaction_id, credit_lot_id, amount)
      VALUES (v_transaction_id, v_lot.id, v_lot.remaining_amount);
      UPDATE public.wallet_credit_lots SET remaining_amount = 0 WHERE id = v_lot.id;
      v_expired_count := v_expired_count + 1;
    END IF;
  END LOOP;

  RETURN v_expired_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wallet_get_balance(p_customer_id UUID)
RETURNS TABLE(balance NUMERIC, paid_balance NUMERIC, bonus_balance NUMERIC, reserved_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.wallet_expire_bonus_credits(p_customer_id);
  RETURN QUERY
  SELECT b.balance - b.reserved_balance, b.paid_balance, b.bonus_balance, b.reserved_balance
  FROM public.customer_wallet_balances b
  WHERE b.customer_id = p_customer_id;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.wallet_reserve_credits(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_purpose TEXT,
  p_reference_id UUID,
  p_idempotency_key TEXT,
  p_expiry_minutes INTEGER DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reservation_id UUID;
  v_existing public.wallet_reservations%ROWTYPE;
  v_balance NUMERIC(10, 2);
BEGIN
  IF p_amount <= 0 OR p_amount <> round(p_amount, 2)
     OR p_expiry_minutes < 1 OR p_expiry_minutes > 1440
     OR p_purpose NOT IN ('device_booking', 'food_order', 'booking_food') THEN
    RAISE EXCEPTION 'Wallet reservation details are invalid';
  END IF;

  INSERT INTO public.customer_wallets (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING;

  PERFORM 1 FROM public.customer_wallets
  WHERE customer_id = p_customer_id
  FOR UPDATE;
  PERFORM public.wallet_expire_bonus_credits(p_customer_id);

  SELECT balance - reserved_balance INTO v_balance
  FROM public.customer_wallet_balances
  WHERE customer_id = p_customer_id;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient available wallet credit';
  END IF;

  SELECT * INTO v_existing
  FROM public.wallet_reservations
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.customer_id <> p_customer_id
       OR v_existing.amount <> round(p_amount, 2)
       OR v_existing.purpose <> p_purpose
       OR v_existing.status <> 'reserved'
       OR v_existing.expires_at <= now() THEN
      RAISE EXCEPTION 'Wallet reservation key was already used or has expired';
    END IF;
    RETURN v_existing.id;
  END IF;

  INSERT INTO public.wallet_reservations (
    customer_id, amount, purpose, reference_id, idempotency_key, expires_at
  ) VALUES (
    p_customer_id, round(p_amount, 2), p_purpose, p_reference_id,
    p_idempotency_key, now() + make_interval(mins => p_expiry_minutes)
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wallet_release_reservation(p_reservation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_customer_id UUID;
BEGIN
  SELECT customer_id INTO v_customer_id
  FROM public.wallet_reservations
  WHERE id = p_reservation_id;
  IF v_customer_id IS NULL THEN RETURN false; END IF;

  PERFORM 1 FROM public.customer_wallets
  WHERE customer_id = v_customer_id
  FOR UPDATE;

  UPDATE public.wallet_reservations
  SET status = 'released'
  WHERE id = p_reservation_id AND status = 'reserved';
  RETURN FOUND;
END;
$function$;

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

REVOKE ALL ON FUNCTION public.wallet_expire_bonus_credits(UUID),
  public.wallet_get_balance(UUID),
  public.wallet_add_credits(UUID, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, TEXT, TEXT),
  public.wallet_reserve_credits(UUID, NUMERIC, TEXT, UUID, TEXT, INTEGER),
  public.wallet_release_reservation(UUID),
  public.wallet_spend_credits(UUID, NUMERIC, UUID, TEXT, UUID),
  public.wallet_refund_spend(UUID, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_expire_bonus_credits(UUID),
  public.wallet_get_balance(UUID),
  public.wallet_add_credits(UUID, NUMERIC, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, TEXT, TEXT),
  public.wallet_reserve_credits(UUID, NUMERIC, TEXT, UUID, TEXT, INTEGER),
  public.wallet_release_reservation(UUID),
  public.wallet_spend_credits(UUID, NUMERIC, UUID, TEXT, UUID),
  public.wallet_refund_spend(UUID, TEXT, TEXT)
TO service_role;
