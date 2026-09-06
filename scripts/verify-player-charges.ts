/**
 * Extra player and device charge rounding.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:players
 *
 * Scope is the bug these helpers exist for: at a duration ending in a half hour,
 * an extra player's share lands on a half rupee, and rounding the *total* rather
 * than each player's share produced a bill that did not add up - one extra player
 * at ₹79/h for 1.5h showed ₹119, but two showed ₹237 rather than ₹238.
 */

import assert from 'node:assert/strict'
import {
  deviceCharge,
  extraPlayersCharge,
  perExtraPlayerCharge,
  round2,
  roundRupees,
} from '../lib/payments/money'

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

/** The snooker tables: ₹379/h, 4 players included, ₹79/h per extra player. */
const EXTRA = 79
const HOURLY = 379

console.log('\nThe reported bug: 1.5h, ₹79/h extra player')

check('one extra player costs ₹119', () => {
  assert.equal(extraPlayersCharge(1, EXTRA, 1.5), 119)
})

check('two extra players cost ₹238, not ₹237', () => {
  assert.equal(extraPlayersCharge(2, EXTRA, 1.5), 238)
})

check('the line always reads as count x unit', () => {
  const unit = perExtraPlayerCharge(EXTRA, 1.5)
  for (const count of [1, 2, 3, 4]) {
    assert.equal(
      extraPlayersCharge(count, EXTRA, 1.5),
      count * unit,
      `${count} players did not come to ${count} x ${unit}`
    )
  }
})

console.log('\nEvery half-hour duration, which is where this went wrong')

for (const hours of [1.5, 2.5, 3.5, 4.5]) {
  check(`${hours}h - adding a player always costs the same`, () => {
    const unit = perExtraPlayerCharge(EXTRA, hours)
    let previous = 0
    for (const count of [1, 2, 3, 4]) {
      const total = extraPlayersCharge(count, EXTRA, hours)
      assert.equal(total - previous, unit, `player ${count} cost ${total - previous}, not ${unit}`)
      previous = total
    }
  })
}

console.log('\nWhole hours are unchanged')

for (const hours of [1, 2, 3, 4, 5]) {
  check(`${hours}h - still exactly rate x players x hours`, () => {
    assert.equal(extraPlayersCharge(2, EXTRA, hours), 2 * EXTRA * hours)
  })
}

console.log('\nEdges')

check('no extra players costs nothing', () => {
  assert.equal(extraPlayersCharge(0, EXTRA, 2.5), 0)
})

check('a negative count cannot credit the customer', () => {
  assert.equal(extraPlayersCharge(-3, EXTRA, 2.5), 0)
})

check('a device type with no extra charge stays free', () => {
  assert.equal(extraPlayersCharge(3, 0, 1.5), 0)
})

console.log('\nDevice charge rounds the same way the booking screens show it')

check('1.5h at ₹379/h is ₹569, matching the slot picker', () => {
  assert.equal(deviceCharge(HOURLY, 1.5), 569)
})

check('whole hours are exact', () => {
  assert.equal(deviceCharge(HOURLY, 2), 758)
})

check('every price is a whole rupee', () => {
  for (const hours of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
    assert.equal(deviceCharge(HOURLY, hours) % 1, 0, `${hours}h produced paise`)
    assert.equal(extraPlayersCharge(3, EXTRA, hours) % 1, 0, `${hours}h produced paise`)
  }
})

console.log('\nThe rounding primitives')

check('roundRupees takes a half rupee upwards', () => {
  assert.equal(roundRupees(118.5), 119)
  assert.equal(roundRupees(118.49), 118)
})

check('round2 still keeps paise, for discounts', () => {
  assert.equal(round2(118.505), 118.51)
  assert.equal(round2(118.5), 118.5)
})

console.log(
  failures === 0
    ? '\nAll player charge checks passed.\n'
    : `\n${failures} player charge check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
