-- Keep Medium Snooker reservations type-based for customers, but let staff
-- choose the physical table when a customer is checked in.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS walk_in_preferred_device_id UUID
  REFERENCES public.devices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bookings.walk_in_preferred_device_id IS
  'Optional Medium Snooker station selected by staff for a waiting walk-in; it is a preference only and is claimed atomically at check-in.';

CREATE OR REPLACE FUNCTION public.device_station_free_for_window(
  p_device_id UUID,
  p_start_local TIMESTAMP WITHOUT TIME ZONE,
  p_end_local TIMESTAMP WITHOUT TIME ZONE,
  p_exclude_booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.id = p_device_id
      AND d.status = 'available'
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_device_slots s
        JOIN public.bookings b ON b.id = s.booking_id
        WHERE s.device_id = d.id
          AND s.booking_id <> p_exclude_booking_id
          AND b.status IN ('locked', 'confirmed', 'checked_in')
          AND (b.status <> 'locked' OR b.lock_expires_at > NOW())
          AND s.slot_date BETWEEN p_start_local::DATE - 1 AND p_start_local::DATE + 1
          AND tsrange(
                s.slot_date + s.slot_start_time,
                GREATEST(
                  s.slot_date + s.slot_start_time + CASE
                    WHEN s.slot_end_time > s.slot_start_time
                      THEN s.slot_end_time - s.slot_start_time
                    ELSE s.slot_end_time - s.slot_start_time + INTERVAL '24 hours'
                  END,
                  CASE
                    WHEN b.billed_on_actual_time
                     AND b.status = 'checked_in'
                     AND b.checked_in_at IS NOT NULL
                     AND NOT (b.walk_in_planned_end IS NOT NULL AND b.walk_in_planned_end > NOW())
                    THEN (b.checked_in_at AT TIME ZONE 'Asia/Kolkata') + INTERVAL '12 hours'
                  END
                ),
                '[)'
              ) && tsrange(p_start_local, p_end_local, '[)')
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.checkin_booking_on_medium_station_v1(
  p_booking_id UUID,
  p_device_id UUID
)
RETURNS TABLE (station_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking RECORD;
  v_station RECORD;
  v_start TIMESTAMP WITHOUT TIME ZONE;
  v_end TIMESTAMP WITHOUT TIME ZONE;
BEGIN
  SELECT b.status, b.checked_in_at, s.id AS slot_id, s.device_id AS current_device_id,
         s.slot_date, s.slot_start_time, s.slot_end_time, current_device.device_type_id
  INTO v_booking
  FROM public.bookings b
  JOIN public.booking_device_slots s ON s.booking_id = b.id
  JOIN public.devices current_device ON current_device.id = s.device_id
  WHERE b.id = p_booking_id
  ORDER BY s.created_at
  LIMIT 1
  FOR UPDATE OF b, s;

  IF NOT FOUND OR v_booking.status <> 'confirmed' OR v_booking.checked_in_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.device_types t
    WHERE t.id = v_booking.device_type_id AND t.name = 'medium_snooker'
  ) THEN
    RAISE EXCEPTION 'Only Medium Snooker bookings can be assigned here';
  END IF;

  SELECT d.id, d.station_number, d.device_type_id
  INTO v_station
  FROM public.devices d
  WHERE d.id = p_device_id;
  IF NOT FOUND OR v_station.device_type_id <> v_booking.device_type_id THEN
    RAISE EXCEPTION 'Select a Medium Snooker table';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_booking.device_type_id::TEXT || ':' || v_booking.slot_date::TEXT)
  );

  v_start := v_booking.slot_date + v_booking.slot_start_time;
  v_end := v_booking.slot_date + v_booking.slot_end_time
    + CASE WHEN v_booking.slot_end_time <= v_booking.slot_start_time THEN INTERVAL '24 hours' ELSE INTERVAL '0' END;

  IF NOT public.device_station_free_for_window(p_device_id, v_start, v_end, p_booking_id) THEN
    RAISE EXCEPTION 'That Medium Snooker table is already booked for this time';
  END IF;

  DELETE FROM public.booking_device_slots old_slot
  USING public.bookings old_booking
  WHERE old_slot.booking_id = old_booking.id
    AND old_slot.device_id = p_device_id
    AND old_slot.slot_date = v_booking.slot_date
    AND old_slot.slot_start_time = v_booking.slot_start_time
    AND old_slot.booking_id <> p_booking_id
    AND (
      old_booking.status IN ('cancelled', 'expired', 'completed')
      OR (old_booking.status = 'locked' AND old_booking.lock_expires_at <= NOW())
    );

  UPDATE public.booking_device_slots
  SET device_id = p_device_id,
      device_station_number = v_station.station_number
  WHERE id = v_booking.slot_id;

  UPDATE public.bookings
  SET status = 'checked_in', checked_in_at = NOW(), updated_at = NOW()
  WHERE id = p_booking_id AND status = 'confirmed' AND checked_in_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  station_number := v_station.station_number;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkin_walkin_session_on_medium_station_v1(
  p_booking_id UUID,
  p_device_type_id UUID,
  p_device_type TEXT,
  p_hourly_rate NUMERIC,
  p_player_count INTEGER,
  p_included_players INTEGER,
  p_extra_player_charge NUMERIC,
  p_provisional_hours NUMERIC,
  p_started_clock TIME DEFAULT NULL,
  p_max_backdate_hours NUMERIC DEFAULT 6,
  p_planned_end TIME DEFAULT NULL,
  p_max_session_hours NUMERIC DEFAULT 12,
  p_device_id UUID DEFAULT NULL
)
RETURNS TABLE (
  started_at TIMESTAMPTZ,
  device_id UUID,
  station_number TEXT,
  held_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_started RECORD;
  v_slot RECORD;
  v_station RECORD;
  v_start_local TIMESTAMP WITHOUT TIME ZONE;
  v_end_local TIMESTAMP WITHOUT TIME ZONE;
BEGIN
  SELECT * INTO v_started
  FROM public.checkin_walkin_session(
    p_booking_id, p_device_type_id, p_device_type, p_hourly_rate,
    p_player_count, p_included_players, p_extra_player_charge,
    p_provisional_hours, p_started_clock, p_max_backdate_hours,
    p_planned_end, p_max_session_hours
  );
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_device_id IS NULL THEN
    started_at := v_started.started_at;
    device_id := v_started.device_id;
    station_number := v_started.station_number;
    held_until := v_started.held_until;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT s.id AS slot_id, s.device_id AS current_device_id, s.slot_date,
         s.slot_start_time, s.slot_end_time, d.device_type_id
  INTO v_slot
  FROM public.booking_device_slots s
  JOIN public.devices d ON d.id = s.device_id
  WHERE s.booking_id = p_booking_id
  FOR UPDATE OF s;
  IF NOT FOUND OR v_slot.device_type_id <> p_device_type_id THEN
    RAISE EXCEPTION 'The walk-in device type changed before check-in';
  END IF;

  SELECT d.id, d.station_number, d.device_type_id
  INTO v_station
  FROM public.devices d
  WHERE d.id = p_device_id;
  IF NOT FOUND OR v_station.device_type_id <> p_device_type_id THEN
    RAISE EXCEPTION 'Select a table that belongs to this device type';
  END IF;

  v_start_local := v_slot.slot_date + v_slot.slot_start_time;
  v_end_local := v_slot.slot_date + v_slot.slot_end_time
    + CASE WHEN v_slot.slot_end_time <= v_slot.slot_start_time THEN INTERVAL '24 hours' ELSE INTERVAL '0' END;

  IF NOT public.device_station_free_for_window(p_device_id, v_start_local, v_end_local, p_booking_id) THEN
    RAISE EXCEPTION 'That Medium Snooker table is already in use';
  END IF;

  DELETE FROM public.booking_device_slots old_slot
  USING public.bookings old_booking
  WHERE old_slot.booking_id = old_booking.id
    AND old_slot.device_id = p_device_id
    AND old_slot.slot_date = v_slot.slot_date
    AND old_slot.slot_start_time = v_slot.slot_start_time
    AND old_slot.booking_id <> p_booking_id
    AND (
      old_booking.status IN ('cancelled', 'expired', 'completed')
      OR (old_booking.status = 'locked' AND old_booking.lock_expires_at <= NOW())
    );

  UPDATE public.booking_device_slots
  SET device_id = p_device_id,
      device_station_number = v_station.station_number
  WHERE id = v_slot.slot_id;

  started_at := v_started.started_at;
  device_id := v_station.id;
  station_number := v_station.station_number;
  held_until := v_started.held_until;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.device_station_free_for_window(UUID, TIMESTAMP, TIMESTAMP, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkin_booking_on_medium_station_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkin_walkin_session_on_medium_station_v1(UUID, UUID, TEXT, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TIME, NUMERIC, TIME, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_station_free_for_window(UUID, TIMESTAMP, TIMESTAMP, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkin_booking_on_medium_station_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkin_walkin_session_on_medium_station_v1(UUID, UUID, TEXT, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TIME, NUMERIC, TIME, NUMERIC, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
