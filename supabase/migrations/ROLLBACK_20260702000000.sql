-- ROLLBACK SCRIPT for 20260702000000_add_quantity_constraint.sql
-- Run this if you need to rollback the quantity constraint changes

-- Remove the quantity constraint
ALTER TABLE menu_items
DROP CONSTRAINT IF EXISTS check_quantity_non_negative;

-- Remove the quantity index
DROP INDEX IF EXISTS idx_menu_items_quantity;

-- Note: This rollback script only removes the constraint.
-- If you need to rollback the function changes, see ROLLBACK_INVENTORY_FUNCTIONS.sql
