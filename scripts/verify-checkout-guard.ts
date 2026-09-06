/**
 * Checkout eligibility checks.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:checkout
 *
 * Scope is the rule that decides whether a booking may be completed - above all
 * the case this was written for: a device booking that was never checked in must
 * not be checked out. The database lookup that feeds decideCheckout() is exercised
 * by the admin flows, not here.
 */

import assert from 'node:assert/strict'
import { decideCheckout } from '../lib/bookings/checkoutGuard'

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

console.log('\nDevice bookings')

check('never checked in - the case this guard exists for', () => {
  const decision = decideCheckout({ status: 'confirmed', hasDeviceSlots: true })
  assert.equal(decision.ok, false)
  assert.match(decision.ok ? '' : decision.error, /never checked in/i)
})

check('checked in - the only way through', () => {
  assert.deepEqual(decideCheckout({ status: 'checked_in', hasDeviceSlots: true }), {
    ok: true,
    from: 'checked_in'
  })
})

check('already checked out - not completed twice', () => {
  const decision = decideCheckout({ status: 'completed', hasDeviceSlots: true })
  assert.equal(decision.ok, false)
  assert.match(decision.ok ? '' : decision.error, /already been checked out/i)
})

for (const status of ['draft', 'locked', 'cancelled', 'expired']) {
  check(`${status} - cannot be checked out`, () => {
    const decision = decideCheckout({ status, hasDeviceSlots: true })
    assert.equal(decision.ok, false)
    assert.match(decision.ok ? '' : decision.error, new RegExp(`${status} booking cannot`, 'i'))
  })
}

console.log('\nFood-only orders')

check('confirmed - settles without a check-in', () => {
  assert.deepEqual(decideCheckout({ status: 'confirmed', hasDeviceSlots: false }), {
    ok: true,
    from: 'confirmed'
  })
})

check('checked in by mistake - still settles, rather than trapping the order', () => {
  // Nothing stops staff pressing Check In on a food row. When only 'confirmed'
  // was accepted here, doing so left the order impossible to check out and
  // impossible to close.
  assert.deepEqual(decideCheckout({ status: 'checked_in', hasDeviceSlots: false }), {
    ok: true,
    from: 'checked_in'
  })
})

check('cancelled - still cannot be checked out', () => {
  assert.equal(decideCheckout({ status: 'cancelled', hasDeviceSlots: false }).ok, false)
})

check('already checked out - not completed twice', () => {
  assert.equal(decideCheckout({ status: 'completed', hasDeviceSlots: false }).ok, false)
})

console.log(
  failures === 0
    ? '\nAll checkout guard checks passed.\n'
    : `\n${failures} checkout guard check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
