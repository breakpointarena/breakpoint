-- An item with nothing left reads as out of stock, without anybody saying so.
--
-- menu_items carries two facts that have to agree - `quantity`, the count on the
-- shelf, and `status`, which is what most of the app actually filters on. Nothing
-- kept them in step. getMenuItems() for the in-booking menu and for the customer
-- home page both select on `status = 'available'` alone, so an item that sold its
-- last unit went on being offered, ordered and paid for; the admin menu manager
-- went on showing it as AVAILABLE and left it out of the Out of Stock tile.
--
-- The intent existed once. decrement_menu_item_quantity() in migration
-- 20260531000000 set `status = 'unavailable'` when the count reached zero, which
-- is not one of the three values the CHECK constraint allows ('available',
-- 'out_of_stock', 'hidden') - so it raised check_violation, was swallowed by that
-- function's own exception handler, and rolled the decrement back with it. The
-- remote commit of 20260708140745 then replaced the function with a version that
-- clamps at zero and does not touch `status` at all, and the intent was gone.
--
-- Doing it in a trigger rather than in that function is the point: `quantity` is
-- written from four places that do not go through it. The admin Add and Edit Food
-- forms UPDATE the row directly, increment_menu_item_quantity() puts stock back
-- when food is removed from a booking, and seeds and hand-edits touch it too. A
-- rule that lives on the table cannot be walked around by the next writer.

CREATE OR REPLACE FUNCTION public.sync_menu_item_stock_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 'hidden' is somebody's decision that this item is off the menu, which has
  -- nothing to do with how many of it are in the fridge. Restocking a hidden item
  -- must not put it back on the menu, and running one down to zero must not
  -- rewrite the reason it is not being offered.
  IF NEW.status = 'hidden' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <= 0 THEN
    NEW.status := 'out_of_stock';

  /**
   * Restocking from empty puts the item back on the menu.
   *
   * Narrow on purpose - only a crossing *out of* zero restores it. Staff mark
   * a well-stocked item out of stock for reasons the count cannot see (the
   * kitchen is out of buns, the machine is broken), and the toggle in the admin
   * menu grid exists for exactly that. Restoring on `quantity > 0` alone would
   * undo that the next time anyone edited the row.
   */
  ELSIF TG_OP = 'UPDATE' AND OLD.quantity <= 0 AND NEW.status = 'out_of_stock' THEN
    NEW.status := 'available';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS menu_items_sync_stock_status ON public.menu_items;

CREATE TRIGGER menu_items_sync_stock_status
  BEFORE INSERT OR UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_menu_item_stock_status();

-- Items already sitting at zero and still marked available - the ones the rule
-- above would have caught had it existed when they sold out. Only that direction
-- is corrected: an item deliberately marked out_of_stock with stock on the shelf
-- is a judgement somebody made, not a row this migration should overrule.
UPDATE public.menu_items
   SET status = 'out_of_stock',
       updated_at = NOW()
 WHERE quantity <= 0
   AND status = 'available';

COMMENT ON FUNCTION public.sync_menu_item_stock_status() IS
  'Keeps menu_items.status in step with quantity: zero stock reads as '
  'out_of_stock, and restocking from zero restores available. Leaves hidden '
  'items alone, and does not undo an out_of_stock set by hand on an item that '
  'still has stock.';
