/**
 * Slot hold window checks.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:hold
 *
 * Scope is the one piece of hold logic that is pure: whether the hold a browser
 * presents actually covers the window being paid for. Everything else about holds
 * - the claim, the conversion, the release - is enforced inside the database and
 * is exercised by CONCURRENCY_TESTING.md, not here.
 */

import assert from 'node:assert/strict'
import { slotRowCoversWindow, type HeldSlotRow } from '../lib/bookings/holdWindow'

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

/** What the hold reserved: 2026-08-20, 10:00-11:30. */
const held: HeldSlotRow = {
  slot_date: '2026-08-20',
  slot_start_time: '10:00:00',
  slot_end_time: '11:30:00',
}

/** What the customer is now paying for. */
const requested = {
  slotDate: '2026-08-20',
  slotStartTime24: '10:00',
  slotEndTime24: '11:30',
}

console.log('\nThe hold covers the booking')

check('exact match, seconds on the stored side only', () => {
  assert.equal(slotRowCoversWindow(held, requested), true)
})

check('seconds on both sides', () => {
  assert.equal(
    slotRowCoversWindow(held, {
      ...requested,
      slotStartTime24: '10:00:00',
      slotEndTime24: '11:30:00',
    }),
    true
  )
})

console.log('\nThe hold does not cover it')

check('different date', () => {
  assert.equal(slotRowCoversWindow(held, { ...requested, slotDate: '2026-08-21' }), false)
})

check('different start time', () => {
  assert.equal(slotRowCoversWindow(held, { ...requested, slotStartTime24: '10:30' }), false)
})

check('stretched end - 90 minutes held, 5 hours requested', () => {
  assert.equal(slotRowCoversWindow(held, { ...requested, slotEndTime24: '15:00' }), false)
})

check('shortened end', () => {
  assert.equal(slotRowCoversWindow(held, { ...requested, slotEndTime24: '10:30' }), false)
})

check('a hold with no slot row reserved nothing', () => {
  assert.equal(slotRowCoversWindow(undefined, requested), false)
})

console.log(
  failures === 0
    ? '\nAll slot hold checks passed.\n'
    : `\n${failures} slot hold check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
