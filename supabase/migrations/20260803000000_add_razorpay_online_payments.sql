-- ================================================
-- Razorpay online payments (customer-side flows)
--
-- Adds:
--   1. bookings.online_amount  (4th payment bucket alongside cash/card/upi)
--   2. bookings.razorpay_order_id / razorpay_payment_id
--   3. payment_orders table - server-authoritative pricing + idempotent fulfilment
-- ================================================

-- ================================================
-- 1. BOOKINGS: online payment bucket + razorpay refs
-- ================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS online_amount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

COMMENT ON COLUMN public.bookings.online_amount IS 'Amount paid online via Razorpay (card/UPI/netbanking/wallet - settled by the gateway)';
COMMENT ON COLUMN public.bookings.razorpay_order_id IS 'Razorpay order id that funded this booking (null for walk-in/cash bookings)';
COMMENT ON COLUMN public.bookings.razorpay_payment_id IS 'Razorpay payment id captured for this booking';

CREATE INDEX IF NOT EXISTS idx_bookings_razorpay_payment
  ON public.bookings(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- ================================================
-- 2. PAYMENT SPLIT CONSTRAINT: include online_amount
-- ================================================
-- The existing constraint asserts cash + card + upi = amount_paid, which would
-- reject every online payment. Widen it to include the new bucket.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS check_payment_split;

ALTER TABLE public.bookings
  ADD CONSTRAINT check_payment_split CHECK (
    ABS((cash_amount + card_amount + upi_amount + online_amount) - amount_paid) < 0.01
  );

-- ================================================
-- 3. PAYMENT METHOD CHECK: allow 'online'
-- ================================================
-- The original check was created inline (ADD COLUMN ... CHECK), so its generated
-- name is not guaranteed. Drop whichever check constraint governs payment_method.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'bookings'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'upi', 'online'));

COMMENT ON COLUMN public.bookings.payment_method IS 'Single payment method used: cash, card, upi or online. NULL when payment was split across multiple methods.';

-- ================================================
-- 4. PAYMENT METHOD TRIGGER: account for online_amount
-- ================================================
CREATE OR REPLACE FUNCTION set_payment_method_from_split()
RETURNS TRIGGER AS $$
DECLARE
  methods_used INTEGER := 0;
  single_method TEXT := NULL;
BEGIN
  IF NEW.cash_amount > 0 THEN
    methods_used := methods_used + 1;
    single_method := 'cash';
  END IF;

  IF NEW.card_amount > 0 THEN
    methods_used := methods_used + 1;
    single_method := 'card';
  END IF;

  IF NEW.upi_amount > 0 THEN
    methods_used := methods_used + 1;
    single_method := 'upi';
  END IF;

  IF NEW.online_amount > 0 THEN
    methods_used := methods_used + 1;
    single_method := 'online';
  END IF;

  -- Exactly one method -> record it. Zero or multiple -> NULL (split payment).
  IF methods_used = 1 THEN
    NEW.payment_method := single_method;
  ELSE
    NEW.payment_method := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_payment_method ON public.bookings;
CREATE TRIGGER trigger_set_payment_method
  BEFORE INSERT OR UPDATE OF cash_amount, card_amount, upi_amount, online_amount
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION set_payment_method_from_split();

-- ================================================
-- 5. PAYMENT ORDERS TABLE
-- ================================================
-- Holds the server-computed price for a Razorpay order between "order created"
-- and "payment verified". The client never supplies the amount - it is read back
-- from this row at fulfilment time, so a tampered client cannot underpay.
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  razorpay_order_id TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('device_booking', 'food_order')),

  -- Server-computed amount in rupees. Razorpay is charged amount * 100 paise.
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',

  -- Full validated quote (prices, discounts, slot, items) used to build the
  -- booking after payment succeeds.
  quote JSONB NOT NULL,

  customer_phone TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'paid', 'fulfilled', 'failed', 'refunding', 'refunded')),

  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  -- Set when a caller takes ownership of turning this order into a booking.
  -- Fulfilment is a multi-statement job that cannot sit inside one transaction,
  -- so this is the lease that stops the webhook and the browser callback from
  -- both building a booking for the same payment.
  fulfilling_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

-- Re-runnable: the CREATE TABLE above is skipped when the table already exists,
-- so columns and constraints added later must be applied separately.
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS fulfilling_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('created', 'paid', 'fulfilled', 'failed', 'refunding', 'refunded'));

CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON public.payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_phone ON public.payment_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_payment_orders_booking ON public.payment_orders(booking_id)
  WHERE booking_id IS NOT NULL;

-- Finds orders that took money but never produced a booking - the queue an
-- operator needs to work through after an incident.
CREATE INDEX IF NOT EXISTS idx_payment_orders_stranded
  ON public.payment_orders(paid_at)
  WHERE status IN ('paid', 'refunding') AND booking_id IS NULL;

COMMENT ON TABLE public.payment_orders IS 'Razorpay orders awaiting payment. Holds the server-authoritative price so the client cannot tamper with the amount charged or the booking created.';
COMMENT ON COLUMN public.payment_orders.quote IS 'Server-validated pricing breakdown; the booking is built from this, never from client input.';
COMMENT ON COLUMN public.payment_orders.status IS 'created -> paid (payment confirmed) -> fulfilled (booking created). refunding -> refunded covers a payment taken for a booking we could not build. failed/refunded/refunding are terminal for automated retries.';
COMMENT ON COLUMN public.payment_orders.fulfilling_at IS 'Lease timestamp. Held by whichever caller is currently building the booking; lets a stranded order be safely resumed once the lease expires.';

-- ================================================
-- 6. PAYMENT ORDERS: RLS - service role only
-- ================================================
-- This table contains pricing authority and customer PII. It is written and read
-- exclusively by server actions using the service role key. No anon/authenticated
-- policies are created, so PostgREST access from the browser returns nothing.
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to payment_orders" ON public.payment_orders;
CREATE POLICY "Service role has full access to payment_orders"
  ON public.payment_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.payment_orders FROM anon, authenticated;
GRANT ALL ON public.payment_orders TO service_role;

-- ================================================
-- 7. ATOMIC DEVICE SLOT ASSIGNMENT
-- ================================================
-- Picking a free station and inserting the slot must not be two separate round
-- trips: two customers paying at the same moment could both be handed the last
-- station. UNIQUE(device_id, slot_date, slot_start_time) only catches an exact
-- start-time clash, so a 10:00-11:30 and a 10:30-11:30 booking would both pass.
--
-- This function does the search and the insert inside one transaction, behind an
-- advisory lock keyed on (device type, date), and compares full time ranges.
CREATE OR REPLACE FUNCTION public.assign_device_slot(
  p_booking_id UUID,
  p_device_type_id UUID,
  p_slot_date DATE,
  p_slot_start_time TIME,
  p_slot_end_time TIME,
  p_duration_hours NUMERIC,
  p_hourly_rate NUMERIC,
  p_slot_total NUMERIC,
  p_device_type TEXT,
  p_player_count INTEGER,
  p_included_players INTEGER,
  p_extra_player_charge NUMERIC,
  p_extra_players_total NUMERIC
)
RETURNS TABLE (device_id UUID, station_number TEXT)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_requested TSRANGE;
  v_device RECORD;
BEGIN
  -- Serialise concurrent assignment for this device type on this date.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_device_type_id::TEXT || ':' || p_slot_date::TEXT)
  );

  -- Unwrap the requested window; an end time at or before the start means the
  -- booking runs past midnight.
  v_requested := tsrange(
    p_slot_date + p_slot_start_time,
    (p_slot_date + p_slot_start_time) + CASE
      WHEN p_slot_end_time > p_slot_start_time
        THEN (p_slot_end_time - p_slot_start_time)
      ELSE (p_slot_end_time - p_slot_start_time) + INTERVAL '24 hours'
    END
  );

  SELECT d.id, d.station_number
  INTO v_device
  FROM public.devices d
  WHERE d.device_type_id = p_device_type_id
    AND d.status = 'available'
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_device_slots bds
      JOIN public.bookings b ON b.id = bds.booking_id
      WHERE bds.device_id = d.id
        AND b.status IN ('locked', 'confirmed', 'checked_in')
        -- An expired lock no longer holds the slot.
        AND (b.status <> 'locked' OR b.lock_expires_at > NOW())
        -- Neighbouring days are in range because bookings can cross midnight.
        AND bds.slot_date BETWEEN p_slot_date - 1 AND p_slot_date + 1
        AND tsrange(
              bds.slot_date + bds.slot_start_time,
              (bds.slot_date + bds.slot_start_time) + CASE
                WHEN bds.slot_end_time > bds.slot_start_time
                  THEN (bds.slot_end_time - bds.slot_start_time)
                ELSE (bds.slot_end_time - bds.slot_start_time) + INTERVAL '24 hours'
              END
            ) && v_requested
    )
    -- The legacy UNIQUE(device_id, slot_date, slot_start_time) index is status
    -- blind. Skip any station holding a row at this exact key that we are not
    -- allowed to clear below, so the insert can never fail on it.
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_device_slots bds2
      JOIN public.bookings b2 ON b2.id = bds2.booking_id
      WHERE bds2.device_id = d.id
        AND bds2.slot_date = p_slot_date
        AND bds2.slot_start_time = p_slot_start_time
        AND b2.status NOT IN ('cancelled', 'expired')
    )
  ORDER BY d.station_number
  LIMIT 1;

  -- No free station: return zero rows so the caller can refund.
  -- FOUND reflects whether the SELECT matched, which is what we actually mean;
  -- `v_device IS NULL` only holds when every field came back NULL.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A cancelled or expired booking leaves its slot row behind, which the unique
  -- index would treat as a collision even though the station is free. Those rows
  -- are excluded from every report, so clearing the exact colliding key is safe.
  DELETE FROM public.booking_device_slots bds
  USING public.bookings b
  WHERE bds.booking_id = b.id
    AND bds.device_id = v_device.id
    AND bds.slot_date = p_slot_date
    AND bds.slot_start_time = p_slot_start_time
    AND b.status IN ('cancelled', 'expired');

  INSERT INTO public.booking_device_slots (
    booking_id,
    device_id,
    slot_date,
    slot_start_time,
    slot_end_time,
    duration_hours,
    hourly_rate,
    slot_total,
    device_type,
    device_station_number,
    player_count,
    included_players,
    extra_player_charge,
    extra_players_total
  ) VALUES (
    p_booking_id,
    v_device.id,
    p_slot_date,
    p_slot_start_time,
    p_slot_end_time,
    p_duration_hours,
    p_hourly_rate,
    p_slot_total,
    p_device_type,
    v_device.station_number,
    p_player_count,
    p_included_players,
    p_extra_player_charge,
    p_extra_players_total
  );

  device_id := v_device.id;
  station_number := v_device.station_number;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.assign_device_slot IS 'Atomically picks a free station of the given type for the requested time range and inserts the booking slot. Returns zero rows when the slot is fully booked.';

GRANT EXECUTE ON FUNCTION public.assign_device_slot TO service_role;

-- ================================================
-- 8. BACKFILL
-- ================================================
-- Existing rows default online_amount to 0, so the widened split constraint
-- holds for all historical bookings without further work.
