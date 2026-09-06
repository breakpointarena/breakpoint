-- Add constraint to prevent negative quantities
-- This ensures inventory cannot go below zero even with concurrent requests
ALTER TABLE menu_items
ADD CONSTRAINT check_quantity_non_negative
CHECK (quantity >= 0);

-- Add index for better performance on quantity checks
CREATE INDEX IF NOT EXISTS idx_menu_items_quantity ON menu_items(quantity);

-- Comment for documentation
COMMENT ON CONSTRAINT check_quantity_non_negative ON menu_items IS
'Prevents menu item quantity from going negative. Enforces at database level to handle concurrent orders.';
