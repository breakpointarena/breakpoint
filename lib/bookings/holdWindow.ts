/**
 * Does a hold cover the window being paid for?
 *
 * Kept apart from the rest of the hold code, which builds a Supabase client at
 * module load, so this rule can be asserted directly - see
 * scripts/verify-slot-hold.ts.
 */

export interface HeldSlotRow {
  slot_date: string
  slot_start_time: string
  slot_end_time: string
}

export interface RequestedWindow {
  slotDate: string
  slotStartTime24: string
  slotEndTime24: string
}

/**
 * The end time is compared as well as the start, not just for tidiness: a hold on
 * 10:00-10:30 reserved half an hour of that station and nothing more. Honouring it
 * for a 10:00-15:00 booking would hand over four and a half hours that were never
 * claimed under the assignment lock. A mismatch is not an error - it means this
 * booking has no usable hold, and fulfilment falls back to claiming a station
 * outright, which re-checks the whole window atomically.
 */
export function slotRowCoversWindow(
  row: HeldSlotRow | undefined,
  requested: RequestedWindow
): boolean {
  if (!row) return false

  // Postgres returns TIME as HH:MM:SS; compare on hours and minutes only.
  const sameMinute = (a: string, b: string) => a.slice(0, 5) === b.slice(0, 5)

  return (
    row.slot_date === requested.slotDate &&
    sameMinute(row.slot_start_time, requested.slotStartTime24) &&
    sameMinute(row.slot_end_time, requested.slotEndTime24)
  )
}
