-- Keep discounts intact when booking_food_items change.
--
-- sync_booking_food_subtotal() recomputed the booking total as
--   device_subtotal + SUM(food line_total)
-- which silently dropped subscription_discount, promo_discount and
-- happy_hour_discount. The trigger fires AFTER INSERT on booking_food_items, and
-- both fulfilment paths insert the booking row first and its food rows second, so
-- every discounted order ended up stored at its undiscounted total - disagreeing
-- with the amount actually charged, and with amount_paid.
--
-- Still needed even though food itself now carries no discount: a device booking
-- can have food added to it, and that insert would otherwise wipe the
-- membership, promo and happy hour reductions that legitimately apply to the
-- device charge. admin/reports reads bookings.total_amount directly, so the
-- stored value has to be right.
--
-- The formula below is the one already documented on bookings.total_amount by
-- migration 20260712000000; this brings the trigger in line with it.
--
-- Historical rows written by the old trigger are deliberately NOT rewritten here:
-- correcting past financial records is an operator decision, not a side effect of
-- a schema migration.

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
         total_amount =
           COALESCE(device_subtotal, 0) +
           v_food_subtotal -
           COALESCE(subscription_discount, 0) -
           COALESCE(promo_discount, 0) -
           COALESCE(happy_hour_discount, 0)
   WHERE id = v_booking_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers themselves are unchanged: CREATE OR REPLACE FUNCTION above swaps the
-- body in place, and sync_food_subtotal_on_insert/update/delete keep pointing at
-- it.

COMMENT ON FUNCTION sync_booking_food_subtotal() IS
  'Keeps bookings.food_subtotal in step with booking_food_items and recomputes '
  'total_amount as (device_subtotal + food_subtotal) - (subscription_discount + '
  'promo_discount + happy_hour_discount).';
