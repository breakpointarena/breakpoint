import {
  deviceCharge,
  extraPlayersCharge,
  perExtraPlayerCharge,
  round2,
} from '@/lib/payments/money'
import {
  arenaClockTime,
  arenaDate,
  daysBetweenDates,
  formatClockTime12h,
} from '@/lib/utils/dates'

/**
 * Pricing for a walk-in session, from the time actually played.
 *
 * A fixed booking knows its price before anybody sits down: the duration was
 * chosen from a list of half-hour blocks and multiplied by the rate. A walk-in
 * session has no chosen duration at all - it is worth whatever the gap between
 * check-in and checkout turns out to be, so the arithmetic happens once, at
 * checkout, from two timestamps the database generated.
 *
 * The rate and the rounding are the existing ones: whole rupees for the station,
 * and each extra player's share rounded before they are added up. Only the
 * duration is new, and it is billed to the exact minute rather than rounded up to
 * the next half hour - 2h45m is charged as 2.75 hours.
 */

/** The station is held for this long from check-in while play is in progress. */
export const PROVISIONAL_SESSION_HOURS = 5

/**
 * How long after check-in a session is still believed to be live.
 *
 * `checked_in` alone is not enough. Production currently holds eighteen bookings
 * left in that state, the oldest checked in fifty-one days ago - a checkout that
 * never happened, not somebody still playing. Trusting the flag on its own pins
 * the station to "occupied" permanently and counts a phantom active session
 * forever.
 *
 * Twice the provisional block a walk-in claims at check-in: long enough that no
 * real session is ever cut short by it, short enough that a forgotten checkout
 * frees the station by the next day rather than never.
 */
export const MAX_LIVE_SESSION_HOURS = 12

/** Nothing is ever billed as a zero-length session. */
export const MIN_BILLABLE_MINUTES = 1

export interface SessionWindow {
  startedAt: Date
  endedAt: Date
}

export interface SessionPricingInput {
  playedMinutes: number
  hourlyRate: number
  playerCount: number
  includedPlayers: number
  extraPlayerCharge: number
}

export interface SessionPricing {
  playedMinutes: number
  durationHours: number
  deviceCharges: number
  extraPlayersCount: number
  /** What one extra player cost for this session, so the receipt line multiplies. */
  perExtraPlayer: number
  extraPlayersTotal: number
  deviceSubtotal: number
}

/**
 * Whole minutes between the two ends of a session, rounded up.
 *
 * Rounded up so a customer who played for forty seconds is billed for a minute
 * rather than nothing, and clamped so a clock that goes backwards between the two
 * stamps cannot produce a negative bill.
 */
export function playedMinutes(window: SessionWindow): number {
  const ms = window.endedAt.getTime() - window.startedAt.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return MIN_BILLABLE_MINUTES
  return Math.max(MIN_BILLABLE_MINUTES, Math.ceil(ms / 60000))
}

/**
 * What the session comes to.
 *
 * `durationHours` is kept unrounded for the arithmetic and only rounded to two
 * places for storage, so a 2h45m session prices off 2.75 exactly rather than off
 * whatever the stored column happened to keep.
 */
export function priceSession(input: SessionPricingInput): SessionPricing {
  const minutes = Math.max(MIN_BILLABLE_MINUTES, Math.trunc(input.playedMinutes) || 0)
  const hours = minutes / 60

  const extraPlayersCount = Math.max(0, input.playerCount - input.includedPlayers)
  const deviceCharges = deviceCharge(input.hourlyRate, hours)
  const perExtraPlayer = perExtraPlayerCharge(input.extraPlayerCharge, hours)
  const extraPlayersTotal = extraPlayersCharge(
    extraPlayersCount,
    input.extraPlayerCharge,
    hours
  )

  return {
    playedMinutes: minutes,
    durationHours: round2(hours),
    deviceCharges,
    extraPlayersCount,
    perExtraPlayer,
    extraPlayersTotal,
    deviceSubtotal: round2(deviceCharges + extraPlayersTotal),
  }
}

export interface SessionTimes {
  /** Formatted check-in time, or null while the customer is still expected. */
  checkedInAt: string | null
  /** Formatted checkout time, or null while play is in progress. */
  completedAt: string | null
}

/**
 * The times to show for a booking in a list.
 *
 * A fixed booking has a slot with both ends known from the moment it is taken, so
 * it reads as a range. A session does not: before check-in it has no times at all,
 * and while it is being played the only real time is when it started - the end
 * stored on its slot row is the provisional block held to keep the station busy,
 * and printing that as a range would tell staff the customer is leaving at a time
 * nobody has decided. Only after checkout is there a genuine second time to show.
 *
 * Returns null when the caller should fall back to the slot range it already has.
 */
export function sessionTimes(booking: {
  billed_on_actual_time?: boolean | null
  status?: string | null
  checked_in_at?: string | null
  completed_at?: string | null
}): SessionTimes | null {
  if (!booking.billed_on_actual_time) return null

  const at = (value: string) => formatClockTime12h(value)

  return {
    checkedInAt: booking.checked_in_at ? at(booking.checked_in_at) : null,
    completedAt: booking.completed_at ? at(booking.completed_at) : null,
  }
}

/** "2h 45m", or "45m" when it did not reach an hour. Used on the admin screens. */
export function formatPlayedDuration(minutes: number): string {
  const safe = Math.max(0, Math.trunc(minutes) || 0)
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

/**
 * The arena clock time of a `Date`, as Postgres stores it in `slot_start_time`.
 *
 * A session that runs past midnight keeps a start later than its end, which is
 * exactly the shape every availability check already unwraps.
 *
 * These both used `getHours()`/`getDate()`, which read the *host's* zone. That
 * is IST on a developer's laptop and UTC on Vercel, so checkout in production
 * rewrote the slot row 5.5 hours behind the session that had just happened -
 * and for anyone checking out between midnight and 05:30 IST, filed it under
 * the previous day. Check-in never had the bug: it happens in SQL, which was
 * already converting to Asia/Kolkata. Only checkout, which runs here, undid it.
 */
export function toClockTime(value: Date): string {
  return arenaClockTime(value)
}

/** The arena calendar date of a `Date`, as Postgres stores it in `slot_date`. */
export function toSlotDate(value: Date): string {
  return arenaDate(value)
}

/**
 * How far back a session's start may be moved by hand.
 *
 * Manual entry exists for the customer who has already been playing for twenty
 * minutes before anybody typed them in, not for reconstructing yesterday. The
 * ceiling matters more than it looks: the clock face has no AM/PM of its own, so
 * a slip on that one select moves the start by twelve hours and the bill with
 * it. Anything further back than this is refused rather than billed.
 *
 * Half of `MAX_LIVE_SESSION_HOURS`, and tied to it rather than picked: a session
 * older than that window is one the dashboard, `lib/devices/occupancy.ts` and the
 * attention list have all stopped counting as live. Allowing a backdate right up
 * to it would let the desk create a session that is stale the moment it exists -
 * a customer sitting at a station the floor plan says is free. Halving leaves any
 * session started at the ceiling another six hours of ordinary life ahead of it,
 * which is far more than the few minutes this feature is really for.
 */
export const MAX_BACKDATED_START_HOURS = MAX_LIVE_SESSION_HOURS / 2

export interface BackdatedStart {
  /** 24-hour `HH:MM`, which is what the database resolves against its own day. */
  clock: string
  /** How long before now that reading was, on the arena clock. */
  minutesAgo: number
}

export type BackdatedStartResult =
  | { ok: true; start: BackdatedStart }
  | { ok: false; error: string }

/**
 * A hand-entered start time, read against the arena clock.
 *
 * Only a time of day is entered - there is no date on the field, because staff
 * are recording something that happened during this shift, not picking a day.
 * That leaves one genuine ambiguity, and it is the one that matters at a venue
 * open past midnight: at 00:30, "11:45 PM" is forty-five minutes ago, not
 * twenty-three hours away. So a reading later in the day than right now is taken
 * as last night rather than as the future, which is the only interpretation
 * under which it can already have happened.
 *
 * The same rule turns a fat-fingered future time into something roughly a day
 * old, which the ceiling then refuses - so "not in the past" needs no separate
 * test, and midnight keeps working.
 *
 * Compared minute-of-day against `arenaClockTime` rather than by building a
 * `Date`: the host is IST on a laptop here and UTC on Vercel, and the arena is
 * neither by accident. This asks the clock the arena actually runs on.
 */
export function resolveBackdatedStart(
  clock24: string,
  now: Date = new Date()
): BackdatedStartResult {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec((clock24 ?? '').trim())
  if (!match) {
    return { ok: false, error: 'Enter the time the customer started playing.' }
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23) {
    return { ok: false, error: 'Enter the time the customer started playing.' }
  }

  const entered = hour * 60 + minute

  const [nowHour, nowMinute] = arenaClockTime(now).split(':').map(Number)
  const current = nowHour * 60 + nowMinute

  // Later in the day than now means it has not happened yet today, so it was
  // last night. Same arithmetic wraps a mistyped future time to ~24h old.
  const minutesAgo = entered <= current ? current - entered : current - entered + 1440

  if (minutesAgo > MAX_BACKDATED_START_HOURS * 60) {
    return {
      ok: false,
      error:
        `A start time has to be within the last ${MAX_BACKDATED_START_HOURS} hours. ` +
        `Check the AM/PM.`,
    }
  }

  return {
    ok: true,
    start: {
      clock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      minutesAgo,
    },
  }
}

/** Minutes in a day, for expressing a window against a slot date's timeline. */
const MINUTES_PER_DAY = 24 * 60

/**
 * When a live walk-in stops holding its station, on a slot date's timeline.
 *
 * A session has no end until somebody checks it out, but the slot row carries
 * the `PROVISIONAL_SESSION_HOURS` placeholder claimed at check-in. Reading that
 * as the end is what let a station be sold out from under a customer still
 * sitting at it: `lib/devices/occupancy.ts` calls the session live for
 * `MAX_LIVE_SESSION_HOURS`, while the overlap test called it finished after five,
 * so between those two hours the floor plan and the booking flow disagreed.
 *
 * Returns minutes from midnight of `slotDate`, the same timeline
 * `fetchOccupiedRanges` normalises every other window onto - so a session
 * running past midnight comes back above 1440, and one that started yesterday
 * can come back low or negative. Callers take the later of this and the row's
 * own end, so this can only ever lengthen an occupancy.
 *
 * Null for anything that is not a session in progress: a fixed booking has a
 * real end on its row and must keep it, or a customer overrunning their hour
 * would block the booking sold for the hour after it.
 */
export function liveSessionEndMinutes(
  session: {
    billedOnActualTime?: boolean | null
    status?: string | null
    checkedInAt?: string | null
  },
  slotDate: string
): number | null {
  if (!session.billedOnActualTime) return null
  if (session.status !== 'checked_in') return null
  if (!session.checkedInAt) return null

  const startedAt = new Date(session.checkedInAt)
  if (Number.isNaN(startedAt.getTime())) return null

  const liveUntil = new Date(startedAt.getTime() + MAX_LIVE_SESSION_HOURS * 60 * 60 * 1000)

  // Which day the cap lands on, counted between two arena calendar dates so no
  // host offset can move it - the same reason `arenaDate` exists at all.
  const dayOffset = daysBetweenDates(slotDate, arenaDate(liveUntil))
  if (dayOffset === null) return null

  const [hours, minutes] = arenaClockTime(liveUntil).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null

  return dayOffset * MINUTES_PER_DAY + hours * 60 + minutes
}
