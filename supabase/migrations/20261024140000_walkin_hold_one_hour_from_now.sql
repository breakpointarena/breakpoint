-- Open-ended checked-in walk-ins hold the station for the next hour from now.
-- A backdated start remains the billing start, but does not shorten the booking
-- hold. An explicitly planned finish continues to take precedence.
DO $migration$
DECLARE
  v_function_oid OID;
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  v_function_oid :=
    'public.checkin_walkin_session(uuid, uuid, text, numeric, integer, integer, numeric, numeric, time without time zone, numeric, time without time zone, numeric)'::regprocedure::oid;
  v_definition := pg_get_functiondef(v_function_oid);
  v_updated_definition := replace(
    v_definition,
    'v_held_until := v_started + (p_provisional_hours || '' hours'')::INTERVAL;',
    'v_held_until := GREATEST(v_started, v_now) + (p_provisional_hours || '' hours'')::INTERVAL;'
  );
  IF v_definition = v_updated_definition THEN
    RAISE EXCEPTION 'Could not update the open-ended walk-in check-in hold';
  END IF;
  EXECUTE v_updated_definition;

  v_function_oid := 'public.change_checked_in_walkin_device_v1(uuid, uuid)'::regprocedure::oid;
  v_definition := pg_get_functiondef(v_function_oid);
  v_updated_definition := replace(
    v_definition,
    'ELSE v_start + INTERVAL ''1 hour''',
    'ELSE GREATEST(v_start, NOW()) + INTERVAL ''1 hour'''
  );
  IF v_definition = v_updated_definition THEN
    RAISE EXCEPTION 'Could not update the active walk-in device-change hold';
  END IF;
  EXECUTE v_updated_definition;

  v_function_oid := 'public.change_checked_in_walkin_start_v1(uuid, time without time zone)'::regprocedure::oid;
  v_definition := pg_get_functiondef(v_function_oid);
  v_updated_definition := replace(
    v_definition,
    'ELSE v_started + INTERVAL ''1 hour''',
    'ELSE GREATEST(v_started, v_now) + INTERVAL ''1 hour'''
  );
  IF v_definition = v_updated_definition THEN
    RAISE EXCEPTION 'Could not update the active walk-in start-time hold';
  END IF;
  EXECUTE v_updated_definition;
END;
$migration$;

-- Refresh existing open sessions to one hour from deployment time. Their actual
-- check-in timestamps remain untouched for billing and elapsed-time display.
UPDATE public.booking_device_slots AS slot
SET slot_end_time = ((NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 hour')::TIME,
    duration_hours = EXTRACT(EPOCH FROM (NOW() + INTERVAL '1 hour' - booking.checked_in_at)) / 3600.0
FROM public.bookings AS booking
WHERE booking.id = slot.booking_id
  AND booking.status = 'checked_in'
  AND booking.billed_on_actual_time IS TRUE
  AND booking.checked_in_at IS NOT NULL
  AND booking.walk_in_planned_end IS NULL;

NOTIFY pgrst, 'reload schema';
