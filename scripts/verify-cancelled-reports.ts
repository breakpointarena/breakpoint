/**
 * How the reports treat a booking that was called off.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:cancelled
 *
 * The rule being protected is the one that is easy to get wrong in either
 * direction: a cancelled booking must not add to the takings, must not be
 * counted as owed, and must not simply vanish - whatever was collected on it
 * before it was cancelled is money the arena is still holding, and the report
 * has to say so.
 */

import assert from 'node:assert/strict'
import {
  collectedOnCancelled,
  isCancelled,
  partitionCancelled,
} from '../lib/reports/cancellations'

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

const booking = (over: Record<string, any> = {}) => ({
  id: 'b1',
  status: 'completed',
  amount_paid: 500,
  ...over,
})

console.log('\nCancelled bookings in the reports\n')

check('a cancelled booking is kept out of the revenue set', () => {
  const { active, cancelled } = partitionCancelled([
    booking({ id: 'paid' }),
    booking({ id: 'called-off', status: 'cancelled' }),
  ])

  assert.deepEqual(active.map(b => b.id), ['paid'])
  assert.deepEqual(cancelled.map(b => b.id), ['called-off'])
})

check('money taken before the cancellation is reported on its own', () => {
  const { cancelled } = partitionCancelled([
    booking({ status: 'cancelled', amount_paid: 249.5 }),
    booking({ status: 'cancelled', amount_paid: 100.25 }),
  ])

  assert.equal(collectedOnCancelled(cancelled), 349.75)
})

check('a cancellation nobody had paid for adds nothing', () => {
  const { cancelled } = partitionCancelled([booking({ status: 'cancelled', amount_paid: 0 })])
  assert.equal(collectedOnCancelled(cancelled), 0)
})

check('the collected figure is rounded to paise', () => {
  const cancelled = [booking({ amount_paid: 0.1 }), booking({ amount_paid: 0.2 })]
  assert.equal(collectedOnCancelled(cancelled), 0.3)
})

check('amounts stored as strings still count', () => {
  assert.equal(collectedOnCancelled([booking({ amount_paid: '150.50' })]), 150.5)
})

check('a missing or nonsense amount is ignored rather than poisoning the total', () => {
  const cancelled = [
    booking({ amount_paid: null }),
    booking({ amount_paid: undefined }),
    booking({ amount_paid: 'not a number' }),
    booking({ amount_paid: 200 }),
  ]
  assert.equal(collectedOnCancelled(cancelled), 200)
})

check('status is matched whatever its casing', () => {
  assert.equal(isCancelled({ status: 'Cancelled' }), true)
  assert.equal(isCancelled({ status: 'CANCELLED' }), true)
  assert.equal(isCancelled({ status: 'cancelled' }), true)
})

check('nothing else is mistaken for a cancellation', () => {
  for (const status of ['confirmed', 'checked_in', 'completed', 'expired', 'locked', null]) {
    assert.equal(isCancelled({ status }), false, `${status} should not read as cancelled`)
  }
})

check('a period with no cancellations reports zero, not nothing', () => {
  const { active, cancelled } = partitionCancelled([booking(), booking({ id: 'b2' })])
  assert.equal(active.length, 2)
  assert.equal(cancelled.length, 0)
  assert.equal(collectedOnCancelled(cancelled), 0)
})

console.log('')
if (failures > 0) {
  console.error(`${failures} check(s) failed\n`)
  process.exit(1)
}
console.log('All cancelled-booking checks passed\n')
