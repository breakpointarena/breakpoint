import { supabaseAdmin } from '@/lib/supabase/server'
import { MAX_LIVE_SESSION_HOURS, WALKIN_SLOT_HOLD_HOURS } from '@/lib/bookings/walkInSession'

// Retained for the dashboard's stale-session reporting.
export { MAX_LIVE_SESSION_HOURS }

/**
 * Which stations have somebody sitting at them right now.
 *
 * `devices.status` looks like it answers this and does not. Nothing in the
 * booking flow has ever written to it: check-in and check-out leave it alone,
 * `assign_device_slot` only reads it to find a free station, and there is no
 * trigger on the table. The only writes come from the admin Add/Edit Device
 * forms. So every surface counting `status === 'occupied'` reported zero however
 * busy the floor was, and every surface counting `status === 'available'`
 * reported the whole floor free while people were playing on it.
 *
 * The fix is to derive occupancy rather than start maintaining a second copy of
 * it. Writing `occupied` on check-in and `available` on check-out would be one
 * missed checkout, crashed request or hand-edited row away from a station stuck
 * occupied forever, with nothing able to notice it was wrong. A booking that is
 * `checked_in` is the arena's own record that someone is at that station, and it
 * is already the thing check-out clears.
 *
 * The device list follows the same hold as booking availability: one hour from
 * check-in by default, or through a future finish recorded by staff. A confirmed
 * booking whose slot started ten minutes ago is not occupied until check-in.
 */
export type DeviceOccupancy = {
  deviceId: string
  bookingId: string
  bookingNumber: string | null
  customerName: string | null
  /** When the session started, as a timestamptz string. */
  since: string | null
}

/** Live sessions, keyed by the device they are sitting at. */
export async function getOccupancyByDevice(): Promise<Map<string, DeviceOccupancy>> {
  const now = new Date()
  const liveSince = now.getTime() - WALKIN_SLOT_HOLD_HOURS * 60 * 60 * 1000

  const { data, error } = await supabaseAdmin
    .from('booking_device_slots')
    .select(
      `device_id, slot_date, slot_start_time, slot_end_time,
       bookings!inner(id, booking_number, customer_name, status, checked_in_at, walk_in_planned_end)`
    )
    .eq('bookings.status', 'checked_in')

  if (error) {
    // Availability is better shown as unknown-but-free than as a crashed page;
    // the caller falls back to treating nothing as occupied.
    console.error('Failed to read device occupancy:', error.message)
    return new Map()
  }

  const occupancy = new Map<string, DeviceOccupancy>()

  for (const row of data || []) {
    const booking = (row as any).bookings
    if (!row.device_id || !booking) continue
    const checkedInAt = booking.checked_in_at ? new Date(booking.checked_in_at).getTime() : 0
    const plannedEnd = booking.walk_in_planned_end ? new Date(booking.walk_in_planned_end).getTime() : 0
    const slotStart = new Date(`${row.slot_date}T${row.slot_start_time}+05:30`).getTime()
    const slotEndDate = new Date(`${row.slot_date}T${row.slot_end_time}+05:30`)
    if (slotEndDate.getTime() <= slotStart) slotEndDate.setDate(slotEndDate.getDate() + 1)
    const slotHoldUntil = slotEndDate.getTime()
    if (
      checkedInAt < liveSince &&
      plannedEnd <= now.getTime() &&
      slotHoldUntil <= now.getTime()
    ) continue

    // A device can only hold one live session, but a booking spanning several
    // slots on the same station would repeat it. First one wins; they describe
    // the same occupancy either way.
    if (occupancy.has(row.device_id)) continue

    occupancy.set(row.device_id, {
      deviceId: row.device_id,
      bookingId: booking.id,
      bookingNumber: booking.booking_number ?? null,
      customerName: booking.customer_name ?? null,
      since: booking.checked_in_at ?? null,
    })
  }

  return occupancy
}

/** Just the ids, for callers that only need to know free or busy. */
export async function getOccupiedDeviceIds(): Promise<Set<string>> {
  return new Set((await getOccupancyByDevice()).keys())
}

/**
 * What a device's status should read as on screen.
 *
 * `maintenance` and `inactive` still come from the column, because those are
 * genuinely manual: a table with a torn cloth is out of service whether or not
 * anyone is booked on it, and it outranks occupancy - a station cannot be in use
 * if it has been taken off the floor.
 */
export type EffectiveDeviceStatus = 'occupied' | 'maintenance' | 'inactive' | 'available'

export function effectiveDeviceStatus(
  storedStatus: string | null | undefined,
  isOccupied: boolean
): EffectiveDeviceStatus {
  const stored = String(storedStatus ?? '').toLowerCase()
  if (stored === 'maintenance' || stored === 'inactive') return stored
  return isOccupied ? 'occupied' : 'available'
}
