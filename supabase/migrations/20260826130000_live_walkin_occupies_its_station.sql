-- ================================================
-- A WALK-IN OCCUPIES ITS STATION UNTIL CHECKOUT, NOT UNTIL ITS PLACEHOLDER ENDS
-- ================================================
-- Two subsystems answered "is that station busy" and gave different answers.
--
--   lib/devices/occupancy.ts  - keyed on booking STATUS. A `checked_in` booking
--                               means a person is sitting there, for up to
--                               MAX_LIVE_SESSION_HOURS (12) from check-in.
--   assign_device_slot        - keyed on the SLOT WINDOW. For a walk-in that is
--   lib/payments/availability.ts  the provisional PROVISIONAL_SESSION_HOURS (5)
--                               block claimed at check-in, which is a placeholder
--                               and not a time anybody decided.
--
-- So between the fifth and twelfth hour of a session the floor plan showed a
-- customer at the station while the booking flow sold it to somebody else. Proved
-- against a session checked in six hours earlier: the screens reported it
-- occupied, the overlap test found nothing, and `assign_device_slot` handed the
-- same station to a second booking.
--
-- This is not hypothetical on this data. The comment on MAX_LIVE_SESSION_HOURS
-- records eighteen production bookings left in `checked_in`, the oldest
-- fifty-one days - every one of them a station the two rules disagree about.
--
-- The fix is to make the slot window say what occupancy already says: while a
-- walk-in session is checked in, it holds its station until checkout. The
-- placeholder end is kept as a floor and extended, never shortened.
--
-- SCOPED TO WALK-IN SESSIONS ON PURPOSE. `billed_on_actual_time` is the column
-- that means "this booking has no end until somebody stops the clock". A fixed
-- slot does have an end, it is the one on the row, and stretching that to
-- checkout would break back-to-back bookings: a 14:00-15:00 customer who has not
-- been checked out at 15:00 would block the 15:00-16:00 booking that was sold
-- months ago. Overrunning a fixed slot is an overbooking question, not this one.

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
        -- A live session reaching forward twelve hours is still inside this:
        -- the window below can end at most a day after the row's own date.
        AND bds.slot_date BETWEEN p_slot_date - 1 AND p_slot_date + 1
        AND tsrange(
              bds.slot_date + bds.slot_start_time,
              GREATEST(
                -- The window on the row: a fixed booking's real slot, or a live
                -- session's provisional block. Kept as the floor so this change
                -- can only ever lengthen an occupancy, never shorten one.
                (bds.slot_date + bds.slot_start_time) + CASE
                  WHEN bds.slot_end_time > bds.slot_start_time
                    THEN (bds.slot_end_time - bds.slot_start_time)
                  ELSE (bds.slot_end_time - bds.slot_start_time) + INTERVAL '24 hours'
                END,
                -- A checked-in walk-in has no end until checkout. Held to the
                -- same twelve hours `MAX_LIVE_SESSION_HOURS` uses in
                -- lib/bookings/walkInSession.ts, so the two rules agree and a
                -- forgotten checkout frees the station by the next day rather
                -- than never. Named zone, not current_setting('TimeZone'): the
                -- database runs in UTC and slot_date/slot_start_time are arena
                -- local, which is the bug 20260815100000 exists for.
                CASE
                  WHEN b.billed_on_actual_time
                   AND b.status = 'checked_in'
                   AND b.checked_in_at IS NOT NULL
                  THEN (b.checked_in_at AT TIME ZONE 'Asia/Kolkata') + INTERVAL '12 hours'
                END
              )
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

COMMENT ON FUNCTION public.assign_device_slot IS 'Atomically picks a free station of the given type for the requested time range and inserts the booking slot. A hold past its lock_expires_at counts as free; a checked-in walk-in holds its station until checkout, capped at twelve hours from check-in. Returns zero rows when the slot is fully booked.';

GRANT EXECUTE ON FUNCTION public.assign_device_slot TO service_role;
