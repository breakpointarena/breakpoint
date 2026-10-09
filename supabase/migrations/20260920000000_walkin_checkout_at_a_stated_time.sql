-- ================================================
-- CHECKOUT AT A STATED TIME, NOT THE TIME OF THE BUTTON PRESS
-- ================================================
-- Checkout stamped `completed_at` from the database clock, which is right until
-- it is not. The customer leaves at nine, the desk is busy, and the session is
-- closed at half past eleven: two and a half hours billed to somebody who had
-- already gone home, with nothing on the screen able to say otherwise.
--
-- The desk can now state when the customer actually left. Passing nothing keeps
-- the old behaviour exactly - the clock decides - so the ordinary checkout is
-- unchanged and every existing caller keeps working.
--
-- The time arrives as an arena-local date and clock rather than an instant, and
-- is converted here with a named zone, because that is the one place that can
-- be trusted to get it right: the database runs in UTC, the desk reads IST, and
-- 20260815100000 exists because those two were once confused. A browser sending
-- an already-converted instant would be sending its own idea of the offset.
--
-- Two rules, enforced here as well as in `resolveCheckoutTime` on the way in.
-- The application's copy is there to answer the desk instantly; this one is
-- there because a server function is a public endpoint and the pricing that
-- follows is arithmetic on the window these two timestamps describe.
--
--   * After the session started. Not policy - a session cannot end before it
--     began, and a negative duration would price as a negative bill.
--   * Not in the future. Billing for minutes not yet played, and the likely
--     cause is a date picked off the wrong row rather than an intention.
--
-- Deliberately no limit on how far back it may go. The sessions that need this
-- most are the forgotten ones - checked in on Friday, noticed on Monday - and a
-- ceiling would lock out the case the whole thing exists for.
-- ================================================

-- Which clock decided the end of the session. Existing rows were all stamped by
-- the database, so false is the correct answer for them, and the default keeps
-- it correct for every ordinary checkout from here.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS completed_at_is_stated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.completed_at_is_stated IS
  'True when a person typed the checkout time rather than the database clock stamping it. What a customer pays for a walk-in is the window between checked_in_at and completed_at, so a stated end is a staff decision about money and is recorded as one.';

DROP FUNCTION IF EXISTS public.checkout_walkin_session(UUID);

CREATE OR REPLACE FUNCTION public.checkout_walkin_session(
  p_booking_id UUID,
  -- Both null together: the clock decides, as it always did.
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
  -- Named, not current_setting('TimeZone'): see the note at the top.
  v_zone TEXT := 'Asia/Kolkata';
  v_stated BOOLEAN := p_completed_date IS NOT NULL AND p_completed_clock IS NOT NULL;
  v_ended TIMESTAMPTZ;
  v_started TIMESTAMPTZ;
BEGIN
  -- Half a time is a caller bug, not a checkout. Refused loudly rather than
  -- quietly falling back to the clock, which would bill the wrong window and
  -- look like it had worked.
  IF (p_completed_date IS NULL) <> (p_completed_clock IS NULL) THEN
    RAISE EXCEPTION 'A stated checkout needs both a date and a time'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_ended := CASE
    WHEN v_stated THEN (p_completed_date + p_completed_clock) AT TIME ZONE v_zone
    ELSE v_now
  END;

  IF v_stated AND v_ended > v_now THEN
    RAISE EXCEPTION 'A checkout time cannot be in the future'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Read before the update so the comparison can be made against a row that is
  -- still a session in progress, and so a refusal below leaves it that way.
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
  -- Whole minutes, rounded up: a session is never billed as zero minutes long.
  played_minutes := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_ended - v_started)) / 60.0))::INTEGER;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.checkout_walkin_session IS 'Ends a walk-in session. With no date and time the database clock stamps completed_at, exactly as before. With both, that arena-local moment is used instead and recorded as stated - refused if it is in the future or not after check-in. Returns the played window so the caller can price it; zero rows when the session is not in progress.';
GRANT EXECUTE ON FUNCTION public.checkout_walkin_session TO service_role;
