import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/server'
import { shiftDate } from '@/lib/payments/availability'
import {
  occupiedRangeFor,
  type DeviceTypeOccupancy,
  type OccupiedRange
} from '@/lib/bookings/slotAvailability'

const ACTIVE_STATUSES = ['locked', 'confirmed', 'checked_in']

interface SlotRow {
  booking_id: string
  device_id: string
  slot_date: string
  slot_start_time: string
  slot_end_time: string
  bookings: {
    status: string
    lock_expires_at: string | null
    /** True for a walk-in session, whose slot end may be a placeholder. */
    billed_on_actual_time: boolean | null
    checked_in_at: string | null
    /** Set only when the customer named a finish; then it is not a placeholder. */
    walk_in_planned_end: string | null
  }
}

/**
 * Everything the slot picker needs about one device type on one date: how many
 * stations exist, and when each of them is busy.
 *
 * Deliberately duration-agnostic. Which half hours are on offer depends on how
 * long the customer wants, but none of the data here does - so callers fetch
 * this once and run `availableStartMinutes` for whatever duration they are
 * asked about. That is what lets the picker answer a duration change without
 * going back to the network.
 */
export async function fetchDeviceTypeOccupancy(
  deviceTypeId: string,
  dateString: string,
  /**
   * A hold belonging to the customer doing the browsing. Their own reservation
   * would otherwise show up as somebody else's booking, so the slot they are
   * holding would look unavailable to the one person entitled to it.
   */
  excludeBookingId?: string | null
): Promise<DeviceTypeOccupancy> {
  // The neighbouring days are in range because bookings cross midnight: an
  // overnight booking made yesterday still holds the early hours of
  // `dateString`, and a request starting late lands on tomorrow. This is the
  // same window `assign_device_slot` checks when it claims the station.
  const dayBefore = shiftDate(dateString, -1)
  const dayAfter = shiftDate(dateString, 1)

  // The two queries do not depend on each other, so they go together. Awaited
  // one after the other they cost two full round trips to the database, which
  // is the dominant cost of this call whenever Supabase is not in the same
  // region as the code running it.
  const [deviceCount, slots] = await Promise.all([
    supabaseAdmin
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('device_type_id', deviceTypeId)
      .eq('status', 'available'),
    supabaseAdmin
      .from('booking_device_slots')
      .select(
        `
        booking_id,
        device_id,
        slot_start_time,
        slot_end_time,
        slot_date,
        device:devices!inner(device_type_id, status),
        bookings!inner(
          status,
          lock_expires_at,
          billed_on_actual_time,
          checked_in_at,
          walk_in_planned_end
        )
      `
      )
      .eq('device.device_type_id', deviceTypeId)
      // Stations out of service are not in the count above, so their bookings
      // must not count against it either.
      .eq('device.status', 'available')
      .in('slot_date', [dayBefore, dateString, dayAfter])
      .in('bookings.status', ACTIVE_STATUSES)
  ])

  if (deviceCount.error) throw deviceCount.error
  if (slots.error) throw slots.error

  const totalDevices = deviceCount.count || 0
  if (totalDevices === 0) return { totalDevices: 0, occupied: [] }

  const now = new Date()
  const deviceIndex = new Map<string, number>()
  const occupied: OccupiedRange[] = []

  for (const row of (slots.data || []) as unknown as SlotRow[]) {
    // The browser's own hold is not competition for the browser.
    if (excludeBookingId && row.booking_id === excludeBookingId) continue

    const booking = row.bookings

    /**
     * The window is worked out by `occupiedRangeFor`, which the desk's own
     * checks use as well.
     *
     * This module used to do the arithmetic itself and, in doing so, never had
     * the live-session rule `lib/payments/availability.ts` was given in
     * `20260826130000` - so between the fifth and twelfth hour of an open-ended
     * walk-in the picker offered a station `assign_device_slot` would then
     * refuse, and the customer's slot failed under them at payment.
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
      dateString,
      now
    )
    if (!range) continue

    let index = deviceIndex.get(row.device_id)
    if (index === undefined) {
      index = deviceIndex.size
      deviceIndex.set(row.device_id, index)
    }

    occupied.push({ device: index, start: range.start, end: range.end })
  }

  return { totalDevices, occupied }
}
