-- Update comment to reflect correct calculation including duration
COMMENT ON COLUMN public.booking_device_slots.extra_players_total IS 'Total charge for extra players = (player_count - included_players) * extra_player_charge * duration_hours';
