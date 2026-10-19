CREATE OR REPLACE FUNCTION public.seed_shared_play_participant()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
DECLARE
  v_participant_id UUID;
  v_player_name TEXT;
BEGIN
  IF NEW.status = 'checked_in'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.checked_in_at IS NOT NULL THEN
    v_player_name := COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Player 1');

    INSERT INTO public.shared_play_participants (booking_id, name)
    VALUES (NEW.id, v_player_name)
    ON CONFLICT (booking_id, lower(name)) DO NOTHING;

    SELECT id INTO v_participant_id
      FROM public.shared_play_participants
     WHERE booking_id = NEW.id AND lower(name) = lower(v_player_name);

    INSERT INTO public.shared_play_periods (participant_id, started_at)
    SELECT v_participant_id, NEW.checked_in_at
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.shared_play_periods p
        WHERE p.participant_id = v_participant_id AND p.ended_at IS NULL
     );
  END IF;
  RETURN NEW;
END;
$function$;
