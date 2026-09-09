import { supabaseAdmin } from '@/lib/supabase/server'
import { occupiedRangeFor, timeToMinutes } from '@/lib/bookings/slotAvailability'

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

/**
 * Re-exported from `lib/bookings/slotAvailability`, where it sits beside the
 * rest of the window arithmetic. Kept named here because half the codebase
 * imports it from this module.
 */
export { timeToMinutes }

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
    /** Set only when the customer named a finish; then the end is not a placeholder. */
    walk_in_planned_end: string | null
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
      bookings!inner(status, lock_expires_at, billed_on_actual_time, checked_in_at, walk_in_planned_end)
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

  const now = new Date()

  for (const row of (data || []) as unknown as BookedSlotRow[]) {
    const booking = row.bookings

    // The caller's own hold is not competition for the caller. Without this, a
    // customer holding the last station would be told their slot was unavailable
    // at the moment they tried to pay for it.
    if (excludeBookingId && row.booking_id === excludeBookingId) continue

    /**
     * Expired holds, midnight, and how long a live walk-in keeps its station are
     * all decided by `occupiedRangeFor`, which the customer's slot picker reads
     * through as well.
     *
     * The two queries stay separate - they ask about different things, one by
     * device and one by type - but the arithmetic on a row must not, or the two
     * screens answer the same question differently. `assign_device_slot` repeats
     * it once more under its advisory lock and is the one that actually decides.
     */
    const range = occupiedRangeFor(
      {
        slotDate: row.slot_date,
        startTime: row.slot_start_time,
        endTime: row.slot_end_time,
        status: booking.status,
        lockExpiresAt: booking.lock_expires_at,
        billedOnActualTime: booking.billed_on_actual_time,
        checkedInAt: booking.checked_in_at,
        plannedEnd: booking.walk_in_planned_end,
      },
      slotDate,
      now
    )
    if (!range) continue

    const existing = byDevice.get(row.device_id)
    if (existing) {
      existing.push(range)
    } else {
      byDevice.set(row.device_id, [range])
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
