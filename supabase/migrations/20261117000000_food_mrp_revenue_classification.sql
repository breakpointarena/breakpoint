ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_mrp_item BOOLEAN NOT NULL DEFAULT FALSE;

-- NULL means this is a historical sale line, so reports can classify it from
-- the linked menu item. New sale lines snapshot the value at the time of sale.
ALTER TABLE public.booking_food_items
  ADD COLUMN IF NOT EXISTS is_mrp_item BOOLEAN;

CREATE OR REPLACE FUNCTION public.snapshot_food_item_mrp_status_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.menu_item_id IS NULL THEN
    NEW.is_mrp_item := FALSE;
  ELSE
    SELECT mi.is_mrp_item
      INTO NEW.is_mrp_item
      FROM public.menu_items mi
      WHERE mi.id = NEW.menu_item_id;
    IF NOT FOUND THEN
      NEW.is_mrp_item := FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS snapshot_food_item_mrp_status ON public.booking_food_items;
CREATE TRIGGER snapshot_food_item_mrp_status
  BEFORE INSERT ON public.booking_food_items
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_food_item_mrp_status_v1();

COMMENT ON COLUMN public.menu_items.is_mrp_item IS
  'Whether revenue from this menu item is reported as MRP-item revenue.';
COMMENT ON COLUMN public.booking_food_items.is_mrp_item IS
  'MRP classification captured for this sale; NULL identifies historical rows classified from the menu item.';
