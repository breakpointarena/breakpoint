-- ================================================
-- DATES FOLLOW THE ARENA'S CLOCK, NOT THE SERVER'S
-- ================================================
-- A walk-in checked in at 00:07 IST on 15 Aug was stored against 2026-08-14 and
-- did not appear under Today. The database runs in UTC, the arena runs in IST
-- (UTC+5:30), and every date below was derived from the former:
--
--   checkin_walkin_session : (NOW() AT TIME ZONE current_setting('TimeZone'))
--   generate_booking_number: TO_CHAR(NOW(), 'YYYYMMDD')
--   get_customer_active_subscription: CURRENT_DATE
--
-- All three render a timestamptz in the *database's* zone. Between midnight and
-- 05:30 IST that is still yesterday, so a booking taken just after midnight was
-- filed under the previous day - slot date, start time and booking number alike.
-- This is a venue whose customers are still playing well past midnight, so that
-- window is ordinary trading hours rather than an edge case.
--
-- The zone is named explicitly rather than fixed by changing the database's
-- TimeZone setting: that setting also governs how every other query renders a
-- timestamp, and moving it would silently shift readings that are correct today.
-- Naming it is also what 20260811000000_promo_codes_inclusive_end_date already
-- does, so the two agree.
--
-- Each body below is the deployed definition with only the zone changed.

-- ================================================
-- 1. CHECK-IN: slot date and start time
-- ================================================
CREATE OR REPLACE FUNCTION public.checkin_walkin_session(p_booking_id uuid, p_device_type_id uuid, p_device_type text, p_hourly_rate numeric, p_player_count integer, p_included_players integer, p_extra_player_charge numeric, p_provisional_hours numeric)
 RETURNS TABLE(started_at timestamp with time zone, device_id uuid, station_number text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_start TIME := (v_now AT TIME ZONE 'Asia/Kolkata')::TIME;
  v_date DATE := (v_now AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_end TIME;
  v_assigned RECORD;
BEGIN
  -- Claim the booking first. Anything not sitting in 'confirmed' and waiting -
  -- already checked in, cancelled, completed, or an advance booking that is not
  -- an open-ended session - matches nothing and gets zero rows back.
  UPDATE public.bookings
  SET status = 'checked_in',
      checked_in_at = v_now,
      updated_at = v_now
  WHERE id = p_booking_id
    AND status = 'confirmed'
    AND checked_in_at IS NULL
    AND billed_on_actual_time = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_end := (v_start + (p_provisional_hours || ' hours')::INTERVAL)::TIME;

  SELECT * INTO v_assigned
  FROM public.assign_device_slot(
    p_booking_id,
    p_device_type_id,
    v_date,
    v_start,
    v_end,
    p_provisional_hours,
    p_hourly_rate,
    0,
    p_device_type,
    p_player_count,
    p_included_players,
    p_extra_player_charge,
    0
  );

  -- Floor is full. Undo the check-in so the booking goes back to waiting and the
  -- front desk can try again or move the customer to another device type -
  -- raising would do the same thing but lose the reason.
  IF NOT FOUND THEN
    UPDATE public.bookings
    SET status = 'confirmed',
        checked_in_at = NULL,
        updated_at = v_now
    WHERE id = p_booking_id;
    RETURN;
  END IF;

  started_at := v_now;
  device_id := v_assigned.device_id;
  station_number := v_assigned.station_number;
  RETURN NEXT;
END;
$function$
;

-- ================================================
-- 2. BOOKING NUMBERS
-- ================================================
-- The number carries the trading day it belongs to, so it has to agree with the
-- day the rest of the booking is filed under.
CREATE OR REPLACE FUNCTION public.generate_booking_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
  today TEXT;
  sequence_num INTEGER;
  booking_num TEXT;
BEGIN
  today := TO_CHAR((NOW() AT TIME ZONE 'Asia/Kolkata')::DATE, 'YYYYMMDD');

  -- Get next sequence number for today
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(booking_number FROM LENGTH(booking_number) - 2) AS INTEGER
    )
  ), 0) + 1 INTO sequence_num
  FROM public.bookings
  WHERE booking_number LIKE 'BP-' || today || '-%';

  booking_num := 'BP-' || today || '-' || LPAD(sequence_num::TEXT, 3, '0');

  RETURN booking_num;
END;
$function$;

-- ================================================
-- 3. SUBSCRIPTION EXPIRY
-- ================================================
-- A membership expiring today stayed usable through the first five and a half
-- hours of the next one.
CREATE OR REPLACE FUNCTION public.get_customer_active_subscription(p_customer_id uuid)
 RETURNS TABLE(subscription_id uuid, subscription_name text, discount_percentage integer, end_date date)
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Check if new subscriptions table exists, otherwise use legacy
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    RETURN QUERY
    SELECT
      s.id,
      sp.name,
      sp.discount_percentage,
      s.end_date
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
    WHERE s.customer_id = p_customer_id
      AND s.status = 'active'
      AND s.end_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
    ORDER BY s.end_date DESC
    LIMIT 1;
  ELSIF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_purchases_legacy') THEN
    RETURN QUERY
    SELECT
      spl.id,
      sp.name,
      sp.discount_percentage::INTEGER,
      spl.expires_at::DATE
    FROM public.subscription_purchases_legacy spl
    JOIN public.subscription_plans_legacy sp ON sp.id = spl.subscription_id
    WHERE spl.customer_id = p_customer_id
      AND spl.is_active = true
      AND spl.expires_at > NOW()
    ORDER BY spl.expires_at DESC
    LIMIT 1;
  END IF;
END;
$function$
;


-- Historical rows are deliberately left alone. Three walk-ins taken just after
-- midnight on 15 Aug carry 2026-08-14; rewriting past bookings is an operator
-- decision, not something a schema migration should do silently.
