ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS manual_discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_type TEXT NOT NULL DEFAULT 'value';

ALTER TABLE public.booking_line_items
  DROP CONSTRAINT IF EXISTS booking_line_items_item_type_check;
ALTER TABLE public.booking_line_items
  ADD CONSTRAINT booking_line_items_item_type_check CHECK (item_type IN (
    'device', 'extra_players', 'food', 'addon', 'subscription_discount',
    'promo_discount', 'happy_hour_discount', 'hour_pass_discount', 'wallet_payment', 'manual_discount'
  ));

CREATE OR REPLACE FUNCTION public.set_booking_manual_discount(
  p_booking_id UUID,
  p_kind TEXT,
  p_value NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_base NUMERIC(10, 2);
  v_discount NUMERIC(10, 2);
  v_total NUMERIC(10, 2);
BEGIN
  IF p_kind NOT IN ('value', 'percentage') OR p_value IS NULL OR p_value < 0
     OR (p_kind = 'percentage' AND p_value > 100) THEN
    RAISE EXCEPTION 'Enter a valid discount value';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.payment_status IN ('paid', 'refunded') THEN
    RAISE EXCEPTION 'A fully paid booking cannot be discounted';
  END IF;

  v_base := round(GREATEST(0,
    COALESCE(v_booking.device_subtotal, 0) + COALESCE(v_booking.food_subtotal, 0)
    - COALESCE(v_booking.subscription_discount, 0) - COALESCE(v_booking.promo_discount, 0)
    - COALESCE(v_booking.happy_hour_discount, 0) - COALESCE(v_booking.hour_pass_discount, 0)
  ), 2);
  v_discount := round(CASE WHEN p_kind = 'percentage' THEN v_base * p_value / 100 ELSE p_value END, 2);
  IF v_discount > v_base - COALESCE(v_booking.amount_paid, 0) THEN
    RAISE EXCEPTION 'Discount cannot exceed the remaining amount due (₹%)', round(GREATEST(0, v_base - COALESCE(v_booking.amount_paid, 0)), 2);
  END IF;
  v_total := round(v_base - v_discount, 2);

  UPDATE public.bookings
     SET manual_discount = v_discount,
         manual_discount_type = p_kind,
         total_amount = v_total,
         payment_status = CASE WHEN COALESCE(amount_paid, 0) >= v_total - 0.01 THEN 'paid'
                               WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial' ELSE 'pending' END,
         updated_at = now()
   WHERE id = p_booking_id;

  DELETE FROM public.booking_line_items WHERE booking_id = p_booking_id AND item_type = 'manual_discount';
  IF v_discount > 0 THEN
    INSERT INTO public.booking_line_items (
      booking_id, item_type, description, quantity, unit_price, line_total, added_by, is_paid, display_order
    ) VALUES (
      p_booking_id, 'manual_discount',
      CASE WHEN p_kind = 'percentage' THEN 'Manual discount (' || p_value || '%)' ELSE 'Manual discount' END,
      1, -v_discount, -v_discount, 'admin', false, 6
    );
  END IF;
  RETURN v_discount;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_booking_manual_discount(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_booking_manual_discount(UUID, TEXT, NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_booking_food_subtotal()
RETURNS TRIGGER AS $function$
DECLARE
  v_booking_id UUID := COALESCE(NEW.booking_id, OLD.booking_id);
  v_food_subtotal NUMERIC(10, 2);
BEGIN
  SELECT COALESCE(SUM(line_total), 0) INTO v_food_subtotal
    FROM public.booking_food_items WHERE booking_id = v_booking_id;
  UPDATE public.bookings
     SET food_subtotal = v_food_subtotal,
         total_amount = GREATEST(0,
           COALESCE(device_subtotal, 0) + v_food_subtotal - COALESCE(subscription_discount, 0)
           - COALESCE(promo_discount, 0) - COALESCE(happy_hour_discount, 0)
           - COALESCE(hour_pass_discount, 0) - COALESCE(manual_discount, 0))
   WHERE id = v_booking_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$ LANGUAGE plpgsql;
