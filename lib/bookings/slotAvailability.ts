/**
 * Which start times a device type can take, given what is already booked.
 *
 * Pure and client-safe on purpose. The slot picker used to ask the server this
 * question again for every duration the customer tried, even though the only
 * thing that differs between "one hour" and "two hours" is the arithmetic - the
 * bookings behind it are identical. Fetching the occupancy once per date and
 * running this in the browser turns a duration tap from a network round trip
 * into a synchronous recompute.
 *
 * The server still owns the decision that matters: `assign_device_slot` repeats
 * the same overlap check under a lock when the station is actually claimed. This
 * only decides what to offer.
 */

import { liveSessionEndMinutes } from '@/lib/bookings/walkInSession'

export const SLOT_INTERVAL_MINUTES = 30
export const MINUTES_PER_DAY = 24 * 60

/**
 * One station's busy window, in minutes from midnight of the date being asked
 * about. A window that began yesterday is negative and one that runs into
 * tomorrow reaches past 1440, so overlap stays a plain comparison with no
 * midnight special cases left to get wrong.
 */
export interface OccupiedRange {
  /**
   * Station identity within this response - an index, not the device's UUID.
   * The picker only needs to tell two stations apart, so that one station's
   * back-to-back bookings are not counted as two busy stations. The real ids
   * are not the browser's business.
   */
  device: number
  start: number
  end: number
}

export interface DeviceTypeOccupancy {
  /** Stations of this type in service, whether or not they are busy. */
  totalDevices: number
  occupied: OccupiedRange[]
}

/**
 * One booked row, in the shape both occupancy builders can hand over.
 *
 * `lib/payments/availability.ts` (what the desk's checks read) and
 * `lib/bookings/deviceTypeOccupancy.ts` (what the customer's slot picker reads)
 * are separate queries against the same table, and they used to do this
 * arithmetic separately too - which is how the picker ended up without the
 * live-session rule for months, offering stations `assign_device_slot` would
 * then refuse. The queries stay apart; the rule does not.
 */
export interface BookedRow {
  /** The row's own date, `YYYY-MM-DD`. */
  slotDate: string
  /** `HH:MM` or `HH:MM:SS`. */
  startTime: string
  endTime: string
  status: string
  lockExpiresAt: string | null
  /** True for a walk-in session, whose slot end may be a placeholder. */
  billedOnActualTime: boolean | null
  checkedInAt: string | null
  /** Set only when the customer named a finish, which makes it not a placeholder. */
  plannedEnd: string | null
}

/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

/**
 * What one row occupies on `slotDate`'s timeline, or null if it occupies nothing
 * there.
 *
 * The three rules that make a window, in one place:
 *
 *  - **Midnight.** An end at or before its start has wrapped, so it belongs to
 *    the next day; a neighbouring date's row is rebased onto this one's timeline,
 *    which is what lets every caller compare with a plain `<`.
 *  - **Expired holds.** A `locked` booking past its expiry is holding nothing.
 *  - **Live walk-ins.** A checked-in session holds its station until checkout,
 *    capped at `MAX_LIVE_SESSION_HOURS` - unless the customer named a finish
 *    that has not arrived, in which case the row's own window is the truth and
 *    the hours after it are free. `liveSessionEndMinutes` owns that decision and
 *    `assign_device_slot` repeats it in SQL.
 */
export function occupiedRangeFor(
  row: BookedRow,
  slotDate: string,
  now: Date = new Date()
): { start: number; end: number } | null {
  if (
    row.status === 'locked' &&
    row.lockExpiresAt &&
    new Date(row.lockExpiresAt).getTime() <= now.getTime()
  ) {
    return null
  }

  let start = timeToMinutes(row.startTime)
  let end = timeToMinutes(row.endTime)

  if (end <= start) end += MINUTES_PER_DAY

  // YYYY-MM-DD compares chronologically as a string, so which side of the date
  // a row falls on is just the comparison.
  if (row.slotDate < slotDate) {
    start -= MINUTES_PER_DAY
    end -= MINUTES_PER_DAY
  } else if (row.slotDate > slotDate) {
    start += MINUTES_PER_DAY
    end += MINUTES_PER_DAY
  }

  const liveEnd = liveSessionEndMinutes(
    {
      billedOnActualTime: row.billedOnActualTime,
      status: row.status,
      checkedInAt: row.checkedInAt,
      plannedEnd: row.plannedEnd,
    },
    slotDate,
    now
  )
  // Only ever lengthens: a live session cannot hold less than its row says.
  if (liveEnd !== null && liveEnd > end) end = liveEnd

  // Yesterday's booking that finished before midnight cannot touch today.
  if (end <= 0) return null

  return { start, end }
}

/** Is at least one station of this type free for the whole window? */
export function isRangeAvailable(
  { totalDevices, occupied }: DeviceTypeOccupancy,
  startMinutes: number,
  durationMinutes: number
): boolean {
  if (totalDevices <= 0) return false

  const endMinutes = startMinutes + durationMinutes

  // Counting busy *stations* rather than rows: a station holding two
  // back-to-back bookings is one station, and counting it twice would hide a
  // slot that still has somewhere free to put the customer.
  const busy = new Set<number>()
  for (const range of occupied) {
    if (range.start < endMinutes && startMinutes < range.end) busy.add(range.device)
  }

  return busy.size < totalDevices
}

/**
 * Every half-hour start of the day that can take a booking of this length, as
 * minutes from midnight. The arena trades round the clock, so a start late
 * enough to finish tomorrow is a normal offer rather than an edge case - it
 * simply extends past 1440, which is where the next day's rebased bookings sit.
 */
export function availableStartMinutes(
  occupancy: DeviceTypeOccupancy,
  durationMinutes: number
): number[] {
  const starts: number[] = []

  for (let start = 0; start < MINUTES_PER_DAY; start += SLOT_INTERVAL_MINUTES) {
    if (isRangeAvailable(occupancy, start, durationMinutes)) starts.push(start)
  }

  return starts
}
