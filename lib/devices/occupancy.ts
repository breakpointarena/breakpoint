import { supabaseAdmin } from '@/lib/supabase/server'
import { MAX_LIVE_SESSION_HOURS } from '@/lib/bookings/walkInSession'

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
 * Deliberately keyed on booking status rather than the slot's time window:
 * "occupied" means a person is physically there, which is what check-in records.
 * A walk-in that runs past its provisional window is still occupied; a confirmed
 * booking whose slot started ten minutes ago is not, until they turn up. It also
 * means this cannot be thrown off by a mis-dated `slot_date`.
 */
// Defined with the other session-length rules, and re-exported here because
// occupancy is where most callers meet it.
export { MAX_LIVE_SESSION_HOURS }

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
  const liveSince = new Date(
    Date.now() - MAX_LIVE_SESSION_HOURS * 60 * 60 * 1000
  ).toISOString()

  const { data, error } = await supabaseAdmin
    .from('booking_device_slots')
    .select(
      `device_id,
       bookings!inner(id, booking_number, customer_name, status, checked_in_at)`
    )
    .eq('bookings.status', 'checked_in')
    .gte('bookings.checked_in_at', liveSince)

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
