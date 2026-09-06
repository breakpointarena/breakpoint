-- Create booking line items table for consistent pricing breakdown
-- This provides a single source of truth for all booking charges and discounts

-- Add amount_paid column to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
ADD COLUMN IF NOT EXISTS happy_hour_discount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;

COMMENT ON COLUMN public.bookings.amount_paid IS 'Actual amount paid by customer (may be less than total if admin adds items later)';
COMMENT ON COLUMN public.bookings.happy_hour_discount IS 'Happy hour discount amount (future use)';

-- Create booking_line_items table
CREATE TABLE IF NOT EXISTS public.booking_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,

  -- Item classification
  item_type TEXT NOT NULL CHECK (item_type IN (
    'device',                   -- Base device hourly charges
    'extra_players',            -- Extra player charges
    'food',                     -- Food/beverage items
    'addon',                    -- Other add-ons
    'subscription_discount',    -- Subscription discount (negative amount)
    'promo_discount',          -- Promo code discount (negative amount)
    'happy_hour_discount'      -- Happy hour discount (negative amount, future use)
  )),

  -- Line item details
  description TEXT NOT NULL,                    -- Human-readable description
  quantity NUMERIC(10, 2) DEFAULT 1 NOT NULL,   -- Quantity (e.g., 2 hours, 3 players, 2 burgers)
  unit_price NUMERIC(10, 2) NOT NULL,          -- Price per unit
  line_total NUMERIC(10, 2) NOT NULL,          -- quantity × unit_price (negative for discounts)

  -- Reference tracking
  reference_id UUID,                            -- FK to menu_items, subscription_plans, promo_codes, etc.
  reference_type TEXT,                          -- 'menu_item', 'subscription_plan', 'promo_code', 'happy_hour'

  -- Metadata
  added_by TEXT DEFAULT 'customer' NOT NULL CHECK (added_by IN ('customer', 'admin')),
  added_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  is_paid BOOLEAN DEFAULT false NOT NULL,       -- Track which items customer has paid for

  -- Display order
  display_order INTEGER NOT NULL,               -- Order to display in breakdown (1, 2, 3...)

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_line_items_booking_id
  ON public.booking_line_items(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_line_items_item_type
  ON public.booking_line_items(item_type);

CREATE INDEX IF NOT EXISTS idx_booking_line_items_is_paid
  ON public.booking_line_items(is_paid)
  WHERE is_paid = false;

-- Add comments
COMMENT ON TABLE public.booking_line_items IS 'Detailed breakdown of all charges and discounts for each booking';
COMMENT ON COLUMN public.booking_line_items.item_type IS 'Type of line item: device, extra_players, food, subscription_discount, promo_discount, happy_hour_discount';
COMMENT ON COLUMN public.booking_line_items.line_total IS 'Total for this line (quantity × unit_price). Negative for discounts.';
COMMENT ON COLUMN public.booking_line_items.added_by IS 'Who added this item: customer (during booking) or admin (after booking)';
COMMENT ON COLUMN public.booking_line_items.is_paid IS 'Whether customer has paid for this line item';
COMMENT ON COLUMN public.booking_line_items.display_order IS 'Order to display in UI (charges first, then discounts)';

-- Grant permissions
GRANT ALL ON public.booking_line_items TO service_role;
GRANT SELECT ON public.booking_line_items TO anon;
GRANT SELECT ON public.booking_line_items TO authenticated;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_booking_line_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_booking_line_items_updated_at
  BEFORE UPDATE ON public.booking_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_line_items_updated_at();
