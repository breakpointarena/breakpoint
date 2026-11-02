ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'membership',
  ADD COLUMN IF NOT EXISTS hours_included INTEGER,
  ADD COLUMN IF NOT EXISTS standard_value NUMERIC(10, 2);

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_plan_type_check
  CHECK (plan_type IN ('membership', 'hour_pack'));

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_hour_pack_fields_check
  CHECK (
    (plan_type = 'membership' AND hours_included IS NULL AND standard_value IS NULL)
    OR
    (plan_type = 'hour_pack' AND hours_included > 0 AND standard_value >= price)
  );

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS hours_remaining_minutes INTEGER
  CHECK (hours_remaining_minutes IS NULL OR hours_remaining_minutes >= 0);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hour_pass_discount NUMERIC(10, 2) NOT NULL DEFAULT 0
  CHECK (hour_pass_discount >= 0);

ALTER TABLE public.shared_play_participants
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_hour_pass_balance
  ON public.subscriptions(customer_id, end_date)
  WHERE status = 'active' AND hours_remaining_minutes > 0;

ALTER TABLE public.booking_line_items
  DROP CONSTRAINT IF EXISTS booking_line_items_item_type_check;

ALTER TABLE public.booking_line_items
  ADD CONSTRAINT booking_line_items_item_type_check
  CHECK (item_type IN (
    'device',
    'extra_players',
    'food',
    'addon',
    'subscription_discount',
    'promo_discount',
    'happy_hour_discount',
    'hour_pass_discount'
  ));

CREATE TABLE IF NOT EXISTS public.hour_pass_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.shared_play_participants(id) ON DELETE SET NULL,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  minutes_used INTEGER NOT NULL CHECK (minutes_used > 0),
  amount_covered NUMERIC(10, 2) NOT NULL CHECK (amount_covered >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hour_pass_uses_booking_participant_pass
  ON public.hour_pass_uses(booking_id, participant_id, subscription_id);

ALTER TABLE public.hour_pass_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages hour pass uses"
  ON public.hour_pass_uses FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.hour_pass_uses FROM anon, authenticated;
GRANT ALL ON public.hour_pass_uses TO service_role;

CREATE OR REPLACE FUNCTION public.attach_booking_customer_to_shared_player()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = 'checked_in' THEN
    UPDATE public.shared_play_participants p
       SET customer_id = c.id
      FROM public.customers c
     WHERE p.booking_id = NEW.id
       AND lower(p.name) = lower(COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Player 1'))
       AND c.phone = NEW.customer_phone
       AND p.customer_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER zz_attach_booking_customer_to_shared_player_after_checkin
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'checked_in')
  EXECUTE FUNCTION public.attach_booking_customer_to_shared_player();

CREATE OR REPLACE FUNCTION public.redeem_booking_hour_passes(
  p_booking_id UUID,
  p_players JSONB,
  p_today DATE
)
RETURNS TABLE(participant_id UUID, minutes_used INTEGER, amount_covered NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_player JSONB;
  v_participant_id UUID;
  v_customer_id UUID;
  v_played_minutes INTEGER;
  v_target_minutes INTEGER;
  v_used_minutes INTEGER;
  v_take_minutes INTEGER;
  v_remaining_minutes INTEGER;
  v_share NUMERIC;
  v_shareable NUMERIC;
  v_covered_before NUMERIC;
  v_covered_now NUMERIC;
  v_booking_discount NUMERIC;
  v_total_amount NUMERIC;
  v_amount_paid NUMERIC;
  v_pass RECORD;
BEGIN
  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' THEN
    RAISE EXCEPTION 'Hour-pass players must be an array';
  END IF;

  FOR v_player IN
    SELECT players.value FROM jsonb_array_elements(p_players) AS players(value)
  LOOP
    v_participant_id := NULLIF(v_player->>'participant_id', '')::UUID;
    v_customer_id := NULLIF(v_player->>'customer_id', '')::UUID;
    v_played_minutes := GREATEST(0, COALESCE((v_player->>'played_minutes')::INTEGER, 0));
    v_share := GREATEST(0, COALESCE((v_player->>'player_share')::NUMERIC, 0));
    v_shareable := GREATEST(0, COALESCE((v_player->>'shareable_amount')::NUMERIC, 0));

    IF v_participant_id IS NULL OR v_customer_id IS NULL
       OR v_played_minutes = 0 THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.shared_play_participants p
      WHERE p.id = v_participant_id
        AND p.booking_id = p_booking_id
        AND p.customer_id = v_customer_id
    ) THEN
      RAISE EXCEPTION 'Hour-pack account does not match the booking player';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.hour_pass_uses u
      WHERE u.booking_id = p_booking_id AND u.participant_id = v_participant_id
    ) THEN
      CONTINUE;
    END IF;

    v_target_minutes := v_played_minutes;
    v_used_minutes := 0;
    v_covered_before := 0;

    FOR v_pass IN
      SELECT s.id, s.hours_remaining_minutes
      FROM public.subscriptions s
      JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
      WHERE s.customer_id = v_customer_id
        AND s.status = 'active'
        AND s.start_date <= p_today
        AND s.end_date >= p_today
        AND s.hours_remaining_minutes > 0
        AND sp.plan_type = 'hour_pack'
      ORDER BY s.end_date ASC, s.created_at ASC, s.id ASC
      FOR UPDATE OF s
    LOOP
      EXIT WHEN v_used_minutes >= v_target_minutes;
      v_take_minutes := LEAST(
        v_target_minutes - v_used_minutes,
        v_pass.hours_remaining_minutes
      );

      UPDATE public.subscriptions
         SET hours_remaining_minutes = hours_remaining_minutes - v_take_minutes
       WHERE id = v_pass.id;

      v_used_minutes := v_used_minutes + v_take_minutes;
      v_covered_now := round(
        LEAST(v_share, v_shareable) * v_used_minutes / v_played_minutes,
        2
      );

      INSERT INTO public.hour_pass_uses (
        booking_id, participant_id, subscription_id, minutes_used, amount_covered
      ) VALUES (
        p_booking_id, v_participant_id, v_pass.id, v_take_minutes,
        v_covered_now - v_covered_before
      );

      v_covered_before := v_covered_now;
    END LOOP;
  END LOOP;

  SELECT COALESCE(SUM(u.amount_covered), 0)
    INTO v_booking_discount
    FROM public.hour_pass_uses u
   WHERE u.booking_id = p_booking_id;

  UPDATE public.bookings b
     SET hour_pass_discount = v_booking_discount,
         total_amount = GREATEST(
           0,
           COALESCE(b.device_subtotal, 0) +
             COALESCE(b.food_subtotal, 0) -
             COALESCE(b.subscription_discount, 0) -
             COALESCE(b.promo_discount, 0) -
             COALESCE(b.happy_hour_discount, 0) -
             v_booking_discount
         )
   WHERE b.id = p_booking_id
  RETURNING b.total_amount, b.amount_paid
       INTO v_total_amount, v_amount_paid;

  IF FOUND THEN
    UPDATE public.bookings
       SET payment_status = CASE
         WHEN COALESCE(v_amount_paid, 0) >= v_total_amount THEN 'paid'
         WHEN COALESCE(v_amount_paid, 0) > 0 THEN 'partial'
         ELSE 'pending'
       END
     WHERE id = p_booking_id;
  END IF;

  DELETE FROM public.booking_line_items
   WHERE booking_id = p_booking_id AND item_type = 'hour_pass_discount';

  IF v_booking_discount > 0 THEN
    INSERT INTO public.booking_line_items (
      booking_id, item_type, description, quantity, unit_price, line_total,
      added_by, is_paid, display_order
    ) VALUES (
      p_booking_id, 'hour_pass_discount', 'Personal hour pack used', 1,
      -v_booking_discount, -v_booking_discount, 'admin', false, 5
    );
  END IF;

  RETURN QUERY
  SELECT u.participant_id, SUM(u.minutes_used)::INTEGER, SUM(u.amount_covered)
  FROM public.hour_pass_uses u
  WHERE u.booking_id = p_booking_id
    AND u.participant_id IN (
      SELECT NULLIF(players.value->>'participant_id', '')::UUID
      FROM jsonb_array_elements(p_players) AS players(value)
    )
  GROUP BY u.participant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_booking_hour_passes(UUID, JSONB, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_booking_hour_passes(UUID, JSONB, DATE)
  TO service_role;

CREATE OR REPLACE FUNCTION sync_booking_food_subtotal()
RETURNS TRIGGER AS $$
DECLARE
  v_booking_id UUID := COALESCE(NEW.booking_id, OLD.booking_id);
  v_food_subtotal NUMERIC(10, 2);
BEGIN
  SELECT COALESCE(SUM(line_total), 0)
    INTO v_food_subtotal
    FROM booking_food_items
   WHERE booking_id = v_booking_id;

  UPDATE bookings
     SET food_subtotal = v_food_subtotal,
         total_amount = GREATEST(0,
           COALESCE(device_subtotal, 0) +
           v_food_subtotal -
           COALESCE(subscription_discount, 0) -
           COALESCE(promo_discount, 0) -
           COALESCE(happy_hour_discount, 0) -
           COALESCE(hour_pass_discount, 0))
   WHERE id = v_booking_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN public.subscription_plans.plan_type IS
  'membership applies a booking discount; hour_pack grants personal play minutes';
COMMENT ON COLUMN public.subscriptions.hours_remaining_minutes IS
  'Remaining personal play minutes for an hour-pack purchase; null for memberships';
COMMENT ON COLUMN public.bookings.hour_pass_discount IS
  'Value of personal hour-pack time redeemed against this booking';
COMMENT ON TABLE public.hour_pass_uses IS
  'Atomic per-booking ledger of personal hour-pack minutes and charge covered';

INSERT INTO public.subscription_plans
  (name, description, duration_months, price, discount_percentage, is_active, plan_type, hours_included, standard_value)
SELECT
  '10 Hour Pack',
  '10 personal gaming hours. Valid for 1 month; unused hours expire when the plan ends.',
  1,
  3500,
  0,
  true,
  'hour_pack',
  10,
  3800
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_plans
  WHERE plan_type = 'hour_pack' AND name = '10 Hour Pack'
);
