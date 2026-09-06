-- ROLLBACK SCRIPT for inventory function changes
-- This reverts to the original version of decrement_menu_item_quantity
-- WITHOUT the auto-status-update and boolean return value

-- Original version: Simple decrement without status management
CREATE OR REPLACE FUNCTION decrement_menu_item_quantity(
  item_id UUID,
  decrement_by INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE menu_items
  SET
    quantity = GREATEST(0, quantity - decrement_by),
    updated_at = NOW()
  WHERE id = item_id;
END;
$$;

-- Original increment function
CREATE OR REPLACE FUNCTION increment_menu_item_quantity(
  item_id UUID,
  increment_by INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE menu_items
  SET
    quantity = quantity + increment_by,
    updated_at = NOW()
  WHERE id = item_id;
END;
$$;

-- Note: After rollback, you may need to manually update any items
-- that were auto-marked as 'unavailable' back to 'available'
-- Run this query to find them:
-- SELECT id, name, quantity, status FROM menu_items WHERE status = 'unavailable' AND quantity > 0;

-- To fix them manually:
-- UPDATE menu_items SET status = 'available' WHERE status = 'unavailable' AND quantity > 0;
