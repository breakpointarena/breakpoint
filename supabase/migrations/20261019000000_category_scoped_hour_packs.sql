ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS device_type_id UUID
    REFERENCES public.device_types(id) ON DELETE RESTRICT;

-- Retire uncategorized plans from sale, but keep their existing paid balances
-- usable until they expire or are spent.
UPDATE public.subscription_plans
   SET is_active = false
 WHERE plan_type = 'hour_pack'
   AND device_type_id IS NULL
   AND is_active;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_hour_pack_device_category_check
  CHECK (
    (plan_type = 'membership' AND device_type_id IS NULL)
    OR
    (plan_type = 'hour_pack' AND (device_type_id IS NOT NULL OR NOT is_active))
  );

CREATE INDEX IF NOT EXISTS idx_subscription_plans_device_type
  ON public.subscription_plans(device_type_id)
  WHERE device_type_id IS NOT NULL;

COMMENT ON COLUMN public.subscription_plans.device_type_id IS
  'Device category whose play minutes an hour pack covers; null for memberships and retired legacy packs.';

UPDATE public.device_types
   SET display_name = 'F1 Simulator'
 WHERE name = 'other'
   AND display_name = 'FI Simulator';

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
  v_device_type_id UUID;
  v_played_minutes INTEGER;
  v_target_minutes INTEGER;
  v_used_minutes INTEGER;
  v_take_minutes INTEGER;
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

  SELECT COALESCE(
           b.walk_in_device_type_id,
           (
             SELECT d.device_type_id
             FROM public.booking_device_slots bs
             JOIN public.devices d ON d.id = bs.device_id
             WHERE bs.booking_id = b.id
             ORDER BY bs.created_at, bs.id
             LIMIT 1
           )
         )
    INTO v_device_type_id
    FROM public.bookings b
   WHERE b.id = p_booking_id;

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
        AND (
          sp.device_type_id = v_device_type_id
          OR (sp.device_type_id IS NULL AND NOT sp.is_active)
        )
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

INSERT INTO public.subscription_plans
  (name, description, duration_months, price, discount_percentage, is_active,
   plan_type, hours_included, standard_value, device_type_id)
SELECT
  'American Pool 10 Hour Pack',
  '10 personal hours on American Pool. Valid for 1 month; unused hours expire when the plan ends.',
  1,
  2700,
  0,
  true,
  'hour_pack',
  10,
  3000,
  dt.id
FROM public.device_types dt
WHERE dt.name = 'american_pool'
  AND NOT EXISTS (
    SELECT 1 FROM public.subscription_plans sp
    WHERE sp.name = 'American Pool 10 Hour Pack'
      AND sp.device_type_id = dt.id
  );

INSERT INTO public.subscription_plans
  (name, description, duration_months, price, discount_percentage, is_active,
   plan_type, hours_included, standard_value, device_type_id)
SELECT
  'Medium Snooker 10 Hour Pack',
  '10 personal hours on Medium Snooker. Valid for 1 month; unused hours expire when the plan ends.',
  1,
  2700,
  0,
  true,
  'hour_pack',
  10,
  2990,
  dt.id
FROM public.device_types dt
WHERE dt.name = 'medium_snooker'
  AND NOT EXISTS (
    SELECT 1 FROM public.subscription_plans sp
    WHERE sp.name = 'Medium Snooker 10 Hour Pack'
      AND sp.device_type_id = dt.id
  );
