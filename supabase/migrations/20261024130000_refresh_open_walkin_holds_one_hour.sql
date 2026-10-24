-- Existing open walk-ins had 12-hour placeholder slot rows. Bring them into
-- line with the one-hour hold, while preserving any finish staff recorded.
UPDATE public.booking_device_slots AS slot
SET slot_date = (booking.checked_in_at AT TIME ZONE 'Asia/Kolkata')::DATE,
    slot_start_time = (booking.checked_in_at AT TIME ZONE 'Asia/Kolkata')::TIME,
    slot_end_time = ((booking.checked_in_at AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 hour')::TIME,
    duration_hours = 1
FROM public.bookings AS booking
WHERE booking.id = slot.booking_id
  AND booking.status = 'checked_in'
  AND booking.billed_on_actual_time IS TRUE
  AND booking.checked_in_at IS NOT NULL
  AND booking.walk_in_planned_end IS NULL;
