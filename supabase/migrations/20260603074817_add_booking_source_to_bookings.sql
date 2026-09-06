-- 1.  add the booking_source column with the updated check constraint configuration
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'online' NOT NULL 
CONSTRAINT bookings_booking_source_check CHECK (booking_source IN ('online', 'walk-in'));

-- 2. Create the index for optimal performance on your admin analytics board
CREATE INDEX IF NOT EXISTS idx_bookings_source ON public.bookings(booking_source);

