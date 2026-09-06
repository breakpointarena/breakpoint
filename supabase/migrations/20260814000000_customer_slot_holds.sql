-- ================================================
-- CUSTOMER SLOT HOLDS
-- ================================================
-- Until now the customer flow reserved nothing before payment.
-- `initializeSoftLockReservation` counted free stations in application code and
-- returned `bookingId: "temp"`; the "Slot Held 09:58" banner was a client-side
-- countdown over a slot nobody had claimed. Two customers could both pass that
-- check, both pay, and the loser was refunded by fulfilment - the only place a
-- station was ever actually claimed.
--
-- The schema was always designed for a real hold: `status = 'locked'`,
-- `lock_expires_at`, `expire_locked_bookings()`, and both `assign_device_slot`
-- and `check_slot_available` already treat a live lock as occupying the station
-- and a lapsed one as free. Nothing ever created such a row. This migration makes
-- that possible.

-- ================================================
-- 1. HOLD TOKEN
-- ================================================
-- A hold is handed to the browser and comes back to be converted or released. The
-- booking id alone would be enough only as long as it stays secret; the token is
-- a second secret that never appears in any listing, so a caller can only touch a
-- hold it was actually given. Cleared when the hold becomes a real booking.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_token TEXT;

COMMENT ON COLUMN public.bookings.hold_token IS 'Secret proving ownership of a pre-payment slot hold. Set while status = locked, cleared on conversion.';

-- ================================================
-- 2. A HOLD HAS NO CUSTOMER YET
-- ================================================
-- The hold is taken on the slot picker, one screen before the customer types a
-- phone number, so `customer_phone NOT NULL` made a pre-auth hold impossible. The
-- requirement is not dropped, only deferred: it still holds for every status a
-- customer-facing booking can be in.
ALTER TABLE public.bookings
  ALTER COLUMN customer_phone DROP NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_customer_phone_required;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_phone_required CHECK (
    status IN ('draft', 'locked', 'expired') OR customer_phone IS NOT NULL
  );

-- ================================================
-- 3. ASSIGNMENT MUST TREAT A LAPSED HOLD AS FREE
-- ================================================
-- Two clauses in assign_device_slot were written when no `locked` booking ever
-- existed, so both read a lapsed hold as still occupying its station:
--
--   * the exact-start-time guard skipped any station whose booking was not
--     already 'cancelled' or 'expired' - a hold abandoned ten minutes ago still
--     reads as 'locked', so the station stayed blocked until something swept it;
--   * the cleanup DELETE cleared only 'cancelled'/'expired' rows, so the INSERT
--     below would then collide with the abandoned hold's row on
--     UNIQUE(device_id, slot_date, slot_start_time) and fail.
--
-- Both now use the same "still holds it" test the range check has always used:
-- an expired lock holds nothing. Abandoned checkouts are the common case once
-- holds are real, so this is what stops one dropped browser tab taking a station
-- out of service for the rest of the day.
CREATE OR REPLACE FUNCTION public.assign_device_slot(
  p_booking_id UUID,
  p_device_type_id UUID,
  p_slot_date DATE,
  p_slot_start_time TIME,
  p_slot_end_time TIME,
  p_duration_hours NUMERIC,
  p_hourly_rate NUMERIC,
  p_slot_total NUMERIC,
  p_device_type TEXT,
  p_player_count INTEGER,
  p_included_players INTEGER,
  p_extra_player_charge NUMERIC,
  p_extra_players_total NUMERIC
)
RETURNS TABLE (device_id UUID, station_number TEXT)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_requested TSRANGE;
  v_device RECORD;
BEGIN
  -- Serialise concurrent assignment for this device type on this date.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_device_type_id::TEXT || ':' || p_slot_date::TEXT)
  );

  -- Unwrap the requested window; an end time at or before the start means the
  -- booking runs past midnight.
  v_requested := tsrange(
    p_slot_date + p_slot_start_time,
    (p_slot_date + p_slot_start_time) + CASE
      WHEN p_slot_end_time > p_slot_start_time
        THEN (p_slot_end_time - p_slot_start_time)
      ELSE (p_slot_end_time - p_slot_start_time) + INTERVAL '24 hours'
    END
  );

  SELECT d.id, d.station_number
  INTO v_device
  FROM public.devices d
  WHERE d.device_type_id = p_device_type_id
    AND d.status = 'available'
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_device_slots bds
      JOIN public.bookings b ON b.id = bds.booking_id
      WHERE bds.device_id = d.id
        AND b.status IN ('locked', 'confirmed', 'checked_in')
        -- An expired lock no longer holds the slot.
        AND (b.status <> 'locked' OR b.lock_expires_at > NOW())
        -- Neighbouring days are in range because bookings can cross midnight.
        AND bds.slot_date BETWEEN p_slot_date - 1 AND p_slot_date + 1
        AND tsrange(
              bds.slot_date + bds.slot_start_time,
              (bds.slot_date + bds.slot_start_time) + CASE
                WHEN bds.slot_end_time > bds.slot_start_time
                  THEN (bds.slot_end_time - bds.slot_start_time)
                ELSE (bds.slot_end_time - bds.slot_start_time) + INTERVAL '24 hours'
              END
            ) && v_requested
    )
    -- The legacy UNIQUE(device_id, slot_date, slot_start_time) index is status
    -- blind. Skip any station holding a row at this exact key that we are not
    -- allowed to clear below, so the insert can never fail on it.
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_device_slots bds2
      JOIN public.bookings b2 ON b2.id = bds2.booking_id
      WHERE bds2.device_id = d.id
        AND bds2.slot_date = p_slot_date
        AND bds2.slot_start_time = p_slot_start_time
        AND b2.status NOT IN ('cancelled', 'expired')
        -- A hold that has run out is cleared below, so it is not a collision.
        AND (b2.status <> 'locked' OR b2.lock_expires_at > NOW())
    )
  ORDER BY d.station_number
  LIMIT 1;

  -- No free station: return zero rows so the caller can refund.
  -- FOUND reflects whether the SELECT matched, which is what we actually mean;
  -- `v_device IS NULL` only holds when every field came back NULL.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A cancelled or expired booking - or a hold whose ten minutes ran out - leaves
  -- its slot row behind, which the unique index would treat as a collision even
  -- though the station is free. Those rows are excluded from every report, so
  -- clearing the exact colliding key is safe.
  DELETE FROM public.booking_device_slots bds
  USING public.bookings b
  WHERE bds.booking_id = b.id
    AND bds.device_id = v_device.id
    AND bds.slot_date = p_slot_date
    AND bds.slot_start_time = p_slot_start_time
    AND (
      b.status IN ('cancelled', 'expired')
      OR (b.status = 'locked' AND b.lock_expires_at <= NOW())
    );

  INSERT INTO public.booking_device_slots (
    booking_id,
    device_id,
    slot_date,
    slot_start_time,
    slot_end_time,
    duration_hours,
    hourly_rate,
    slot_total,
    device_type,
    device_station_number,
    player_count,
    included_players,
    extra_player_charge,
    extra_players_total
  ) VALUES (
    p_booking_id,
    v_device.id,
    p_slot_date,
    p_slot_start_time,
    p_slot_end_time,
    p_duration_hours,
    p_hourly_rate,
    p_slot_total,
    p_device_type,
    v_device.station_number,
    p_player_count,
    p_included_players,
    p_extra_player_charge,
    p_extra_players_total
  );

  device_id := v_device.id;
  station_number := v_device.station_number;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.assign_device_slot IS 'Atomically picks a free station of the given type for the requested time range and inserts the booking slot. A hold past its lock_expires_at counts as free. Returns zero rows when the slot is fully booked.';

GRANT EXECUTE ON FUNCTION public.assign_device_slot TO service_role;

-- ================================================
-- 4. RELEASING A HOLD
-- ================================================
-- Marks the hold spent and drops the slot row it was sitting on, in one
-- statement pair the caller cannot half-complete. Returns true only when a live
-- hold with this exact token was released, so a stale browser retrying release
-- cannot disturb a booking that has since been paid for.
CREATE OR REPLACE FUNCTION public.release_slot_hold(
  p_booking_id UUID,
  p_hold_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $function$
DECLARE
  v_released BOOLEAN := FALSE;
BEGIN
  UPDATE public.bookings
  SET status = 'expired',
      lock_expires_at = NULL,
      hold_token = NULL,
      updated_at = NOW()
  WHERE id = p_booking_id
    AND status = 'locked'
    AND hold_token IS NOT NULL
    AND hold_token = p_hold_token;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_released := TRUE;

  -- The station is free the moment the status changes; deleting the slot row as
  -- well keeps the unique index clear so the next customer does not depend on
  -- assign_device_slot's lazy cleanup.
  DELETE FROM public.booking_device_slots
  WHERE booking_id = p_booking_id;

  RETURN v_released;
END;
$function$;

COMMENT ON FUNCTION public.release_slot_hold IS 'Releases a pre-payment slot hold the caller owns. Returns false when the hold is not live, not found, or the token does not match.';

GRANT EXECUTE ON FUNCTION public.release_slot_hold TO service_role;

-- ================================================
-- 5. SWEEPING LAPSED HOLDS
-- ================================================
-- expire_locked_bookings() already exists and is correct; it has simply never had
-- anything to sweep. Availability never depended on it - every read compares
-- lock_expires_at directly - so this is hygiene: it stops abandoned holds sitting
-- in 'locked' forever and keeps the partial index below small.
--
-- Slot rows are deliberately left behind: assign_device_slot clears the exact
-- colliding key when it needs to, and doing it here would mean touching rows
-- outside any advisory lock.
GRANT EXECUTE ON FUNCTION public.expire_locked_bookings TO service_role;
