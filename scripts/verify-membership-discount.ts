/**
 * Membership discount pricing checks.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:pricing
 *
 * Scope is the arithmetic that decides what a customer is charged - the part that
 * is pure and worth pinning down. The database lookup in resolveActiveMembership()
 * is exercised by the manual flows described in the PR notes, not here.
 *
 * Dummy Supabase env vars are set before the import because lib/supabase/server.ts
 * builds its client at module load. No network call is made by that constructor.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:54321'
// Padded to the length lib/supabase/server.ts expects, purely so its startup
// warning does not print a scary red line through a passing run.
process.env.SUPABASE_SERVICE_ROLE_KEY ||= `test-service-role-key-${'x'.repeat(140)}`

import assert from 'node:assert/strict'

let failures = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ok   ${name}`)
  } catch (err: any) {
    failures++
    console.error(`  FAIL ${name}`)
    console.error(`       ${err.message.split('\n')[0]}`)
  }
}

/**
 * The device-booking stacking rule from quoteDeviceBooking(), kept in step by
 * hand: membership, happy hour and promo are all valued against the device
 * subtotal and summed, capped at that base so they can never exceed it.
 *
 * Food is deliberately absent - it carries no discount of any kind, in a
 * standalone order or as an add-on to a booking.
 */
function priceDeviceBooking(
  deviceSubtotal: number,
  addonsTotal: number,
  membershipDiscount: number,
  happyHourDiscount: number,
  promoDiscount: number
) {
  const totalDiscount = Math.min(
    round2(membershipDiscount + happyHourDiscount + promoDiscount),
    deviceSubtotal
  )
  return {
    totalDiscount,
    totalAmount: round2(Math.max(0, deviceSubtotal + addonsTotal - totalDiscount)),
  }
}

async function main() {
  const { calculateMembershipDiscount } = await import('../lib/subscriptions/discount')

  console.log('\ncalculateMembershipDiscount')

  check('applies a percentage to the base', () => {
    assert.equal(calculateMembershipDiscount(1000, 10), 100)
    assert.equal(calculateMembershipDiscount(250, 20), 50)
  })

  check('rounds to whole paise', () => {
    assert.equal(calculateMembershipDiscount(99.99, 15), 15)
    assert.equal(calculateMembershipDiscount(333.33, 33), 110)
  })

  check('no membership means no discount', () => {
    assert.equal(calculateMembershipDiscount(1000, 0), 0)
  })

  check('a zero or negative base cannot produce a discount', () => {
    assert.equal(calculateMembershipDiscount(0, 20), 0)
    assert.equal(calculateMembershipDiscount(-500, 20), 0)
  })

  check('a nonsense plan percentage cannot inflate or invert the bill', () => {
    // Clamped, so a bad plan row degrades to "free" rather than paying the
    // customer or charging them more than the order is worth.
    assert.equal(calculateMembershipDiscount(1000, -10), 0)
    assert.equal(calculateMembershipDiscount(1000, 150), 1000)
    assert.equal(calculateMembershipDiscount(1000, Number.NaN), 0)
  })

  console.log('\ndevice booking stacking')

  check('membership alone comes off the device subtotal', () => {
    const priced = priceDeviceBooking(1000, 0, calculateMembershipDiscount(1000, 10), 0, 0)
    assert.deepEqual(priced, { totalDiscount: 100, totalAmount: 900 })
  })

  check('membership, happy hour and promo all stack', () => {
    const priced = priceDeviceBooking(1000, 0, calculateMembershipDiscount(1000, 10), 150, 200)
    assert.deepEqual(priced, { totalDiscount: 450, totalAmount: 550 })
  })

  check('stacked discounts never exceed the device subtotal', () => {
    const priced = priceDeviceBooking(100, 0, calculateMembershipDiscount(100, 60), 50, 80)
    assert.deepEqual(priced, { totalDiscount: 100, totalAmount: 0 })
  })

  console.log('\nfood is never discounted')

  check('add-on food is excluded from the discount base', () => {
    // 1000 device + 400 food, 10% membership: the discount is 100, not 140.
    const priced = priceDeviceBooking(1000, 400, calculateMembershipDiscount(1000, 10), 0, 0)
    assert.deepEqual(priced, { totalDiscount: 100, totalAmount: 1300 })
  })

  check('a fully discounted booking still charges for its food', () => {
    const priced = priceDeviceBooking(500, 250, calculateMembershipDiscount(500, 100), 0, 0)
    assert.equal(priced.totalAmount, 250)
  })

  console.log(
    failures === 0
      ? '\nAll pricing checks passed.\n'
      : `\n${failures} check(s) failed.\n`
  )

  process.exit(failures === 0 ? 0 : 1)
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
