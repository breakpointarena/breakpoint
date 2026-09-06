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
