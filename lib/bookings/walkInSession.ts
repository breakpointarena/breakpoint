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
import { formatDbTime } from '@/lib/utils/timeSlots'

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

/**
 * The block a walk-in claims on its station at check-in, before anybody knows
 * how long they will stay.
 *
 * Two hours, not five. Five was generous enough that a customer who played
 * forty minutes and left kept their station off the board for the rest of the
 * evening unless somebody remembered to check them out - and on a floor of
 * eight devices that is an eighth of the arena, sold to nobody.
 *
 * Shortening it is safe because it is not what protects a live session. A
 * customer still playing at the two hour mark keeps their station: occupancy
 * holds anything checked in and not checked out for `MAX_LIVE_SESSION_HOURS`,
 * whatever this row happens to say. That is what 20260826130000 exists for, and
 * it is the reason this number can be sized for the common session rather than
 * the longest imaginable one.
 *
 * A customer who says how long they want is better served than either: naming a
 * finish holds the station for exactly that, and frees the hours after it.
 */
export const PROVISIONAL_SESSION_HOURS = 2

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
  /**
   * Formatted finish the customer named at check-in, while the session is still
   * running. Null once they check out, because then there is a real second time
   * to show and an expectation is no longer worth the room.
   */
  plannedEndAt: string | null
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
  walk_in_planned_end?: string | null
}): SessionTimes | null {
  if (!booking.billed_on_actual_time) return null

  const at = (value: string) => formatClockTime12h(value)

  return {
    checkedInAt: booking.checked_in_at ? at(booking.checked_in_at) : null,
    completedAt: booking.completed_at ? at(booking.completed_at) : null,
    // Dropped the moment a real checkout exists: the two would sit next to each
    // other saying different things, and only one of them is what was billed.
    plannedEndAt:
      !booking.completed_at && booking.walk_in_planned_end
        ? at(booking.walk_in_planned_end)
        : null,
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
  const entered = minuteOfDay(clock24)
  if (entered === null) {
    return { ok: false, error: 'Enter the time the customer started playing.' }
  }

  const minutesAgo = minutesSince(entered, now)

  if (minutesAgo > MAX_BACKDATED_START_HOURS * 60) {
    return {
      ok: false,
      error:
        `A start time has to be within the last ${MAX_BACKDATED_START_HOURS} hours. ` +
        `Check the AM/PM.`,
    }
  }

  return { ok: true, start: { clock: clockOf(entered), minutesAgo } }
}

/** The minute of the day a 24-hour `HH:MM` names, or null if it is not one. */
function minuteOfDay(clock24: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec((clock24 ?? '').trim())
  if (!match) return null

  const hour = Number(match[1])
  if (hour > 23) return null

  return hour * 60 + Number(match[2])
}

/**
 * The inverse, padded: 545 -> "09:05".
 *
 * Padded because the same string is both what Postgres is handed as a TIME and
 * what is echoed back to the desk, and "9:05" reads like a half-typed field.
 */
function clockOf(minutes: number): string {
  const wrapped = ((Math.trunc(minutes) % 1440) + 1440) % 1440
  const hour = Math.floor(wrapped / 60)
  return `${String(hour).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** The minute of the day the arena clock has reached. */
function arenaMinuteOfDay(now: Date): number {
  const [hour, minute] = arenaClockTime(now).split(':').map(Number)
  return hour * 60 + minute
}

/**
 * How long before `now` a reading of the arena clock was.
 *
 * Later in the day than now means it has not happened yet today, so it was last
 * night. The same arithmetic wraps a mistyped future time to ~24h old, which is
 * what the ceiling above then refuses.
 */
function minutesSince(entered: number, now: Date): number {
  const current = arenaMinuteOfDay(now)
  return entered <= current ? current - entered : current - entered + 1440
}

/**
 * How long a walk-in may be held for from its start.
 *
 * The same number as `MAX_LIVE_SESSION_HOURS`, and tied to it rather than picked:
 * a planned end beyond the live window claims time the dashboard,
 * `lib/devices/occupancy.ts` and the attention list have already stopped
 * believing in, so the hold would outlast everything that reads it. It is also
 * the AM/PM catch on this field - twelve hours is exactly the size of that slip,
 * so "9:00 AM" typed for a 9:00 PM finish lands the far side of the ceiling.
 */
export const MAX_PLANNED_SESSION_HOURS = MAX_LIVE_SESSION_HOURS

export interface PlannedSession {
  start: BackdatedStart
  /** The planned finish: a clock reading and how far ahead of now it is. */
  end: { clock: string; minutesAhead: number }
  /** Start to planned end, which is the window the station is held for. */
  plannedMinutes: number
}

export type PlannedSessionResult =
  | { ok: true; session: PlannedSession }
  | { ok: false; error: string }

/**
 * When the customer says they are leaving.
 *
 * A walk-in has no chosen duration - that is the whole point of billing it on
 * actual time - but the desk often knows roughly when it ends, because the
 * customer just said so. Recorded, that turns the station's five-hour
 * placeholder into the window somebody actually expects, which is what the floor
 * plan and the slot row then show.
 *
 * It changes nothing about the money. The bill is still worked out at checkout
 * from the two real timestamps, so a customer who stays past their planned end
 * pays for the extra and one who leaves early does not pay for the rest. This
 * reading is a statement of intent, not a contract - `PROVISIONAL_SESSION_HOURS`
 * with a better number in it.
 *
 * Read forwards, where the start is read backwards: a reading at or before the
 * start belongs to tomorrow, so a session running 11:50 PM to 12:30 AM needs no
 * date on either field. That wrap is also what catches the AM/PM slip - "9:00
 * AM" for a 9:00 PM finish comes out about twelve hours ahead, which the ceiling
 * refuses - and what makes an end already in the past refuse itself, since it
 * can only be read as tomorrow.
 */
export function resolvePlannedSession(
  /** The session's start, or null when it begins now. */
  startClock24: string | null,
  endClock24: string,
  now: Date = new Date()
): PlannedSessionResult {
  let start: BackdatedStart
  if (startClock24) {
    const resolved = resolveBackdatedStart(startClock24, now)
    if (!resolved.ok) return resolved
    start = resolved.start
  } else {
    // Check-in from the button: the session starts as it is pressed.
    start = { clock: clockOf(arenaMinuteOfDay(now)), minutesAgo: 0 }
  }

  const entered = minuteOfDay(endClock24)
  if (entered === null) {
    return { ok: false, error: 'Enter the time the customer expects to finish.' }
  }

  const current = arenaMinuteOfDay(now)

  // Ahead of now, and at least a minute of it: an end that has already passed is
  // read as tomorrow, which the ceiling below then refuses.
  const minutesAhead = entered > current ? entered - current : entered - current + 1440

  const plannedMinutes = start.minutesAgo + minutesAhead

  if (plannedMinutes > MAX_PLANNED_SESSION_HOURS * 60) {
    return {
      ok: false,
      error:
        `A session cannot be held for more than ${MAX_PLANNED_SESSION_HOURS} hours. ` +
        `If they have already finished, check them out instead - and check the AM/PM.`,
    }
  }

  return {
    ok: true,
    session: {
      start,
      end: { clock: clockOf(entered), minutesAhead },
      plannedMinutes,
    },
  }
}

export interface SessionClaimWindow {
  /** The arena calendar date the claim is filed under, as `slot_date`. */
  slotDate: string
  /** Minutes from midnight of `slotDate`. */
  start: number
  /** Minutes from midnight of `slotDate`, above 1440 when it runs past midnight. */
  end: number
}

/**
 * The window check-in is about to claim, for anything that wants to ask about it
 * before it happens.
 *
 * The walk-in form warns the desk when the floor is full before it writes the
 * booking, and that warning was asking a different question from the one the
 * booking asks: always "is a station free for the next five hours", whatever the
 * desk had actually entered. So a customer starting at seven and leaving at nine
 * was refused on a station with a fixed booking at ten - the pre-flight saw an
 * overlap the claim would never have made - and a backdated start was checked
 * from now rather than from when the customer sat down, which is the overlap
 * that genuinely matters.
 *
 * This is the same arithmetic `checkin_walkin_session` does in SQL, kept here so
 * the two can be read against each other: the block runs from the start, for the
 * planned window if one was named and `PROVISIONAL_SESSION_HOURS` if not, and it
 * is dated by the day the session *starts* - which is not today's date for a
 * session backdated across midnight.
 *
 * Unreadable clocks fall back to the plain "now, for the placeholder" window
 * rather than refusing. This is the warning, not the guard: the form has already
 * said what is wrong with the field, and the claim in SQL is what actually
 * decides.
 */
export function sessionClaimWindow(
  input: { startedClock?: string | null; plannedEndClock?: string | null },
  now: Date = new Date()
): SessionClaimWindow {
  let minutesAgo = 0
  let heldMinutes = PROVISIONAL_SESSION_HOURS * 60

  /**
   * The start stands on its own and the planned end refines it, rather than the
   * two being alternatives.
   *
   * Written as a chain, a planned end that could not be read took the start down
   * with it and this described a five-hour block from *now* - a different window
   * from the one the claim would make, which is the exact failure this function
   * exists to prevent. The form only ever sends a resolved pair, so it was not
   * reachable from the screen; it was still the wrong shape.
   */
  if (input.startedClock) {
    const started = resolveBackdatedStart(input.startedClock, now)
    if (started.ok) minutesAgo = started.start.minutesAgo
  }

  if (input.plannedEndClock) {
    const planned = resolvePlannedSession(input.startedClock ?? null, input.plannedEndClock, now)
    if (planned.ok) {
      minutesAgo = planned.session.start.minutesAgo
      heldMinutes = planned.session.plannedMinutes
    }
  }

  const startedAt = new Date(now.getTime() - minutesAgo * 60_000)
  const start = arenaMinuteOfDay(startedAt)

  return {
    slotDate: arenaDate(startedAt),
    start,
    end: start + heldMinutes,
  }
}

/**
 * A checkout time the desk typed, checked against the session it would close.
 *
 * Checkout used to be the database clock and nothing else, which is right up
 * until it is not: the customer leaves at nine, the desk is busy, and the
 * session is closed at half past eleven. Those two and a half hours are billed
 * to somebody who was not in the building, and there was no way to say so
 * without editing the row by hand.
 *
 * So the time is now stated rather than observed, and the two questions worth
 * asking of it are the ones a clock could never get wrong.
 *
 * Deliberately no limit on how far back it may go. The sessions that need this
 * most are the forgotten ones - checked in on Friday, noticed on Monday - and a
 * ceiling would lock out exactly the case the feature exists for. The floor is
 * the session's own start, which is not a policy but arithmetic: a session
 * cannot end before it began, and a negative duration would price as a negative
 * bill.
 *
 * Compared as arena wall-clock strings rather than instants, the same way
 * `bookingAttention` does it: `YYYY-MM-DD HH:MM:SS` sorts chronologically as
 * text, both sides are read on the same clock, and no host offset can get in.
 */
export type CheckoutTimeResult =
  | { ok: true; date: string; clock: string }
  | { ok: false; error: string }

export function resolveCheckoutTime(
  input: {
    /** `YYYY-MM-DD`, on the arena's calendar. */
    date: string
    /** `HH:MM` or `HH:MM:SS`, 24-hour, on the arena's clock. */
    clock: string
    /** When the session started, as the timestamp the database holds. */
    checkedInAt: string | null | undefined
  },
  now: Date = new Date()
): CheckoutTimeResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: 'Choose the date the customer left.' }
  }

  const clock = /^\d{2}:\d{2}(:\d{2})?$/.test(input.clock)
    ? (input.clock.length === 5 ? `${input.clock}:00` : input.clock)
    : null
  if (!clock) {
    return { ok: false, error: 'Choose the time the customer left.' }
  }

  const entered = `${input.date} ${clock}`

  if (!input.checkedInAt) {
    return { ok: false, error: 'That session has no check-in time to measure from.' }
  }
  const started = new Date(input.checkedInAt)
  if (Number.isNaN(started.getTime())) {
    return { ok: false, error: 'That session has no readable check-in time.' }
  }

  const startedStamp = `${arenaDate(started)} ${arenaClockTime(started)}`
  if (entered <= startedStamp) {
    return {
      ok: false,
      error:
        `The session started at ${formatClockTime12h(input.checkedInAt)} on ` +
        `${arenaDate(started)}. Checkout has to be after that.`,
    }
  }

  const nowStamp = `${arenaDate(now)} ${arenaClockTime(now)}`
  if (entered > nowStamp) {
    // Refused rather than clamped: picking tomorrow off a date picker is a
    // common slip, and silently billing it as "now" would hide the mistake
    // behind a plausible-looking total.
    return { ok: false, error: 'Checkout cannot be in the future. Check the date and AM/PM.' }
  }

  return { ok: true, date: input.date, clock }
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
    /**
     * The finish the customer named at check-in, as a timestamp, when they named
     * one. Null is the ordinary session nobody has said anything about.
     */
    plannedEnd?: string | null
  },
  slotDate: string,
  now: Date = new Date()
): number | null {
  if (!session.billedOnActualTime) return null
  if (session.status !== 'checked_in') return null
  if (!session.checkedInAt) return null

  /**
   * A stated finish that has not arrived yet is better information than the cap.
   *
   * The twelve hours below exist because a session with no stated end could be
   * over in ten minutes or run all evening, and the row could not say which. When
   * the customer has said, holding the station until the small hours blocks an
   * evening of bookings on the strength of nothing - the arena saw exactly that:
   * one walk-in, and the device type read fully booked for the rest of the day.
   *
   * Returning null leaves the row's own window standing, which for a session like
   * this *is* the planned end. So the hours after it are sellable.
   *
   * Only while it is still ahead of us. At one minute past their stated finish,
   * with no checkout, the customer is overrunning rather than gone - the cap
   * comes back and the station is held again, which is the case
   * `20260826130000` was written for.
   */
  if (session.plannedEnd) {
    const plannedEnd = new Date(session.plannedEnd)
    if (!Number.isNaN(plannedEnd.getTime()) && plannedEnd.getTime() > now.getTime()) {
      return null
    }
  }

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
