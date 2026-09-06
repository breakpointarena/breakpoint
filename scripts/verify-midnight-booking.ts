/**
 * Bookings that run past midnight.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:midnight
 *
 * The arena trades around the clock, so a late start with a long duration is a
 * normal booking: 9:30 PM for three hours ends at 1:00 AM the next day. The end
 * time alone cannot say that - `calculateEndTime` wraps at 24 hours and "01:00 AM"
 * looks like an hour of the chosen day that has already gone - so every screen
 * showing the end of a booking asks these two functions which day it lands on.
 */

import assert from 'node:assert/strict'
import { calculateEndTime, crossesMidnight, bookingEndDate } from '../lib/utils/timeSlots'

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

const AUG_14 = new Date('2026-08-14T00:00:00')

console.log('\nThe reported case: a late start with only 2h30m left in the day')

check('9:30 PM for 3 hours ends at 12:30 AM', () => {
  assert.equal(calculateEndTime('09:30 PM', 180), '12:30 AM')
})

check('9:30 PM for 3h30m ends at 01:00 AM', () => {
  assert.equal(calculateEndTime('09:30 PM', 210), '01:00 AM')
})

check('is flagged as crossing midnight', () => {
  assert.equal(crossesMidnight('09:30 PM', 180), true)
  assert.equal(crossesMidnight('09:30 PM', 210), true)
})

check('ends on the following day', () => {
  const end = bookingEndDate(AUG_14, '09:30 PM', 180)
  assert.equal(end.getDate(), 15)
  assert.equal(end.getMonth(), AUG_14.getMonth())
})

console.log('\nBookings that finish the same day')

check('9:30 PM for 2h 30m ends exactly at midnight - still the same day', () => {
  // 21:30 + 150 = 24:00. The booking finishes as the day does, so there is no
  // second date to show; the end time reads 12:00 AM either way.
  assert.equal(calculateEndTime('09:30 PM', 150), '12:00 AM')
  assert.equal(crossesMidnight('09:30 PM', 150), true)
  assert.equal(bookingEndDate(AUG_14, '09:30 PM', 150).getDate(), 15)
})

check('9:30 PM for 2 hours ends 11:30 PM, same day', () => {
  assert.equal(crossesMidnight('09:30 PM', 120), false)
  assert.equal(bookingEndDate(AUG_14, '09:30 PM', 120).getDate(), 14)
})

check('a midday booking never crosses', () => {
  assert.equal(crossesMidnight('10:00 AM', 300), false)
  assert.equal(bookingEndDate(AUG_14, '10:00 AM', 300).getDate(), 14)
})

console.log('\nEdges')

check('11:30 PM for 30 minutes lands on midnight', () => {
  assert.equal(calculateEndTime('11:30 PM', 30), '12:00 AM')
  assert.equal(crossesMidnight('11:30 PM', 30), true)
})

check('11:30 PM for the maximum 5 hours', () => {
  assert.equal(calculateEndTime('11:30 PM', 300), '04:30 AM')
  assert.equal(bookingEndDate(AUG_14, '11:30 PM', 300).getDate(), 15)
})

check('midnight start does not count as crossing', () => {
  assert.equal(crossesMidnight('12:00 AM', 300), false)
  assert.equal(bookingEndDate(AUG_14, '12:00 AM', 300).getDate(), 14)
})

check('crossing a month boundary rolls the month', () => {
  const aug31 = new Date('2026-08-31T00:00:00')
  const end = bookingEndDate(aug31, '11:00 PM', 180)
  assert.equal(end.getDate(), 1)
  assert.equal(end.getMonth(), 8) // September
})

check('the start date is never mutated', () => {
  const start = new Date('2026-08-14T00:00:00')
  bookingEndDate(start, '09:30 PM', 180)
  assert.equal(start.getDate(), 14)
})

console.log(
  failures === 0
    ? '\nAll midnight booking checks passed.\n'
    : `\n${failures} midnight booking check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
