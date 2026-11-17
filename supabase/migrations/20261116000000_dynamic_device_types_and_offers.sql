-- Admin-managed fixed-duration packages (for example, a GTA 6 offer) belong
-- to a device type so they reuse that type's physical station availability.
CREATE TABLE IF NOT EXISTS public.device_type_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id UUID NOT NULL REFERENCES public.device_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_type_id, name, duration_minutes)
);

CREATE INDEX IF NOT EXISTS idx_device_type_offers_active
  ON public.device_type_offers(device_type_id, is_active, display_order, duration_minutes);

ALTER TABLE public.device_type_offers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.device_type_offers TO service_role;

NOTIFY pgrst, 'reload schema';
