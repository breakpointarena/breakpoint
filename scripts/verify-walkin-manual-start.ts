/**
 * Reading a hand-entered walk-in start time.
 *
 *   npm run test:walkin-start
 *
 * A walk-in used to be billed from whenever `Check In` was pressed, which is the
 * right answer only when the desk is free at the moment the customer sits down.
 * It now accepts a time of day instead, and that opens two ways to be wrong that
 * both cost the customer money without looking wrong on the screen:
 *
 *   - AM/PM. There is no such thing as an invalid one, so "7:15" with the wrong
 *     half of the day is a perfectly plausible twelve-hour error in the bill.
 *   - Midnight. This arena is open through it, so at 00:30 the reading "11:45 PM"
 *     is forty-five minutes ago and not twenty-three hours in the future.
 *
 * Times here are built with `Date.UTC` and the arena is UTC+5:30, so 13:45 UTC is
 * 7:15 PM at the counter. The last check runs the same assertion under a
 * deliberately wrong host time zone, which is the failure this codebase has had
 * more than once: the answer must come off the arena's clock, not the server's.
 */

import assert from 'node:assert/strict'
import {
  MAX_BACKDATED_START_HOURS,
  resolveBackdatedStart,
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

console.log(
  failures === 0
    ? '\nAll walk-in manual start checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
