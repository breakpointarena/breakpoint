-- Let staff round a walk-in checkout time forward by up to thirty minutes.
-- The application validates the same limit for immediate feedback; the RPC
-- repeats it because it is the final authority when recording the billed time.
CREATE OR REPLACE FUNCTION public.checkout_walkin_session(
  p_booking_id UUID,
  p_completed_date DATE DEFAULT NULL,
  p_completed_clock TIME DEFAULT NULL
)
RETURNS TABLE (
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  played_minutes INTEGER
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_zone TEXT := 'Asia/Kolkata';
  v_stated BOOLEAN := p_completed_date IS NOT NULL AND p_completed_clock IS NOT NULL;
  v_ended TIMESTAMPTZ;
  v_started TIMESTAMPTZ;
BEGIN
  IF (p_completed_date IS NULL) <> (p_completed_clock IS NULL) THEN
    RAISE EXCEPTION 'A stated checkout needs both a date and a time'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_ended := CASE
    WHEN v_stated THEN (p_completed_date + p_completed_clock) AT TIME ZONE v_zone
    ELSE v_now
  END;

  IF v_stated AND v_ended > v_now + INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'A checkout time cannot be more than 30 minutes in the future'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT b.checked_in_at INTO v_started
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.status = 'checked_in'
    AND b.checked_in_at IS NOT NULL
    AND b.billed_on_actual_time = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_ended <= v_started THEN
    RAISE EXCEPTION 'A checkout time has to be after the session started'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.bookings
  SET status = 'completed',
      completed_at = v_ended,
      completed_at_is_stated = v_stated,
      updated_at = v_now
  WHERE id = p_booking_id;

  started_at := v_started;
  ended_at := v_ended;
  played_minutes := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_ended - v_started)) / 60.0))::INTEGER;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.checkout_walkin_session(UUID, DATE, TIME) IS
  'Ends a walk-in session. Without a stated date and time, the database clock stamps checkout. A stated checkout may be up to 30 minutes ahead of the database clock, and must be after check-in.';

GRANT EXECUTE ON FUNCTION public.checkout_walkin_session(UUID, DATE, TIME) TO service_role;
