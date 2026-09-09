-- ================================================
-- A PLANNED END FREES THE HOURS AFTER IT
-- ================================================
-- `20260826130000` made a checked-in walk-in hold its station until checkout,
-- capped at twelve hours, because the alternative was selling a station somebody
-- was still sitting at. That fix had to assume the worst: a session with no
-- stated end could be over in ten minutes or run all evening, and nothing on the
-- row could tell the two apart.
--
-- `20260907000000` gave the desk somewhere to say. When the customer says they
-- are leaving at nine, holding the station until nine in the morning blocks an
-- entire evening of bookings on the strength of no information at all - which is
-- what the arena saw: one walk-in and the type read fully booked for the rest of
-- the day.
--
-- So the twelve-hour hold now applies only while nobody has said otherwise:
--
--   no planned end          -> held until checkout, capped at twelve hours
--   planned end, not passed -> held to the planned end; sell what is after it
--   planned end, passed     -> overrunning, so held until checkout again
--
-- That last line is the one that keeps this honest. The customer is not thrown
-- out of the system at nine o'clock: at 9:01, with no checkout, the station goes
-- back to being held exactly as an unplanned session would be, so nothing new is
-- sold over the top of them.
--
-- The risk this accepts, deliberately: a booking sold for 9:30 while they were
-- still expected to leave at nine, which they then overrun. That is the same
-- exposure every fixed slot already carries - a 2pm-3pm customer who will not
-- get up does not make the 3pm booking disappear - and it is an overbooking
-- question for the floor, not an availability one for this function.
--
-- `lib/payments/availability.ts` applies the same three lines through
-- `liveSessionEndMinutes`, so the read-only check and this claim agree. Keeping
-- them in step is the whole reason `20260826130000` exists.

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
                   -- ...unless the customer named a finish that has not arrived
                   -- yet. Then the row's own window is the honest end of this
                   -- session and the hours after it are for sale. Once that time
                   -- passes with no checkout they are overrunning, this test
                   -- goes back to true, and the station is held again.
                   AND NOT (
                         b.walk_in_planned_end IS NOT NULL
                     AND b.walk_in_planned_end > NOW()
                   )
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

COMMENT ON FUNCTION public.assign_device_slot IS 'Atomically picks a free station of the given type for the requested time range and inserts the booking slot. A hold past its lock_expires_at counts as free; a checked-in walk-in holds its station until checkout, capped at twelve hours from check-in - unless it named a planned end still in the future, in which case it holds only to that. Returns zero rows when the slot is fully booked.';

GRANT EXECUTE ON FUNCTION public.assign_device_slot TO service_role;

-- PostgREST caches nothing about function bodies, but the schema reload keeps
-- this consistent with the migrations either side of it.
NOTIFY pgrst, 'reload schema';
