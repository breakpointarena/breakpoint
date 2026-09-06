-- Function to safely decrement menu item quantity
-- Returns TRUE if successful, FALSE if insufficient stock
CREATE OR REPLACE FUNCTION decrement_menu_item_quantity(
  item_id UUID,
  decrement_by INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  new_quantity INTEGER;
  current_quantity INTEGER;
BEGIN
  -- Get current quantity
  SELECT quantity INTO current_quantity
  FROM menu_items
  WHERE id = item_id;

  -- Check if we have enough stock
  IF current_quantity IS NULL THEN
    RAISE NOTICE 'Menu item % not found', item_id;
    RETURN FALSE;
  END IF;

  IF current_quantity < decrement_by THEN
    RAISE NOTICE 'Insufficient stock for item %. Available: %, Requested: %',
                 item_id, current_quantity, decrement_by;
    RETURN FALSE;
  END IF;

  -- Perform the decrement (will fail if constraint violated)
  UPDATE menu_items
  SET
    quantity = quantity - decrement_by,
    updated_at = NOW()
  WHERE id = item_id
  RETURNING quantity INTO new_quantity;

  -- Mark as unavailable if quantity reaches 0
  IF new_quantity = 0 THEN
    UPDATE menu_items
    SET status = 'unavailable'
    WHERE id = item_id;
  END IF;

  RETURN TRUE;
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'Quantity constraint violated for item %', item_id;
    RETURN FALSE;
  WHEN OTHERS THEN
    RAISE NOTICE 'Error decrementing quantity for item %: %', item_id, SQLERRM;
    RETURN FALSE;
END;
$$;

-- Function to increment menu item quantity (for cancellations/returns)
CREATE OR REPLACE FUNCTION increment_menu_item_quantity(
  item_id UUID,
  increment_by INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  old_quantity INTEGER;
  new_quantity INTEGER;
BEGIN
  -- Get the current quantity before update
  SELECT quantity INTO old_quantity
  FROM menu_items
  WHERE id = item_id;

  UPDATE menu_items
  SET
    quantity = quantity + increment_by,
    updated_at = NOW()
  WHERE id = item_id
  RETURNING quantity INTO new_quantity;

  -- Mark as available if quantity increases from 0
  IF old_quantity = 0 AND new_quantity > 0 THEN
    UPDATE menu_items
    SET status = 'available'
    WHERE id = item_id;
  END IF;
END;
$$;
