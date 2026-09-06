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

console.log(
  failures === 0
    ? '\nAll walk-in session checks passed.\n'
    : `\n${failures} walk-in session check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
