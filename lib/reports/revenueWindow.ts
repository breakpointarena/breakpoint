/**
 * Which rows the revenue figures have to read, and how far back to ask for them.
 *
 * The dashboard's revenue tiles are windowed - today, and the last seven days -
 * but the queries behind them used to be unbounded: every settled booking in the
 * arena's history was fetched on every dashboard load so that a loop could throw
 * almost all of it away. That cost grows forever.
 *
 * Bounding it is not as simple as filtering on `created_at`, because a booking
 * is not necessarily settled on the day it is made. The date a booking counts on
 * is the one in `effectivePaidAt` below, and for a booking paid through a payment
 * group that date lives on a different table entirely.
 */

/**
 * The date a booking's money counts on.
 *
 * `payment_groups.paid_at` first: a group settles several bookings at once, and
 * when it settled is when the arena was actually paid. `updated_at` is the
 * fallback for a booking with no group, which today is all of them.
 *
 * `created_at` is kept as a last resort only because the code this replaced had
 * it. `bookings.updated_at` is NOT NULL, so the leg is unreachable for a booking
 * row - it costs nothing to keep and removing it would be a behaviour change
 * dressed up as a tidy-up.
 */
export function effectivePaidAt(booking: {
  payment_groups?: { paid_at?: string | null } | null
  updated_at?: string | null
  created_at?: string | null
}): string | null {
  return booking.payment_groups?.paid_at || booking.updated_at || booking.created_at || null
}

/**
 * How many days of slack sit between the window the caller reads and the window
 * the database is asked for.
 *
 * The reducers compare `paidAt.split("T")[0]` - the UTC calendar date of the
 * timestamp - against an arena (IST) date string. Those two disagree by up to
 * five and a half hours at the boundary, so a bound placed exactly on the
 * arena date could drop a row the reducer would have counted. Two whole days is
 * far more than the discrepancy can ever be, and over-fetching by two days is
 * free: the reducer still decides what counts, so the slack can only add rows
 * that are then filtered out.
 */
export const REVENUE_WINDOW_SLACK_DAYS = 2

/**
 * The timestamp to bound a revenue query on, given the furthest-back arena date
 * the caller intends to report on.
 *
 * Returns an instant, not a date: `gte` on a `timestamptz` column wants one, and
 * midnight UTC on the slack date is unambiguously earlier than any instant whose
 * UTC date is on or after the caller's date.
 */
export function revenueWindowStart(earliestArenaDate: string): string {
  const [year, month, day] = earliestArenaDate.split('-').map(Number)
  const start = Date.UTC(year, month - 1, day) - REVENUE_WINDOW_SLACK_DAYS * 24 * 60 * 60 * 1000
  return new Date(start).toISOString()
}

/**
 * The two bounded reads folded back into one set.
 *
 * A booking qualifies for the window in one of two ways - its own `updated_at`
 * is recent, or the group that settled it was paid recently - and no single
 * PostgREST filter expresses both. So they are fetched separately and merged
 * here. The two overlap whenever a booking was both settled and touched inside
 * the window, which is the common case, so the merge is keyed on the row id.
 */
export function mergeBookingRows<T extends { id: string }>(
  ...groups: (T[] | null | undefined)[]
): T[] {
  const byId = new Map<string, T>()
  for (const group of groups) {
    for (const row of group || []) byId.set(row.id, row)
  }
  return Array.from(byId.values())
}
