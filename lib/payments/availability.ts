import { supabaseAdmin } from '@/lib/supabase/server'
import { liveSessionEndMinutes } from '@/lib/bookings/walkInSession'

/**
 * Overlap-aware slot availability for flexible-duration bookings.
 *
 * The older exact-start-time check (`slot_start_time = X`) cannot see a 10:30-11:30
 * booking when asked about 10:00-11:00, so it would happily take payment for a
 * station that is already busy. Everything here works in minute ranges instead.
 */

const MINUTES_PER_DAY = 24 * 60

const ACTIVE_STATUSES = ['locked', 'confirmed', 'checked_in']

export interface MinuteRange {
  start: number
  end: number
}

/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

/** Requested window, expressed as minutes from midnight of the booking date. */
export function toRequestedRange(
  slotStartTime24: string,
  durationMinutes: number
): MinuteRange {
  const start = timeToMinutes(slotStartTime24)
  return { start, end: start + durationMinutes }
}

function overlaps(a: MinuteRange, b: MinuteRange): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * ISO date string (YYYY-MM-DD) shifted by `days`.
 *
 * Timezone-neutral by construction: the Date is built from the string's own
 * components and read back the same way, so whatever zone the host is in cancels
 * out. No instant is ever involved, which is what makes the host-clock reads
 * below safe here and nowhere else.
 */
export function shiftDate(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` // arena-clock-ok
}

interface BookedSlotRow {
  booking_id: string
  device_id: string
  slot_date: string
  slot_start_time: string
  slot_end_time: string
  bookings: {
    status: string
    lock_expires_at: string | null
    /** True for a walk-in session, whose slot end is a placeholder. */
    billed_on_actual_time: boolean | null
    checked_in_at: string | null
  }
}

/**
 * Every currently-held range for the given devices that could touch `slotDate`.
 *
 * Includes the previous day so an overnight booking (e.g. 23:00-01:00) is seen as
 * occupying the early hours of `slotDate`. Ranges are normalised to minutes from
 * midnight of `slotDate`, so the previous day's slots come back negative.
 */
async function fetchOccupiedRanges(
  deviceIds: string[],
  slotDate: string,
  excludeBookingId?: string | null
): Promise<Map<string, MinuteRange[]>> {
  const byDevice = new Map<string, MinuteRange[]>()

  if (deviceIds.length === 0) return byDevice

  const { data, error } = await supabaseAdmin
    .from('booking_device_slots')
    .select(
      `
      booking_id,
      device_id,
      slot_date,
      slot_start_time,
      slot_end_time,
      bookings!inner(status, lock_expires_at, billed_on_actual_time, checked_in_at)
    `
    )
    .in('device_id', deviceIds)
    // Both neighbours, matching `assign_device_slot`'s own
    // `BETWEEN p_slot_date - 1 AND p_slot_date + 1`. The previous day covers a
    // booking that ran past midnight into this one; the next day covers the
    // mirror case, a window on this date that reaches past midnight itself - a
    // walk-in checking in at 22:00 claims five provisional hours, so it runs to
    // 03:00 tomorrow and a booking held there is a genuine conflict.
    .in('slot_date', [shiftDate(slotDate, -1), slotDate, shiftDate(slotDate, 1)])
    .in('bookings.status', ACTIVE_STATUSES)

  if (error) throw error

  const now = Date.now()

  for (const row of (data || []) as unknown as BookedSlotRow[]) {
    const booking = row.bookings

    // The caller's own hold is not competition for the caller. Without this, a
    // customer holding the last station would be told their slot was unavailable
    // at the moment they tried to pay for it.
    if (excludeBookingId && row.booking_id === excludeBookingId) continue

    // An expired lock no longer holds the slot.
    if (
      booking.status === 'locked' &&
      booking.lock_expires_at &&
      new Date(booking.lock_expires_at).getTime() <= now
    ) {
      continue
    }

    let start = timeToMinutes(row.slot_start_time)
    let end = timeToMinutes(row.slot_end_time)

    // Stored end times wrap at midnight; unwrap so the range stays contiguous.
    if (end <= start) end += MINUTES_PER_DAY

    // Rebase a neighbouring day's rows onto this date's timeline. YYYY-MM-DD
    // compares chronologically as a string, so which side it falls on is just
    // the comparison.
    if (row.slot_date < slotDate) {
      start -= MINUTES_PER_DAY
      end -= MINUTES_PER_DAY
      if (end <= 0) continue
    } else if (row.slot_date > slotDate) {
      start += MINUTES_PER_DAY
      end += MINUTES_PER_DAY
    }

    /**
     * A walk-in that is still checked in holds its station until checkout, not
     * until the placeholder window claimed at check-in runs out. Applied after
     * the rebase above so both numbers are on the same timeline, and taken as
     * the later of the two so this can only lengthen an occupancy.
     *
     * `assign_device_slot` repeats this under its advisory lock and is the one
     * that actually decides; keeping the two in step is what stops this check
     * telling the desk a station is free that the claim will then refuse.
     */
    const liveEnd = liveSessionEndMinutes(
      {
        billedOnActualTime: booking.billed_on_actual_time,
        status: booking.status,
        checkedInAt: booking.checked_in_at,
      },
      slotDate
    )
    if (liveEnd !== null && liveEnd > end) end = liveEnd

    const existing = byDevice.get(row.device_id)
    if (existing) {
      existing.push({ start, end })
    } else {
      byDevice.set(row.device_id, [{ start, end }])
    }
  }

  return byDevice
}

async function fetchAvailableDevices(deviceTypeId: string) {
  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id, station_number')
    .eq('device_type_id', deviceTypeId)
    .eq('status', 'available')
    .order('station_number', { ascending: true })

  if (error) throw error
  return (data || []) as Array<{ id: string; station_number: string }>
}

/**
 * How many stations of this type are free for the whole window.
 *
 * Read-only: used to reject a booking before taking payment. The station is
 * actually claimed by the `assign_device_slot` database function, which repeats
 * this check under a lock so concurrent payers cannot share a station.
 */
export async function countAvailableDevicesForRange(
  deviceTypeId: string,
  slotDate: string,
  requested: MinuteRange,
  /** A hold belonging to the customer being quoted, which must not count against them. */
  excludeBookingId?: string | null
): Promise<number> {
  const devices = await fetchAvailableDevices(deviceTypeId)
  if (devices.length === 0) return 0

  const occupied = await fetchOccupiedRanges(
    devices.map((device) => device.id),
    slotDate,
    excludeBookingId
  )

  return devices.filter((device) => {
    const ranges = occupied.get(device.id) || []
    return !ranges.some((range) => overlaps(range, requested))
  }).length
}
