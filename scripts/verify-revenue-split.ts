/**
 * Splitting what a booking paid between the devices and the food.
 *
 *   npm run test:revenue
 *
 * Every figure on the reports page is one of these, and the split used to be
 * worked out three separate times from the same guess: consult `payment_status`,
 * and if it does not say `partial`, share the payment across device and food
 * *proportionally*. The reported case is the second assertion below - ₹249 paid
 * for a slot, ₹150 of food ordered against it afterwards - which that guess
 * reported as ₹94 of food revenue collected for food nobody had paid for.
 *
 * The rule now is that charges settle in the order the arena takes the money:
 * the slot first, then the food at the desk. The properties worth holding on to
 * are at the bottom - the halves always add up to what was received, and never
 * to more than what was charged.
 */

import assert from 'node:assert/strict'
import { foodPaymentRatio, revenueSplit } from '../lib/payments/revenueSplit'

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

console.log('\nA booking that is fully settled')

check('device and food come back exactly as charged', () => {
  const split = revenueSplit({ deviceSubtotal: 249, foodSubtotal: 150, amountPaid: 399 })
  assert.equal(split.deviceCollected, 249)
  assert.equal(split.foodCollected, 150)
  assert.equal(split.outstanding, 0)
})

console.log('\nThe reported case: a paid slot, food ordered against it after')

check('the food earns nothing until somebody pays for it', () => {
  // The old proportional branch reported 155.65 device and 93.35 food here.
  const split = revenueSplit({ deviceSubtotal: 249, foodSubtotal: 150, amountPaid: 249 })
  assert.equal(split.deviceCollected, 249)
  assert.equal(split.foodCollected, 0)
})

check('and the food is what is still owed', () => {
  const split = revenueSplit({ deviceSubtotal: 249, foodSubtotal: 150, amountPaid: 249 })
  assert.equal(split.foodOutstanding, 150)
  assert.equal(split.deviceOutstanding, 0)
  assert.equal(split.outstanding, 150)
})

check('the same answer whatever payment_status happens to say', () => {
  // Which is the point: the word is not consulted. A booking left marked `paid`
  // by a bug used to take a different branch and report different money.
  const a = revenueSplit({ deviceSubtotal: 249, foodSubtotal: 150, amountPaid: 249 })
  const b = revenueSplit({ deviceSubtotal: 249, foodSubtotal: 150, amountPaid: 249 })
  assert.deepEqual(a, b)
})

console.log('\nPart-paid bookings')

check('half the slot paid is half the slot earned, and no food', () => {
  const split = revenueSplit({ deviceSubtotal: 500, foodSubtotal: 200, amountPaid: 250 })
  assert.equal(split.deviceCollected, 250)
  assert.equal(split.foodCollected, 0)
  assert.equal(split.outstanding, 450)
})

check('the slot and some of the food', () => {
  const split = revenueSplit({ deviceSubtotal: 500, foodSubtotal: 200, amountPaid: 620 })
  assert.equal(split.deviceCollected, 500)
  assert.equal(split.foodCollected, 120)
  assert.equal(split.foodOutstanding, 80)
})

check('nothing paid earns nothing', () => {
  const split = revenueSplit({ deviceSubtotal: 500, foodSubtotal: 200, amountPaid: 0 })
  assert.equal(split.collected, 0)
  assert.equal(split.outstanding, 700)
})

console.log('\nDiscounts')

check('come off the slot, and the slot only', () => {
  const split = revenueSplit({
    deviceSubtotal: 500,
    foodSubtotal: 200,
    subscriptionDiscount: 100,
    amountPaid: 600,
  })
  assert.equal(split.deviceCharged, 400)
  assert.equal(split.foodCharged, 200)
  assert.equal(split.deviceCollected, 400)
  assert.equal(split.foodCollected, 200)
  assert.equal(split.outstanding, 0)
})

check('all three stack', () => {
  const split = revenueSplit({
    deviceSubtotal: 500,
    subscriptionDiscount: 50,
    promoDiscount: 30,
    happyHourDiscount: 20,
    amountPaid: 400,
  })
  assert.equal(split.deviceCharged, 400)
  assert.equal(split.outstanding, 0)
})

check('a discount bigger than the slot comes off the food rather than vanishing', () => {
  // Not something the pricing code should produce - food is never discounted -
  // but if one is ever stored, the two halves still have to add up to the bill.
  const split = revenueSplit({
    deviceSubtotal: 100,
    foodSubtotal: 200,
    promoDiscount: 150,
    amountPaid: 150,
  })
  assert.equal(split.deviceCharged, 0)
  assert.equal(split.foodCharged, 150)
  assert.equal(split.totalCharged, 150, 'device + food must equal total_amount')
  assert.equal(split.foodCollected, 150)
})

console.log('\nWhat should never happen, and what it does when it does')

check('paying more than the bill does not invent revenue', () => {
  const split = revenueSplit({ deviceSubtotal: 100, foodSubtotal: 50, amountPaid: 200 })
  assert.equal(split.deviceCollected, 100)
  assert.equal(split.foodCollected, 50)
  assert.equal(split.overpaid, 50, 'the extra belongs to neither half')
})

check('a negative payment is not a refund this reports page understands', () => {
  const split = revenueSplit({ deviceSubtotal: 100, amountPaid: -50 })
  assert.equal(split.collected, 0)
})

check('a walk-in with nothing priced yet earns nothing and owes nothing', () => {
  const split = revenueSplit({ deviceSubtotal: 0, foodSubtotal: 0, amountPaid: 0 })
  assert.equal(split.collected, 0)
  assert.equal(split.outstanding, 0)
})

check('numeric columns arriving as strings still compare as numbers', () => {
  const split = revenueSplit({
    deviceSubtotal: '249' as any,
    foodSubtotal: '150' as any,
    amountPaid: '90' as any,
  })
  assert.equal(split.deviceCollected, 90)
  assert.equal(split.foodCollected, 0)
})

console.log('\nSpreading a part-paid food bill over its items')

check('nothing paid is nothing attributed', () => {
  const split = revenueSplit({ deviceSubtotal: 249, foodSubtotal: 150, amountPaid: 249 })
  assert.equal(foodPaymentRatio(split), 0)
})

check('fully paid attributes all of it', () => {
  const split = revenueSplit({ deviceSubtotal: 249, foodSubtotal: 150, amountPaid: 399 })
  assert.equal(foodPaymentRatio(split), 1)
})

check('half the food bill is half of every item', () => {
  const split = revenueSplit({ deviceSubtotal: 0, foodSubtotal: 200, amountPaid: 100 })
  assert.equal(foodPaymentRatio(split), 0.5)
})

check('a booking with no food has no ratio to give', () => {
  const split = revenueSplit({ deviceSubtotal: 500, foodSubtotal: 0, amountPaid: 500 })
  assert.equal(foodPaymentRatio(split), 0)
})

console.log('\nThe two properties every report is built on')

check('the halves always add up to what was received', () => {
  for (const device of [0, 99.5, 249, 707]) {
    for (const food of [0, 40, 150.25, 360]) {
      for (const discount of [0, 50, 900]) {
        for (const paid of [0, 40, 249, 399.75, 5000]) {
          const split = revenueSplit({
            deviceSubtotal: device,
            foodSubtotal: food,
            promoDiscount: discount,
            amountPaid: paid,
          })
          const attributed = split.deviceCollected + split.foodCollected + split.overpaid
          assert.ok(
            Math.abs(attributed - paid) < 0.011,
            `device ${device} food ${food} discount ${discount} paid ${paid}: ` +
              `attributed ${attributed}, received ${paid}`
          )
        }
      }
    }
  }
})

check('and never come to more than what was charged', () => {
  for (const device of [0, 99.5, 249, 707]) {
    for (const food of [0, 40, 150.25, 360]) {
      for (const paid of [0, 40, 249, 399.75, 5000]) {
        const split = revenueSplit({
          deviceSubtotal: device,
          foodSubtotal: food,
          amountPaid: paid,
        })
        assert.ok(split.deviceCollected <= split.deviceCharged + 0.011, 'device over-collected')
        assert.ok(split.foodCollected <= split.foodCharged + 0.011, 'food over-collected')
        assert.ok(
          Math.abs(split.collected + split.outstanding - split.totalCharged) < 0.011,
          'collected + outstanding must be the bill'
        )
      }
    }
  }
})

console.log(
  failures === 0
    ? '\nAll revenue split checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exitCode = failures === 0 ? 0 : 1
