import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/server'
import { shiftDate, timeToMinutes } from '@/lib/payments/availability'
import {
  MINUTES_PER_DAY,
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
  bookings: { status: string; lock_expires_at: string | null }
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
        bookings!inner(status, lock_expires_at)
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

  const now = Date.now()
  const deviceIndex = new Map<string, number>()
  const occupied: OccupiedRange[] = []

  for (const row of (slots.data || []) as unknown as SlotRow[]) {
    // The browser's own hold is not competition for the browser.
    if (excludeBookingId && row.booking_id === excludeBookingId) continue

    const booking = row.bookings
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

    // An end at or before its start has wrapped past midnight; unwrap it so the
    // range stays contiguous, then rebase the neighbouring days onto this
    // date's timeline.
    if (end <= start) end += MINUTES_PER_DAY

    if (row.slot_date === dayBefore) {
      start -= MINUTES_PER_DAY
      end -= MINUTES_PER_DAY
    } else if (row.slot_date === dayAfter) {
      start += MINUTES_PER_DAY
      end += MINUTES_PER_DAY
    }

    // Yesterday's bookings that finished before midnight cannot touch today.
    if (end <= 0) continue

    let index = deviceIndex.get(row.device_id)
    if (index === undefined) {
      index = deviceIndex.size
      deviceIndex.set(row.device_id, index)
    }

    occupied.push({ device: index, start, end })
  }

  return { totalDevices, occupied }
}
