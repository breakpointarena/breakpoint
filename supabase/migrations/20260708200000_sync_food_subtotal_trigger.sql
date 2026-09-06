-- Sync booking.food_subtotal with booking_food_items
-- This trigger ensures data consistency between bookings and booking_food_items

-- Function to sync food_subtotal with booking_food_items
CREATE OR REPLACE FUNCTION sync_booking_food_subtotal()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the booking's food_subtotal to match the sum of food items
  UPDATE bookings
  SET
    food_subtotal = (
      SELECT COALESCE(SUM(line_total), 0)
      FROM booking_food_items
      WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
    ),
    total_amount = device_subtotal + (
      SELECT COALESCE(SUM(line_total), 0)
      FROM booking_food_items
      WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
    )
  WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS sync_food_subtotal_on_insert ON booking_food_items;
DROP TRIGGER IF EXISTS sync_food_subtotal_on_update ON booking_food_items;
DROP TRIGGER IF EXISTS sync_food_subtotal_on_delete ON booking_food_items;

-- Create triggers for INSERT, UPDATE, DELETE on booking_food_items
CREATE TRIGGER sync_food_subtotal_on_insert
AFTER INSERT ON booking_food_items
FOR EACH ROW
EXECUTE FUNCTION sync_booking_food_subtotal();

CREATE TRIGGER sync_food_subtotal_on_update
AFTER UPDATE ON booking_food_items
FOR EACH ROW
EXECUTE FUNCTION sync_booking_food_subtotal();

CREATE TRIGGER sync_food_subtotal_on_delete
AFTER DELETE ON booking_food_items
FOR EACH ROW
EXECUTE FUNCTION sync_booking_food_subtotal();
