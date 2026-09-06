-- Add player count tracking to booking_device_slots
-- This allows us to track extra players and their charges

ALTER TABLE public.booking_device_slots
ADD COLUMN IF NOT EXISTS player_count INTEGER DEFAULT 1 CHECK (player_count > 0),
ADD COLUMN IF NOT EXISTS included_players INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS extra_player_charge NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS extra_players_total NUMERIC(10, 2) DEFAULT 0.00;

-- Add comments for documentation
COMMENT ON COLUMN public.booking_device_slots.player_count IS 'Total number of players for this booking slot';
COMMENT ON COLUMN public.booking_device_slots.included_players IS 'Number of players included in base rate (snapshot from device_type)';
COMMENT ON COLUMN public.booking_device_slots.extra_player_charge IS 'Charge per extra player (snapshot from device_type)';
COMMENT ON COLUMN public.booking_device_slots.extra_players_total IS 'Total charge for extra players = (player_count - included_players) * extra_player_charge';
