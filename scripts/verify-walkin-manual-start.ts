/**
 * Reading the hand-entered ends of a walk-in session.
 *
 *   npm run test:walkin-start
 *
 * A walk-in used to be billed from whenever `Check In` was pressed, which is the
 * right answer only when the desk is free at the moment the customer sits down.
 * It now accepts a time of day instead - and a second one for the session that
 * was over before it was typed in at all - which opens two ways to be wrong that
 * both cost the customer money without looking wrong on the screen:
 *
 *   - AM/PM. There is no such thing as an invalid one, so "7:15" with the wrong
 *     half of the day is a perfectly plausible twelve-hour error in the bill.
 *   - Midnight. This arena is open through it, so at 00:30 the reading "11:45 PM"
 *     is forty-five minutes ago and not twenty-three hours in the future.
 *
 * The end adds a third, which is that neither reading is wrong on its own: only
 * the order of the two says the window cannot have happened.
 *
 * Times here are built with `Date.UTC` and the arena is UTC+5:30, so 13:45 UTC is
 * 7:15 PM at the counter. The last check of each half runs the same assertion
 * under a deliberately wrong host time zone, which is the failure this codebase
 * has had more than once: the answer must come off the arena's clock, not the
 * server's.
 */

import assert from 'node:assert/strict'
import {
  MAX_BACKDATED_START_HOURS,
  MAX_PLANNED_SESSION_HOURS,
  PROVISIONAL_SESSION_HOURS,
  resolveBackdatedStart,
  resolvePlannedSession,
  sessionClaimWindow,
} from '../lib/bookings/walkInSession'
import { arenaClockTime } from '../lib/utils/dates'

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

/** An instant whose arena clock reads `hh:mm`, via UTC+5:30. */
function arenaAt(hour: number, minute: number, day = 26): Date {
  const utcMinutes = hour * 60 + minute - (5 * 60 + 30)
  return new Date(Date.UTC(2026, 7, day, 0, utcMinutes))
}

function agoAt(now: Date, entered: string): number {
  const result = resolveBackdatedStart(entered, now)
  assert.ok(result.ok, `expected "${entered}" to be accepted: ${result.ok ? '' : result.error}`)
  return result.start.minutesAgo
}

function refusedAt(now: Date, entered: string): string {
  const result = resolveBackdatedStart(entered, now)
  assert.ok(!result.ok, `expected "${entered}" to be refused`)
  return result.error
}

console.log('\nHow long ago the entered time was')

check('the current minute is now, not a day ago', () => {
  assert.equal(agoAt(arenaAt(19, 15), '19:15'), 0)
})

check('a couple of hours into the session', () => {
  assert.equal(agoAt(arenaAt(19, 15), '17:00'), 135)
})

check('twenty minutes, the case this exists for', () => {
  assert.equal(agoAt(arenaAt(19, 15), '18:55'), 20)
})

console.log('\nMidnight, which the arena is open through')

check('11:45 PM entered at 00:30 is forty-five minutes ago', () => {
  assert.equal(agoAt(arenaAt(0, 30), '23:45'), 45)
})

check('a start after midnight is still read as today', () => {
  assert.equal(agoAt(arenaAt(0, 30), '00:15'), 15)
})

check('the small hours reach back into last evening', () => {
  assert.equal(agoAt(arenaAt(2, 0), '21:30'), 270)
})

console.log('\nThe ceiling, which is what catches an AM/PM slip')

check(`exactly ${MAX_BACKDATED_START_HOURS} hours back is still allowed`, () => {
  // 6 hours before 7:15 PM. Written from the constant so halving or raising the
  // ceiling moves the test with it rather than leaving it asserting the old one.
  const ceiling = arenaAt(19 - MAX_BACKDATED_START_HOURS, 15)
  const clock = arenaClockTime(ceiling).slice(0, 5)
  assert.equal(agoAt(arenaAt(19, 15), clock), MAX_BACKDATED_START_HOURS * 60)
})

check('five minutes past the ceiling is refused', () => {
  const justOver = arenaAt(19 - MAX_BACKDATED_START_HOURS, 10)
  assert.match(
    refusedAt(arenaAt(19, 15), arenaClockTime(justOver).slice(0, 5)),
    /within the last/
  )
})

check('7:15 AM typed for a 7:15 PM start is refused, not billed', () => {
  // 7:15 PM entered at 8:00 PM is 45 minutes. The same clock face with the wrong
  // half of the day is 12h45m, which is over the ceiling and gets stopped.
  assert.equal(agoAt(arenaAt(20, 0), '19:15'), 45)
  assert.match(refusedAt(arenaAt(20, 0), '07:15'), /AM\/PM/)
})

check('a PM slip near dawn is caught by the same rule', () => {
  // 8:00 AM, meaning 7:15 AM but typed as PM: not yet reached today, so read as
  // last night - 12h45m ago, over the ceiling.
  assert.equal(agoAt(arenaAt(8, 0), '07:15'), 45)
  assert.match(refusedAt(arenaAt(8, 0), '19:15'), /within the last/)
})

check('a time that has not happened yet is refused', () => {
  assert.match(refusedAt(arenaAt(19, 15), '19:20'), /within the last/)
})

console.log('\nWhat is not a time of day at all')

for (const bad of ['', '   ', '7', '7:5', '25:00', '24:00', '19:60', 'now', '07:15 PM']) {
  check(`"${bad}" is refused`, () => {
    assert.ok(!resolveBackdatedStart(bad, arenaAt(19, 15)).ok)
  })
}

check('a single-digit hour is padded for the database', () => {
  // `p_started_clock` is a Postgres TIME, so it would take "9:05" happily. Padded
  // anyway, because the same string is what gets echoed back to the desk.
  const result = resolveBackdatedStart('9:05', arenaAt(13, 15))
  assert.ok(result.ok)
  assert.equal(result.start.clock, '09:05')
  assert.equal(result.start.minutesAgo, 250)
})

console.log('\nThe host clock gets no say')

check('the same answer under a host time zone the arena is not in', () => {
  const now = arenaAt(0, 30)
  const here = agoAt(now, '23:45')

  const original = process.env.TZ
  try {
    // The bug this guards against: reading the entered time against the server's
    // own clock. On Vercel that is UTC, where this instant is still 19:00 the
    // previous evening and "11:45 PM" would come out as nineteen hours away.
    for (const zone of ['UTC', 'America/New_York', 'Asia/Kolkata']) {
      process.env.TZ = zone
      assert.equal(agoAt(now, '23:45'), here, `host zone ${zone} changed the answer`)
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

/**
 * The planned end: when the customer says they are leaving.
 *
 * Read forwards where the start is read backwards, and that is the whole of the
 * difference. It settles no money - the bill still comes from the two real
 * timestamps at checkout - so what these check is the window the station is held
 * for, and the two ways a clock face gets it wrong: an AM/PM slip, which lands
 * about twelve hours out, and a time that has already gone, which can only be
 * read as tomorrow.
 */

function heldForAt(now: Date, start: string | null, end: string): number {
  const result = resolvePlannedSession(start, end, now)
  assert.ok(
    result.ok,
    `expected "${start ?? 'now'}" to "${end}" to be accepted: ${result.ok ? '' : result.error}`
  )
  return result.session.plannedMinutes
}

function plannedRefusedAt(now: Date, start: string | null, end: string): string {
  const result = resolvePlannedSession(start, end, now)
  assert.ok(!result.ok, `expected "${start ?? 'now'}" to "${end}" to be refused`)
  return result.error
}

console.log('\nHow long the station is held for')

check('start to planned end, not now to planned end', () => {
  // Started fifteen minutes ago, leaving at nine: the hold is the whole two
  // hours, because that is the window the slot row has to cover.
  assert.equal(heldForAt(arenaAt(19, 15), '19:00', '21:00'), 120)
})

check('no start time means the session begins now', () => {
  assert.equal(heldForAt(arenaAt(19, 15), null, '21:00'), 105)
})

check('a planned end minutes away is a short hold, not a rounded-up one', () => {
  assert.equal(heldForAt(arenaAt(19, 15), '19:00', '19:30'), 30)
})

check('the planned end is padded for the database', () => {
  const result = resolvePlannedSession('08:00', '9:05', arenaAt(8, 30))
  assert.ok(result.ok)
  assert.equal(result.session.end.clock, '09:05')
  assert.equal(result.session.end.minutesAhead, 35)
  assert.equal(result.session.plannedMinutes, 65)
})

console.log('\nMidnight, planning through it')

check('a session planning to finish after midnight is held across it', () => {
  assert.equal(heldForAt(arenaAt(23, 50), '23:50', '00:30'), 40)
})

check('and one started before midnight, planned after, entered after', () => {
  // 00:10 now, started 11:40 PM, leaving at 1:00 AM: 30 minutes gone, 50 to go.
  assert.equal(heldForAt(arenaAt(0, 10), '23:40', '01:00'), 80)
})

console.log('\nPlanned ends that cannot be honoured')

check('a planned end that has already gone is refused', () => {
  // Read as tomorrow, because a finish cannot be in the past - which makes it a
  // day-long hold and the ceiling stops it. The message points at checkout,
  // since a customer whose end has passed is one to check out, not to plan for.
  const error = plannedRefusedAt(arenaAt(21, 0), '20:00', '19:00')
  assert.match(error, /check them out instead/)
})

check('a planned end equal to now is refused', () => {
  assert.match(plannedRefusedAt(arenaAt(21, 0), '20:00', '21:00'), /more than/)
})

check('9:00 AM typed for a 9:00 PM finish is refused, not held', () => {
  assert.equal(heldForAt(arenaAt(19, 15), '19:00', '21:00'), 120)
  assert.match(plannedRefusedAt(arenaAt(19, 15), '19:00', '09:00'), /AM\/PM/)
})

check('the start keeps its own ceiling when a planned end is given', () => {
  // Seven hours back is refused as a start whatever the planned end says.
  assert.match(plannedRefusedAt(arenaAt(19, 15), '12:15', '21:00'), /within the last/)
})

for (const bad of ['', '   ', '7', '7:5', '25:00', '19:60', 'now', '09:00 PM']) {
  check(`"${bad}" is not a planned end`, () => {
    assert.match(plannedRefusedAt(arenaAt(19, 15), '19:00', bad), /expects to finish/)
  })
}

console.log('\nThe ceiling, which is the live window')

check(`exactly ${MAX_PLANNED_SESSION_HOURS} hours of hold is allowed`, () => {
  // Written from the constant so moving it moves the test with it. A hold longer
  // than the live window would outlast everything that reads it.
  const now = arenaAt(9, 0)
  const end = arenaClockTime(arenaAt(9 + MAX_PLANNED_SESSION_HOURS, 0)).slice(0, 5)
  assert.equal(heldForAt(now, null, end), MAX_PLANNED_SESSION_HOURS * 60)
})

check('a minute past it, counted from the start rather than from now, is refused', () => {
  // The backdated start counts against the hold: five minutes ago plus the full
  // ceiling ahead is five minutes too long.
  const now = arenaAt(9, 0)
  const end = arenaClockTime(arenaAt(9 + MAX_PLANNED_SESSION_HOURS, 0)).slice(0, 5)
  assert.match(plannedRefusedAt(now, '08:55', end), /more than/)
})

console.log('\nThe host clock gets no say here either')

check('a hold across midnight reads the same under any host zone', () => {
  const now = arenaAt(23, 50)
  const here = heldForAt(now, '23:50', '00:30')

  const original = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/New_York', 'Asia/Kolkata']) {
      process.env.TZ = zone
      assert.equal(heldForAt(now, '23:50', '00:30'), here, `host zone ${zone} changed the answer`)
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

/**
 * The window the desk is about to claim.
 *
 * The floor warning on the form used to ask a fixed question - "is a station
 * free for the next five hours" - however the times had been filled in, so a
 * customer starting at seven and leaving at nine was told the floor was full by
 * a booking at ten that their session would never have touched. These pin the
 * window against what `checkin_walkin_session` actually claims.
 */

console.log('\nThe window the pre-flight check asks about')

check('nothing entered is now, for the placeholder block', () => {
  const claim = sessionClaimWindow({}, arenaAt(19, 15))
  assert.equal(claim.slotDate, '2026-08-26')
  assert.equal(claim.start, 19 * 60 + 15)
  assert.equal(claim.end, 19 * 60 + 15 + PROVISIONAL_SESSION_HOURS * 60)
})

check('a backdated start moves the block earlier, not just its beginning', () => {
  // The overlap that matters for a session that began at 7:00 is the one at
  // 7:00, not the one at 7:20 when somebody got round to typing it.
  const claim = sessionClaimWindow({ startedClock: '19:00' }, arenaAt(19, 20))
  assert.equal(claim.start, 19 * 60)
  assert.equal(claim.end, 19 * 60 + PROVISIONAL_SESSION_HOURS * 60)
})

check('a planned end shortens it to the window that was named', () => {
  const claim = sessionClaimWindow(
    { startedClock: '19:00', plannedEndClock: '21:00' },
    arenaAt(19, 20)
  )
  assert.equal(claim.start, 19 * 60)
  assert.equal(claim.end, 21 * 60)
})

check('a planned end with no start runs from now', () => {
  const claim = sessionClaimWindow({ plannedEndClock: '21:00' }, arenaAt(19, 20))
  assert.equal(claim.start, 19 * 60 + 20)
  assert.equal(claim.end, 21 * 60)
})

check('a session backdated across midnight is filed under the day it started', () => {
  // Not today's date: `checkin_walkin_session` dates the slot by the start, and
  // asking about today would compare the window against the wrong day's rows.
  const claim = sessionClaimWindow({ startedClock: '23:45' }, arenaAt(0, 30))
  assert.equal(claim.slotDate, '2026-08-25')
  assert.equal(claim.start, 23 * 60 + 45)
  assert.equal(claim.end, 23 * 60 + 45 + PROVISIONAL_SESSION_HOURS * 60)
})

check('a window running past midnight comes back above the day, not wrapped', () => {
  // `fetchOccupiedRanges` puts the next day's rows above 1440 on this timeline,
  // so wrapping here would compare an evening session against the small hours.
  const claim = sessionClaimWindow(
    { startedClock: '23:30', plannedEndClock: '00:45' },
    arenaAt(23, 40)
  )
  assert.equal(claim.slotDate, '2026-08-26')
  assert.equal(claim.start, 23 * 60 + 30)
  assert.equal(claim.end, 24 * 60 + 45)
})

check('an unreadable planned end no longer takes the start down with it', () => {
  // The pre-flight has to describe the window the claim will make. Written as a
  // chain, a planned end that could not be read discarded a perfectly good start
  // and asked about five hours from *now* instead.
  const claim = sessionClaimWindow(
    { startedClock: '19:00', plannedEndClock: 'half nine' },
    arenaAt(19, 20)
  )
  assert.equal(claim.start, 19 * 60, 'the start still counts')
  assert.equal(claim.end, 19 * 60 + PROVISIONAL_SESSION_HOURS * 60)
})

check('an unreadable time falls back rather than refusing', () => {
  // This is the warning, not the guard: the field has already said what is wrong
  // with it, and the claim in SQL is what decides.
  const claim = sessionClaimWindow({ startedClock: 'half seven' }, arenaAt(19, 15))
  assert.equal(claim.start, 19 * 60 + 15)
  assert.equal(claim.end, 19 * 60 + 15 + PROVISIONAL_SESSION_HOURS * 60)
})

console.log(
  failures === 0
    ? '\nAll walk-in start and planned-end checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
