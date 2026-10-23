ALTER TABLE public.booking_line_items
  ADD COLUMN IF NOT EXISTS food_item_id UUID
    REFERENCES public.booking_food_items(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.mark_shared_food_line_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'preparing' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.booking_line_items
       SET is_paid = true
     WHERE food_item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER mark_shared_food_line_paid_after_checkout
AFTER UPDATE OF status ON public.booking_food_items
FOR EACH ROW EXECUTE FUNCTION public.mark_shared_food_line_paid();

REVOKE ALL ON FUNCTION public.mark_shared_food_line_paid() FROM PUBLIC, anon, authenticated;
