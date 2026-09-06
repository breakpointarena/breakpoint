import { arenaClockTime, arenaToday } from '@/lib/utils/dates'
import { formatDbTime } from '@/lib/utils/timeSlots'
import { MAX_LIVE_SESSION_HOURS } from '@/lib/bookings/walkInSession'

/**
 * Bookings that stopped part-way through and need somebody to finish them.
 *
 * The arena's booking flow assumes each row walks from `confirmed` to
 * `checked_in` to `completed`, with the money collected somewhere along the way.
 * Rows that fall out of that sequence do not error and do not disappear - they
 * just sit in the list looking like every other booking. Production is currently
 * holding eighteen sessions checked in and never checked out, the oldest fifty-one
 * days old, which nothing on any screen was saying out loud.
 *
 * These are reported, never auto-corrected. A session left open might be a
 * forgotten checkout or might be a customer who walked out without paying, and
 * those want different responses from whoever is at the counter.
 */

export type BookingAttentionKind =
  | 'never_checked_out'
  | 'no_show'
  | 'unpaid'
  | 'starting_soon'
  | 'ending_soon'
  | 'overrunning'
  | 'refund_due'
  | 'refunded'

export type BookingAttention = {
  kind: BookingAttentionKind
  /** Short enough for a badge. */
  label: string
  /** One line explaining what happened, for a tooltip or the detail view. */
  detail: string
  /**
   * `info` is not a warning at all - it is a job somebody has already done,
   * shown so nobody does it twice.
   */
  severity: 'high' | 'medium' | 'info'
}

type AttentionInput = {
  status?: string | null
  payment_status?: string | null
  checked_in_at?: string | null
  completed_at?: string | null
  total_amount?: number | string | null
  amount_paid?: number | string | null
  /** True for a walk-in session, which is billed on what it turns out to be. */
  billed_on_actual_time?: boolean | null
  booking_device_slots?: Array<{
    slot_date?: string | null
    slot_start_time?: string | null
    slot_end_time?: string | null
  }> | null
}

const HOURS = 60 * 60 * 1000

/** Whole rupees where it is whole, paise where it is not. */
function formatMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return `₹${rounded.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

/** `HH:MM:SS`, dropping any fractional seconds Postgres hands back. */
function clockOnly(time: string): string {
  return time.slice(0, 8)
}

/**
 * When a slot finishes, as `YYYY-MM-DD HH:MM:SS` on the arena's clock.
 *
 * A session booked across midnight ends on the following date - the end time
 * being earlier than the start is exactly how those rows are stored, and
 * comparing the two directly would place the end nearly a full day too early.
 */
function slotEndsAt(slot: {
  slot_date?: string | null
  slot_start_time?: string | null
  slot_end_time?: string | null
}): string | null {
  if (!slot.slot_date || !slot.slot_end_time) return null

  const end = clockOnly(slot.slot_end_time)
  const start = slot.slot_start_time ? clockOnly(slot.slot_start_time) : null

  let date = slot.slot_date
  if (start && end < start) {
    // UTC end to end on purpose: this is calendar arithmetic on a date-only
    // string, never on an instant, so no zone is involved and none should be.
    const next = new Date(`${slot.slot_date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    date = next.toISOString().slice(0, 10) // arena-clock-ok
  }

  return `${date} ${end}`
}

/**
 * When a slot begins, as `YYYY-MM-DD HH:MM:SS` on the arena's clock.
 *
 * No midnight correction is needed here and none is wanted: `slot_date` is the
 * day the slot starts on, which is exactly what `slot_start_time` belongs to.
 * Only the *end* can land on the following day, which is what `slotEndsAt`
 * above is for.
 */
function slotStartsAt(slot: {
  slot_date?: string | null
  slot_start_time?: string | null
}): string | null {
  if (!slot.slot_date || !slot.slot_start_time) return null

  return `${slot.slot_date} ${clockOnly(slot.slot_start_time)}`
}

function toAmount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * How long before a slot ends the desk should hear about it.
 *
 * Short enough that the warning still means "now" rather than "at some point" -
 * a quarter of an hour of standing warning is something staff learn to scroll
 * past.
 */
export const ENDING_SOON_MINUTES = 5

/**
 * How long before a booking is due to start the desk should hear about it.
 *
 * Matches the ending window, so the two halves of a session announce themselves
 * on the same terms and staff only have one interval to hold in their head.
 */
export const STARTING_SOON_MINUTES = 5

/**
 * `YYYY-MM-DD HH:MM:SS` on the arena clock, as a comparable number.
 *
 * Read as UTC on purpose: both sides of every comparison here are arena
 * wall-clock readings, so the zone cancels out and no instant is ever implied.
 * Building a real `Date` from one of these would invite the host's offset in.
 */
function stampToMinutes(stamp: string): number | null {
  const parts = stamp.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!parts) return null

  return (
    Date.UTC(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +parts[6]) / 60000
  )
}

/** "45m", "1h 05m" - short enough to sit in a badge. */
export function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export type SessionTimeStatus =
  | { kind: 'starting_soon'; minutesUntilStart: number; startsAtClock: string }
  | { kind: 'ending_soon'; minutesLeft: number; endsAtClock: string }
  | { kind: 'overrunning'; minutesOver: number; endsAtClock: string }
  | null

/**
 * Where a booking sits against the times it sold: about to start, about to
 * finish, or already past its end.
 *
 * Split out from the flags below because two callers need the same judgement for
 * different reasons: the badges want something to render, and the notification
 * poller wants to know *when* the booking crossed each line, so it can tell a
 * customer who has just run over from one who ran over an hour ago.
 *
 * A walk-in session is deliberately never flagged. It has no time to run out of
 * - it is billed on whatever it turns out to be, and the provisional block it
 * claims at check-in reserves the station rather than promising an end. Marking
 * those would put a red badge on every long and perfectly ordinary session.
 * A walk-in left open far too long is already caught by `never_checked_out`.
 * It has no start to announce either: a walk-in has no slot at all until the
 * customer sits down, so it falls out of both halves below on its own.
 */
export function sessionTimeStatus(
  booking: AttentionInput,
  now: Date = new Date()
): SessionTimeStatus {
  const status = String(booking.status ?? '').toLowerCase()
  if (status !== 'checked_in' && status !== 'confirmed') return null
  if (booking.billed_on_actual_time) return null

  const nowMinutes = stampToMinutes(`${arenaToday(now)} ${arenaClockTime(now)}`)
  if (nowMinutes === null) return null

  /**
   * Booked, due shortly, and nobody has arrived yet.
   *
   * The *first* slot is when the customer is expected, in the same way the last
   * one is when they are finished. Only announced while the start is still
   * ahead: once it has passed, the booking is either checked in - and answered
   * by the ending rules below - or it is late, which is `no_show`'s business.
   */
  if (status === 'confirmed') {
    const firstStart = (booking.booking_device_slots || [])
      .map(slotStartsAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(0)

    if (!firstStart) return null

    const startMinutes = stampToMinutes(firstStart)
    if (startMinutes === null) return null

    const minutesUntilStart = Math.round(startMinutes - nowMinutes)

    if (minutesUntilStart > 0 && minutesUntilStart <= STARTING_SOON_MINUTES) {
      return {
        kind: 'starting_soon',
        minutesUntilStart,
        startsAtClock: formatDbTime(firstStart.slice(11)),
      }
    }

    return null
  }

  // The last slot to finish is when the booking is actually over; an earlier one
  // ending is not the customer's time running out.
  const lastEnd = (booking.booking_device_slots || [])
    .map(slotEndsAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1)

  if (!lastEnd) return null

  const endMinutes = stampToMinutes(lastEnd)
  if (endMinutes === null) return null

  const minutesLeft = Math.round(endMinutes - nowMinutes)
  // The comparison above runs on the 24-hour stamp; only what staff read is
  // turned into a clock reading.
  const endsAtClock = formatDbTime(lastEnd.slice(11))

  if (minutesLeft <= 0) {
    return { kind: 'overrunning', minutesOver: -minutesLeft, endsAtClock }
  }

  if (minutesLeft <= ENDING_SOON_MINUTES) {
    return { kind: 'ending_soon', minutesLeft, endsAtClock }
  }

  return null
}

/**
 * Everything wrong with a booking, worst first.
 *
 * `now` is injectable so this can be tested at a fixed instant rather than
 * whenever the suite happens to run.
 */
export function bookingAttention(
  booking: AttentionInput,
  now: Date = new Date()
): BookingAttention[] {
  const flags: BookingAttention[] = []
  const status = String(booking.status ?? '').toLowerCase()

  /**
   * A cancelled booking has no session left to go wrong, so none of the
   * warnings below apply to it. One thing can still be outstanding: money taken
   * for a session that will not happen. Until it is handed back, that is a job
   * on somebody's desk, and it says so on the row rather than living in a
   * spreadsheet nobody opens.
   */
  if (status === 'cancelled') {
    const collected = toAmount(booking.amount_paid)
    if (collected <= 0) return flags

    if (String(booking.payment_status ?? '').toLowerCase() === 'refunded') {
      flags.push({
        kind: 'refunded',
        label: 'Refunded',
        // No detail: the badge is the whole message, and a tooltip repeating
        // it only gets between staff and the row.
        detail: '',
        severity: 'info',
      })
      return flags
    }

    flags.push({
      kind: 'refund_due',
      label: `Refund ${formatMoney(collected)}`,
      detail: '',
      severity: 'high',
    })
    return flags
  }

  const total = toAmount(booking.total_amount)
  const paid = toAmount(booking.amount_paid)
  const balance = total - paid

  // 1. Checked in and never checked out.
  let neverCheckedOut = false

  if (status === 'checked_in' && booking.checked_in_at) {
    const openFor = now.getTime() - new Date(booking.checked_in_at).getTime()
    if (openFor > MAX_LIVE_SESSION_HOURS * HOURS) {
      const days = Math.floor(openFor / (24 * HOURS))
      const hours = Math.floor(openFor / HOURS)
      neverCheckedOut = true
      flags.push({
        kind: 'never_checked_out',
        label: 'Never checked out',
        detail:
          days >= 1
            ? `Checked in ${days} day${days > 1 ? 's' : ''} ago and still open. The station reads as free; close the session to bill it.`
            : `Checked in ${hours} hours ago and still open. Close the session to bill it.`,
        severity: 'high',
      })
    }
  }

  // 1b. Due to start shortly, or being played right now against the clock it
  // was sold.
  //
  // Skipped once `never_checked_out` has fired: a session left open since
  // Tuesday is also, trivially, past its end time, and saying both only buries
  // the one that means something.
  if (!neverCheckedOut) {
    const timing = sessionTimeStatus(booking, now)

    if (timing?.kind === 'starting_soon') {
      flags.push({
        kind: 'starting_soon',
        label: `Starts ${timing.startsAtClock}`,
        detail: `This booking starts at ${timing.startsAtClock}, in ${timing.minutesUntilStart} minute${
          timing.minutesUntilStart === 1 ? '' : 's'
        }. Check the customer in when they arrive.`,
        severity: 'medium',
      })
    } else if (timing?.kind === 'overrunning') {
      flags.push({
        kind: 'overrunning',
        label: `Over by ${formatGap(timing.minutesOver)}`,
        detail: `The slot ended at ${timing.endsAtClock} and the customer is still on the station. Check them out, or extend the booking if they are staying on.`,
        severity: 'high',
      })
    } else if (timing?.kind === 'ending_soon') {
      flags.push({
        kind: 'ending_soon',
        label: `Ends ${timing.endsAtClock}`,
        detail: `This session ends at ${timing.endsAtClock}, in ${timing.minutesLeft} minute${
          timing.minutesLeft === 1 ? '' : 's'
        }.`,
        severity: 'medium',
      })
    }
  }

  // 2. Confirmed, slot finished, nobody ever arrived.
  if (status === 'confirmed') {
    const nowStamp = `${arenaToday(now)} ${arenaClockTime(now)}`
    const ends = (booking.booking_device_slots || [])
      .map(slotEndsAt)
      .filter((value): value is string => value !== null)

    // The last slot to finish is the one that decides whether the whole booking
    // has been missed; an early slot ending is not a no-show on its own.
    const lastEnd = ends.sort().at(-1)

    if (lastEnd && lastEnd < nowStamp) {
      flags.push({
        kind: 'no_show',
        label: 'Never checked in',
        detail: 'The slot has finished and this booking was never checked in. Mark it as a no-show or cancel it.',
      severity: 'medium',
      })
    }
  }

  // 3. The station was used and there is still money owed.
  //
  // Skips a walk-in mid-session on purpose: its total is zero until checkout
  // prices it, so every live walk-in would otherwise read as unpaid.
  if ((status === 'checked_in' || status === 'completed') && total > 0 && balance > 0) {
    flags.push({
      kind: 'unpaid',
      label: status === 'completed' ? 'Left unpaid' : 'Payment due',
      detail:
        status === 'completed'
          ? `This session is closed with ₹${balance.toFixed(2)} still outstanding.`
          : `₹${balance.toFixed(2)} outstanding on a session still in progress.`,
      severity: status === 'completed' ? 'high' : 'medium',
    })
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
}

/** True when anything on the booking wants a member of staff to look at it. */
export function needsAttention(booking: AttentionInput, now?: Date): boolean {
  return bookingAttention(booking, now).length > 0
}
