/**
 * Where a booking stands against its bill, and what it still owes.
 *
 *   npm run test:payments
 *
 * The reported case: a customer paid ₹249 online for a slot, then ordered ₹150
 * of food against that booking from their table. The bill became ₹399, the
 * payment stayed at ₹249, and the booking went on saying `paid`.
 *
 * One word, and the reports page did the wrong arithmetic three times over it:
 * `paid` bookings are left out of what the arena is owed, and anything not marked
 * `partial` has its payment split across device and food *proportionally* - so
 * ₹249 handed over against a ₹399 bill was reported as ₹94 of food revenue
 * collected for food nobody had paid for.
 *
 * The rule was written out by hand in two places on the admin side and left out
 * of the customer's path entirely. These assertions are against the one copy
 * that all three now share.
 */

import assert from 'node:assert/strict'
import {
  isBillableBooking,
  outstandingAmount,
  settlementStatus,
} from '../lib/payments/paymentStatus'

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

console.log('\nThe reported case')

check('a paid slot with food ordered against it is partial', () => {
  assert.equal(settlementStatus({ amountPaid: 249, total: 399 }), 'partial')
})

check('and the arena is owed the food', () => {
  assert.equal(outstandingAmount({ amountPaid: 249, total: 399 }), 150)
})

check('settling it at the desk makes it paid', () => {
  assert.equal(settlementStatus({ amountPaid: 399, total: 399 }), 'paid')
  assert.equal(outstandingAmount({ amountPaid: 399, total: 399 }), 0)
})

check('and removing the food again settles it too', () => {
  // The bill drops back under what was already handed over.
  assert.equal(settlementStatus({ amountPaid: 249, total: 249 }), 'paid')
})

console.log('\nThe three states')

check('nothing paid is pending', () => {
  assert.equal(settlementStatus({ amountPaid: 0, total: 500 }), 'pending')
})

check('something paid is partial', () => {
  assert.equal(settlementStatus({ amountPaid: 1, total: 500 }), 'partial')
})

check('one rupee short is still partial', () => {
  assert.equal(settlementStatus({ amountPaid: 499, total: 500 }), 'partial')
})

check('exactly covered is paid', () => {
  assert.equal(settlementStatus({ amountPaid: 500, total: 500 }), 'paid')
})

console.log('\nThe edges that are not a fourth state')

check('a bill of nothing is settled by paying nothing', () => {
  // Where a walk-in sits until it is checked out and priced. Calling that
  // "pending" would put every live session in the unpaid list.
  assert.equal(settlementStatus({ amountPaid: 0, total: 0 }), 'paid')
})

check('paid over the bill is paid, and owes nothing', () => {
  assert.equal(settlementStatus({ amountPaid: 600, total: 500 }), 'paid')
  assert.equal(outstandingAmount({ amountPaid: 600, total: 500 }), 0)
})

check('paise are not rounded away', () => {
  assert.equal(settlementStatus({ amountPaid: 499.5, total: 500 }), 'partial')
  assert.equal(outstandingAmount({ amountPaid: 499.5, total: 500 }), 0.5)
})

console.log('\nColumns that arrive as strings or not at all')

check('numeric columns come back from Postgres as strings', () => {
  // `amount_paid` and `total_amount` are NUMERIC, which supabase-js hands over as
  // strings. Compared as strings, '90' > '399'.
  assert.equal(settlementStatus({ amountPaid: '90' as any, total: '399' as any }), 'partial')
  assert.equal(outstandingAmount({ amountPaid: '90' as any, total: '399' as any }), 309)
})

check('a null total is nothing owed', () => {
  assert.equal(settlementStatus({ amountPaid: null as any, total: null as any }), 'paid')
  assert.equal(outstandingAmount({ amountPaid: null as any, total: null as any }), 0)
})

console.log('\nWhich rows the Payment Status panel should be counting')

check('a real booking with a bill counts', () => {
  assert.equal(isBillableBooking({ status: 'confirmed', total: 399 }), true)
  assert.equal(isBillableBooking({ status: 'completed', total: 200 }), true)
  assert.equal(isBillableBooking({ status: 'checked_in', total: 500 }), true)
})

check('an abandoned slot hold does not', () => {
  // Ten of these sat beside three genuinely unpaid bookings, and the panel read
  // fourteen pending. A customer who opened the picker and backed out owes
  // nothing and is not waiting to pay.
  assert.equal(isBillableBooking({ status: 'expired', total: 0 }), false)
  assert.equal(isBillableBooking({ status: 'locked', total: 0 }), false)
})

check('nor does a walk-in still on the floor', () => {
  // Priced when the clock stops; nothing is outstanding until then.
  assert.equal(isBillableBooking({ status: 'checked_in', total: 0 }), false)
})

check('nor a cancelled one, however it reaches here', () => {
  assert.equal(isBillableBooking({ status: 'cancelled', total: 500 }), false)
})

check('status is read whatever case it arrives in', () => {
  assert.equal(isBillableBooking({ status: 'EXPIRED', total: 0 }), false)
})

check('a missing status with a bill still counts', () => {
  assert.equal(isBillableBooking({ status: null, total: 100 }), true)
})

check('a total arriving as a string is still a bill', () => {
  assert.equal(isBillableBooking({ status: 'confirmed', total: '399' }), true)
  assert.equal(isBillableBooking({ status: 'confirmed', total: '0' }), false)
})

console.log('\nCounting a shift the way the panel does')

check('the reported case is one partial, not one more paid', () => {
  const bookings = [
    { status: 'confirmed', total: 399, paid: 249 }, // slot paid, food ordered after
    { status: 'completed', total: 200, paid: 200 },
    { status: 'completed', total: 150, paid: 0 },
    { status: 'expired', total: 0, paid: 0 }, // abandoned hold
    { status: 'checked_in', total: 0, paid: 0 }, // walk-in in progress
  ]

  const counted = { paid: 0, partial: 0, pending: 0 }
  for (const b of bookings) {
    if (!isBillableBooking({ status: b.status, total: b.total })) continue
    counted[settlementStatus({ amountPaid: b.paid, total: b.total })]++
  }

  assert.deepEqual(counted, { paid: 1, partial: 1, pending: 1 })
  // And the bars fill to a whole rather than to a fraction of five.
  assert.equal(counted.paid + counted.partial + counted.pending, 3)
})

console.log(
  failures === 0
    ? '\nAll payment status checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
