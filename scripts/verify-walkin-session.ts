/**
 * Walk-in session duration and pricing.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:walkin
 *
 * Scope is the arithmetic between the two server timestamps: how long the
 * customer played, and what that comes to. The lifecycle itself - who may check
 * in, what happens when the floor is full, that a second checkout is refused - is
 * enforced inside the database and is covered by WALKIN_TESTING.md.
 */

import assert from 'node:assert/strict'
import {
  MAX_LIVE_SESSION_HOURS,
  formatPlayedDuration,
  liveSessionEndMinutes,
  playedMinutes,
  priceSession,
  sessionTimes,
} from '../lib/bookings/walkInSession'
import {
  availableStartMinutes,
  isRangeAvailable,
  occupiedRangeFor,
  type BookedRow,
} from '../lib/bookings/slotAvailability'
import { isSlotWithinTimeRange } from '../lib/happy-hours'
import { round2 } from '../lib/payments/money'

/**
 * The membership percentage helper itself lives behind a Supabase import, and its
 * own suite (`npm run test:pricing`) covers it. What matters here is the base it
 * is applied to on a session: the device subtotal for the time actually played.
 */
const percentageOf = (base: number, percentage: number) => round2((base * percentage) / 100)

let failures = 0

function check(name: string, run: () => void) {
  try {
    run()
    console.log(`  PASS  ${name}`)
  } catch (err: any) {
    failures++
    console.error(`  FAIL  ${name}\n        ${err.message}`)
  }
}

/** A session on a given day, from wall-clock times. */
function session(start: string, end: string, dayOffset = 0) {
  const startedAt = new Date(`2026-08-14T${start}:00`)
  const endedAt = new Date(`2026-08-${14 + dayOffset}T${end}:00`)
  return { startedAt, endedAt }
}

const PS5 = { hourlyRate: 200, playerCount: 1, includedPlayers: 1, extraPlayerCharge: 150 }

console.log('\nThe worked example: created 8:55, checked in 9:00, out 11:45')

check('the session is measured from check-in, not from creation', () => {
  assert.equal(playedMinutes(session('09:00', '11:45')), 165)
})

check('the 8:55 creation time is nowhere in the duration', () => {
  const fromCreation = playedMinutes(session('08:55', '11:45'))
  const fromCheckIn = playedMinutes(session('09:00', '11:45'))
  assert.equal(fromCheckIn, 165)
  assert.equal(fromCreation, 170)
  assert.notEqual(fromCheckIn, fromCreation)
})

check('2h45m on a ₹200/h PS5 is ₹550', () => {
  const priced = priceSession({ playedMinutes: 165, ...PS5 })
  assert.equal(priced.durationHours, 2.75)
  assert.equal(priced.deviceCharges, 550)
  assert.equal(priced.deviceSubtotal, 550)
})

console.log('\nThe billing edge cases')

check('9:00 to 9:30 - half an hour', () => {
  assert.equal(playedMinutes(session('09:00', '09:30')), 30)
  assert.equal(priceSession({ playedMinutes: 30, ...PS5 }).deviceCharges, 100)
})

check('9:00 past midnight to 00:30 - crosses the date', () => {
  assert.equal(playedMinutes(session('21:00', '00:30', 1)), 210)
  assert.equal(priceSession({ playedMinutes: 210, ...PS5 }).deviceCharges, 700)
})

check('a session longer than the 5h fixed-booking cap still prices', () => {
  const priced = priceSession({ playedMinutes: 8 * 60 + 20, ...PS5 })
  assert.equal(priced.durationHours, 8.33)
  assert.equal(priced.deviceCharges, 1667) // 8h20m = 8.3333h x 200
})

check('a few seconds is billed as one minute, never as nothing', () => {
  const startedAt = new Date('2026-08-14T09:00:00')
  const endedAt = new Date('2026-08-14T09:00:40')
  assert.equal(playedMinutes({ startedAt, endedAt }), 1)
  assert.equal(priceSession({ playedMinutes: 1, ...PS5 }).deviceCharges, 3)
})

check('a clock that goes backwards cannot produce a credit', () => {
  const startedAt = new Date('2026-08-14T11:45:00')
  const endedAt = new Date('2026-08-14T09:00:00')
  assert.equal(playedMinutes({ startedAt, endedAt }), 1)
})

check('exact minutes, not rounded up to the next half hour', () => {
  // 2h45m at ₹379/h is 2.75 x 379 = 1042.25, billed as ₹1042 - not 3h at ₹1137.
  const priced = priceSession({
    playedMinutes: 165,
    hourlyRate: 379,
    playerCount: 4,
    includedPlayers: 4,
    extraPlayerCharge: 79,
  })
  assert.equal(priced.deviceCharges, 1042)
})

console.log('\nExtra players are charged for the time actually played')

check('two extra players over 2h45m, each rounded then added', () => {
  const priced = priceSession({
    playedMinutes: 165,
    hourlyRate: 379,
    playerCount: 6,
    includedPlayers: 4,
    extraPlayerCharge: 79,
  })
  assert.equal(priced.extraPlayersCount, 2)
  assert.equal(priced.perExtraPlayer, 217) // 79 x 2.75 = 217.25
  assert.equal(priced.extraPlayersTotal, 434)
  assert.equal(priced.deviceSubtotal, 1042 + 434)
})

check('nobody extra costs nothing extra', () => {
  const priced = priceSession({ playedMinutes: 165, ...PS5 })
  assert.equal(priced.extraPlayersCount, 0)
  assert.equal(priced.extraPlayersTotal, 0)
})

console.log('\nHappy hour on a session is judged on the hours actually played')

// The rule is the existing one and is deliberately all-or-nothing:
// isSlotWithinTimeRange requires the whole window to sit inside the happy hour.
const HAPPY = '10:00 AM - 01:00 PM'

check('a session played entirely inside the window qualifies', () => {
  assert.equal(isSlotWithinTimeRange('10:30 AM', '12:15 PM', HAPPY), true)
})

check('a session that overruns the window does not', () => {
  // Checked in at 11:00 inside happy hour, but played until 13:45 - no discount,
  // exactly as a fixed booking of those hours would have been refused one.
  assert.equal(isSlotWithinTimeRange('11:00 AM', '01:45 PM', HAPPY), false)
})

check('a session that started before the window does not', () => {
  assert.equal(isSlotWithinTimeRange('09:30 AM', '12:00 PM', HAPPY), false)
})

check('a session exactly filling the window qualifies', () => {
  assert.equal(isSlotWithinTimeRange('10:00 AM', '01:00 PM', HAPPY), true)
})

check('a session crossing midnight never qualifies', () => {
  assert.equal(isSlotWithinTimeRange('11:00 PM', '01:00 AM', '08:00 PM - 02:00 AM'), false)
})

console.log('\nDiscounts stack but cannot exceed what was played')

check('a 20% membership on a 2h45m PS5 session', () => {
  const priced = priceSession({ playedMinutes: 165, ...PS5 })
  assert.equal(priced.deviceSubtotal, 550)
  assert.equal(percentageOf(priced.deviceSubtotal, 20), 110)
})

check('membership and happy hour together are capped at the charge', () => {
  const discountable = 550
  const membership = percentageOf(discountable, 70)
  const happyHour = round2((discountable * 60) / 100)
  const capped = Math.min(round2(membership + happyHour), discountable)
  assert.equal(capped, 550) // 385 + 330 = 715, capped - play is never free-plus
})

check('no membership means no discount', () => {
  assert.equal(percentageOf(550, 0), 0)
})

console.log('\nWhat the booking list shows, and when')

const CHECKED_IN = '2026-08-14T09:00:00'
const CHECKED_OUT = '2026-08-14T11:45:00'

check('a fixed booking is left to its own slot range', () => {
  assert.equal(sessionTimes({ billed_on_actual_time: false, status: 'confirmed' }), null)
})

check('waiting for check-in has neither time', () => {
  const times = sessionTimes({
    billed_on_actual_time: true,
    status: 'confirmed',
    checked_in_at: null,
  })
  assert.equal(times!.checkedInAt, null)
  assert.equal(times!.completedAt, null)
})

check('playing has a check-in time and no checkout time', () => {
  const times = sessionTimes({
    billed_on_actual_time: true,
    status: 'checked_in',
    checked_in_at: CHECKED_IN,
    completed_at: null,
  })
  assert.ok(times!.checkedInAt, 'expected a check-in time')
  // The provisional end on the slot row must never reach the screen as a checkout.
  assert.equal(times!.completedAt, null)
})

check('a running session shows the finish the customer named', () => {
  // The list shows "In: 9:00 AM" and, under it, "Till: 11:45 AM" - the time
  // somebody said at the counter, not a checkout.
  const times = sessionTimes({
    billed_on_actual_time: true,
    status: 'checked_in',
    checked_in_at: CHECKED_IN,
    completed_at: null,
    walk_in_planned_end: CHECKED_OUT,
  })
  assert.ok(times!.plannedEndAt, 'expected the planned end to be shown')
  assert.equal(times!.completedAt, null, 'a plan is not a checkout')
})

check('and drops it once they actually check out', () => {
  // Both would sit next to each other saying different things, and only one of
  // them is what the customer was billed on.
  const times = sessionTimes({
    billed_on_actual_time: true,
    status: 'completed',
    checked_in_at: CHECKED_IN,
    completed_at: CHECKED_OUT,
    walk_in_planned_end: '2026-08-14T11:00:00',
  })
  assert.ok(times!.completedAt)
  assert.equal(times!.plannedEndAt, null)
})

check('a session nobody planned an end for shows none', () => {
  const times = sessionTimes({
    billed_on_actual_time: true,
    status: 'checked_in',
    checked_in_at: CHECKED_IN,
    completed_at: null,
  })
  assert.equal(times!.plannedEndAt, null)
})

check('checked out has both times', () => {
  const times = sessionTimes({
    billed_on_actual_time: true,
    status: 'completed',
    checked_in_at: CHECKED_IN,
    completed_at: CHECKED_OUT,
  })
  assert.ok(times!.checkedInAt)
  assert.ok(times!.completedAt)
  assert.notEqual(times!.checkedInAt, times!.completedAt)
})

console.log('\nHow the duration reads on screen')

check('hours and minutes', () => {
  assert.equal(formatPlayedDuration(165), '2h 45m')
})

check('under an hour drops the hours', () => {
  assert.equal(formatPlayedDuration(45), '45m')
})

check('exactly on the hour', () => {
  assert.equal(formatPlayedDuration(120), '2h 0m')
})

/**
 * How long a live session keeps its station.
 *
 * The slot row carries the five-hour placeholder claimed at check-in, so reading
 * that as the end let the booking flow sell a station out from under somebody
 * still sitting at it - while the floor plan, which goes by booking status for
 * twelve hours, showed them there. These pin the rule that closed the gap.
 *
 * `checked_in_at` values are built from UTC and the arena is UTC+5:30, so
 * 08:30 UTC is 14:00 at the counter.
 */
console.log('\nHow long a live session holds its station')

/** An instant whose arena clock reads hh:mm on 2026-08-26. */
const arenaAt = (hour: number, minute: number, day = 26) =>
  new Date(Date.UTC(2026, 7, day, 0, hour * 60 + minute - (5 * 60 + 30))).toISOString()

const live = (checkedInAt: string) => ({
  billedOnActualTime: true,
  status: 'checked_in',
  checkedInAt,
})

check('a session checked in at 14:00 holds its station until 02:00 tomorrow', () => {
  // 14:00 + 12h = 02:00 the next day, which is 1440 + 120 on this timeline.
  assert.equal(liveSessionEndMinutes(live(arenaAt(14, 0)), '2026-08-26'), 1440 + 120)
})

check('which is later than the five-hour placeholder it would have had', () => {
  const placeholderEnd = 14 * 60 + 5 * 60 // 19:00
  const held = liveSessionEndMinutes(live(arenaAt(14, 0)), '2026-08-26')
  assert.ok(held !== null && held > placeholderEnd, `${held} should exceed ${placeholderEnd}`)
})

check('the cap is exactly MAX_LIVE_SESSION_HOURS from check-in', () => {
  const startMinutes = 9 * 60
  const held = liveSessionEndMinutes(live(arenaAt(9, 0)), '2026-08-26')
  assert.equal(held, startMinutes + MAX_LIVE_SESSION_HOURS * 60)
})

check('a session that started yesterday is rebased onto this date', () => {
  // Checked in 22:00 on the 25th; the cap falls at 10:00 on the 26th.
  assert.equal(liveSessionEndMinutes(live(arenaAt(22, 0, 25)), '2026-08-26'), 600)
})

check('a fixed booking keeps the end on its own row', () => {
  assert.equal(
    liveSessionEndMinutes(
      { billedOnActualTime: false, status: 'checked_in', checkedInAt: arenaAt(14, 0) },
      '2026-08-26'
    ),
    null,
    'a fixed slot must not be stretched to checkout, or back-to-back bookings break'
  )
})

check('a session waiting for check-in holds nothing', () => {
  assert.equal(
    liveSessionEndMinutes(
      { billedOnActualTime: true, status: 'confirmed', checkedInAt: null },
      '2026-08-26'
    ),
    null
  )
})

check('a session already checked out holds nothing', () => {
  assert.equal(
    liveSessionEndMinutes(
      { billedOnActualTime: true, status: 'completed', checkedInAt: arenaAt(14, 0) },
      '2026-08-26'
    ),
    null
  )
})

check('an unreadable check-in time is not treated as a hold', () => {
  assert.equal(liveSessionEndMinutes(live('not a date'), '2026-08-26'), null)
})

/**
 * The exception, added once the desk could say when the customer is leaving.
 *
 * The twelve-hour hold is what you do when nobody has told you anything. When
 * somebody has, holding the station until the small hours blocks an evening of
 * bookings on the strength of nothing - which is what the arena saw: one walk-in
 * and the device type read fully booked for the rest of the day.
 */
console.log('\nA planned end, which frees the hours after it')

/** The instant `now` is pinned to for these: 19:20 at the counter. */
const evening = new Date(arenaAt(19, 20))

check('a stated finish still ahead leaves the row window standing', () => {
  // Null means "do not extend", so the caller keeps the slot's own end - which
  // for a session like this is the planned end itself.
  assert.equal(
    liveSessionEndMinutes(
      { ...live(arenaAt(19, 0)), plannedEnd: arenaAt(21, 0) },
      '2026-08-26',
      evening
    ),
    null
  )
})

check('one minute past it, with no checkout, the station is held again', () => {
  // They are overrunning, not gone. This is the case 20260826130000 exists for,
  // and it has to come back on its own or a planned end would be a way to have a
  // station sold out from under a customer still sitting at it.
  assert.equal(
    liveSessionEndMinutes(
      { ...live(arenaAt(14, 0)), plannedEnd: arenaAt(19, 19) },
      '2026-08-26',
      evening
    ),
    1440 + 120
  )
})

check('a finish exactly now counts as passed', () => {
  assert.equal(
    liveSessionEndMinutes(
      { ...live(arenaAt(14, 0)), plannedEnd: arenaAt(19, 20) },
      '2026-08-26',
      evening
    ),
    1440 + 120
  )
})

check('an unreadable planned end falls back to holding the station', () => {
  // The safe direction: a hold that is too long is a nuisance, a station sold
  // from under somebody is the bug this whole rule is about.
  assert.equal(
    liveSessionEndMinutes(
      { ...live(arenaAt(14, 0)), plannedEnd: 'nine-ish' },
      '2026-08-26',
      evening
    ),
    1440 + 120
  )
})

check('a planned end on a session nobody has checked in holds nothing', () => {
  assert.equal(
    liveSessionEndMinutes(
      {
        billedOnActualTime: true,
        status: 'confirmed',
        checkedInAt: null,
        plannedEnd: arenaAt(21, 0),
      },
      '2026-08-26',
      evening
    ),
    null
  )
})

/**
 * And what that means on the customer's slot picker, which is where the desk
 * met it: one walk-in on the arena's only snooker table, and every hour of the
 * evening greyed out.
 *
 * `fetchDeviceTypeOccupancy` builds ranges from the slot rows and then applies
 * `liveSessionEndMinutes` exactly as these do - the module itself cannot be
 * imported here because it is `server-only`, so the composition is what is
 * pinned: the rule's answer, fed to the same `availableStartMinutes` the picker
 * runs in the browser.
 */
console.log('\nWhat the slot picker offers around a live session')

/** One station, busy from `start` to `end`, in minutes from midnight. */
const oneStationBusy = (start: number, end: number) => ({
  totalDevices: 1,
  occupied: [{ device: 0, start, end }],
})

/** Is a one-hour booking offered at this hour? */
const offeredAt = (occupancy: ReturnType<typeof oneStationBusy>, hour: number) =>
  availableStartMinutes(occupancy, 60).includes(hour * 60)

/** Five o'clock: the session below is running and its planned end is ahead. */
const teatime = new Date(arenaAt(17, 0))

check('a planned 4:45-5:45 session blocks its own hour', () => {
  // The row is the planned window, because the rule declined to extend it.
  const planned = { ...live(arenaAt(16, 45)), plannedEnd: arenaAt(17, 45) }
  const end = liveSessionEndMinutes(planned, '2026-08-26', teatime)
  assert.equal(end, null, 'a pending planned end must not extend the row')

  const occupancy = oneStationBusy(16 * 60 + 45, 17 * 60 + 45)
  assert.equal(offeredAt(occupancy, 17), false, '5pm overlaps the session')
  assert.equal(offeredAt(occupancy, 16), false, '4pm runs into it')
})

check('and leaves the rest of the evening bookable', () => {
  const occupancy = oneStationBusy(16 * 60 + 45, 17 * 60 + 45)
  for (const hour of [18, 19, 20, 21, 22]) {
    assert.equal(offeredAt(occupancy, hour), true, `${hour}:00 should be offered`)
  }
  assert.equal(offeredAt(occupancy, 15), true, '3pm finishes before it starts')
})

check('an open-ended session still takes the evening with it', () => {
  // No planned end, so the hold runs to the twelve-hour cap and the picker has
  // to say so - offering 8pm here is the bug 20260826130000 exists for, and
  // this module never had that rule until now.
  const openEnded = live(arenaAt(16, 45))
  const capped = liveSessionEndMinutes(openEnded, '2026-08-26', teatime)
  assert.equal(capped, 16 * 60 + 45 + MAX_LIVE_SESSION_HOURS * 60)

  const occupancy = oneStationBusy(16 * 60 + 45, capped!)
  assert.equal(offeredAt(occupancy, 20), false, '8pm is inside the twelve-hour hold')
  assert.equal(offeredAt(occupancy, 15), true, '3pm is still before it started')
})

/**
 * The floor rules as the desk stated them, on the one function both sides read.
 *
 *   On check-in, no end named -> the station is held for as long as the rules
 *                                allow, because nobody knows when it is over.
 *   Start and end named       -> the station is held for exactly that window and
 *                                the hours either side stay on sale.
 *
 * `occupiedRangeFor` is what `lib/payments/availability.ts` (the desk) and
 * `lib/bookings/deviceTypeOccupancy.ts` (the customer's picker) both run on a
 * row, so a case proved here is proved for both - which is the point of it being
 * one function. `assign_device_slot` repeats the same rule in SQL and is checked
 * against a real database in WALKIN_TESTING.md §8.
 */
console.log('\nWalk-in 7-9 PM: what else can be booked around it')

const DATE = '2026-08-26'
const NEXT = '2026-08-27'

/** A walk-in row as check-in writes it. */
const walkInRow = (opts: {
  date?: string
  start: string
  end: string
  checkedInAt: string
  plannedEnd: string | null
}): BookedRow => ({
  slotDate: opts.date ?? DATE,
  startTime: opts.start,
  endTime: opts.end,
  status: 'checked_in',
  lockExpiresAt: null,
  billedOnActualTime: true,
  checkedInAt: opts.checkedInAt,
  plannedEnd: opts.plannedEnd,
})

/** One station of this type, busy only with `row`. */
const floorOf = (row: BookedRow, date: string, now: Date) => {
  const range = occupiedRangeFor(row, date, now)
  return {
    totalDevices: 1,
    occupied: range ? [{ device: 0, start: range.start, end: range.end }] : [],
  }
}

/** Would the picker offer this window, and would the desk's check agree? */
const canBook = (
  row: BookedRow,
  date: string,
  now: Date,
  startMinutes: number,
  durationMinutes: number
) => {
  const floor = floorOf(row, date, now)
  const offered = isRangeAvailable(floor, startMinutes, durationMinutes)

  // The desk's own check is a plain overlap against the same range rather than
  // this helper, so it is spelled out here: if the two ever disagree, one screen
  // is selling what the other refuses.
  const requestedEnd = startMinutes + durationMinutes
  const deskFree = !floor.occupied.some(
    (busy) => busy.start < requestedEnd && startMinutes < busy.end
  )
  assert.equal(offered, deskFree, 'the picker and the desk disagree about this window')

  return offered
}

/** The session the desk described: 7:00 PM to 9:00 PM, entered at 7:30. */
const planned = walkInRow({
  start: '19:00:00',
  end: '21:00:00',
  checkedInAt: arenaAt(19, 0),
  plannedEnd: arenaAt(21, 0),
})
const halfSeven = new Date(arenaAt(19, 30))

check('1. a booking from 9:00 PM is allowed', () => {
  assert.equal(canBook(planned, DATE, halfSeven, 21 * 60, 60), true)
})

check('2. a booking from 8:00 PM to 10:00 PM is refused', () => {
  assert.equal(canBook(planned, DATE, halfSeven, 20 * 60, 120), false)
})

check('3. a booking from 10:00 PM is allowed', () => {
  assert.equal(canBook(planned, DATE, halfSeven, 22 * 60, 60), true)
})

check('4. a booking from 6:00 PM to 7:00 PM is allowed', () => {
  // Finishes exactly as the session starts, which is not an overlap.
  assert.equal(canBook(planned, DATE, halfSeven, 18 * 60, 60), true)
})

check('5. a booking from 7:00 PM to 8:00 PM is refused', () => {
  assert.equal(canBook(planned, DATE, halfSeven, 19 * 60, 60), false)
})

check('6. with no end named, the evening goes with it', () => {
  // The same session with nothing said about when it finishes: held to
  // MAX_LIVE_SESSION_HOURS from check-in, so 10 PM is inside it and 6 PM, which
  // is before it started, is not.
  const openEnded = walkInRow({
    start: '19:00:00',
    end: '00:00:00',
    checkedInAt: arenaAt(19, 0),
    plannedEnd: null,
  })
  assert.equal(canBook(openEnded, DATE, halfSeven, 22 * 60, 60), false)
  assert.equal(canBook(openEnded, DATE, halfSeven, 18 * 60, 60), true)

  const range = occupiedRangeFor(openEnded, DATE, halfSeven)
  assert.equal(range?.end, 19 * 60 + MAX_LIVE_SESSION_HOURS * 60, 'held for twelve hours')
})

check('7. a session running 11 PM to 1 AM holds both sides of midnight', () => {
  const overnight = walkInRow({
    start: '23:00:00',
    end: '01:00:00',
    checkedInAt: arenaAt(23, 0),
    plannedEnd: arenaAt(1, 0, 27),
  })
  const nearlyMidnight = new Date(arenaAt(23, 30))

  // On its own date it runs to 1 AM, which is 25:00 on this timeline: 11 PM is
  // inside it, and 10 PM finishes exactly as it starts, which is not an overlap.
  assert.equal(canBook(overnight, DATE, nearlyMidnight, 23 * 60, 60), false)
  assert.equal(canBook(overnight, DATE, nearlyMidnight, 22 * 60, 60), true)

  // Read from the next day it starts an hour before midnight and ends at 1 AM,
  // so half past midnight is refused and one o'clock is free.
  assert.equal(canBook(overnight, NEXT, nearlyMidnight, 30, 60), false)
  assert.equal(canBook(overnight, NEXT, nearlyMidnight, 60, 60), true)
})

check('8. the same row reads the same for the desk and the customer', () => {
  // `canBook` asserts it on every window above; this states it once as its own
  // case, because "customer and admin agree" is the requirement, not a detail.
  for (const start of [17, 18, 19, 20, 21, 22, 23]) {
    canBook(planned, DATE, halfSeven, start * 60, 60)
  }
})

check('a planned end that has passed goes back to holding the station', () => {
  // 9:05 PM, nobody checked out: they are overrunning, not gone, so the hold
  // returns and 10 PM stops being for sale. Same fallback as the SQL claim.
  const fivePastNine = new Date(arenaAt(21, 5))
  assert.equal(canBook(planned, DATE, fivePastNine, 22 * 60, 60), false)
})

console.log(
  failures === 0
    ? '\nAll walk-in session checks passed.\n'
    : `\n${failures} walk-in session check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
