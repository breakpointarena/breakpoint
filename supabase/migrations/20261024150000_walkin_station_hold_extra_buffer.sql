-- Add a 30-minute buffer to the one-hour default hold (90 minutes total).
DO $migration$
DECLARE
  v_function_oid OID;
  v_definition TEXT;
  v_updated_definition TEXT;
  v_functions OID[] := ARRAY[
    'public.assign_device_slot(uuid, uuid, date, time without time zone, time without time zone, numeric, numeric, numeric, text, integer, integer, numeric, numeric)'::regprocedure::oid,
    'public.change_checked_in_walkin_device_v1(uuid, uuid)'::regprocedure::oid,
    'public.change_checked_in_walkin_start_v1(uuid, time without time zone)'::regprocedure::oid
  ];
BEGIN
  FOREACH v_function_oid IN ARRAY v_functions LOOP
    v_definition := pg_get_functiondef(v_function_oid);
    v_updated_definition := replace(v_definition, 'INTERVAL ''1 hour''', 'INTERVAL ''90 minutes''');
    IF v_definition = v_updated_definition THEN
      RAISE EXCEPTION 'Could not find the one-hour station hold in function %', v_function_oid::regprocedure;
    END IF;
    EXECUTE v_updated_definition;
  END LOOP;
END;
$migration$;

-- Give currently open, unplanned walk-ins the new fixed 90-minute window.
-- Their check-in timestamps stay unchanged for billing and elapsed-time display.
UPDATE public.booking_device_slots AS slot
SET slot_end_time = ((NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '90 minutes')::TIME,
    duration_hours = EXTRACT(EPOCH FROM (NOW() + INTERVAL '90 minutes' - booking.checked_in_at)) / 3600.0
FROM public.bookings AS booking
WHERE booking.id = slot.booking_id
  AND booking.status = 'checked_in'
  AND booking.billed_on_actual_time IS TRUE
  AND booking.checked_in_at IS NOT NULL
  AND booking.walk_in_planned_end IS NULL;

NOTIFY pgrst, 'reload schema';
