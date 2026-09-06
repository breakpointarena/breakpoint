-- Add quantity column to menu_items table
-- This tracks inventory/stock levels for food items

ALTER TABLE public.menu_items
ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0);

-- Create index for low stock queries
CREATE INDEX idx_menu_items_low_stock ON public.menu_items(quantity)
WHERE quantity < 10;

-- Update existing items to have some default stock
UPDATE public.menu_items
SET quantity = 50
WHERE quantity = 0;

COMMENT ON COLUMN public.menu_items.quantity IS 'Current stock/inventory level for this menu item';
