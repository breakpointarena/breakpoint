import assert from 'node:assert/strict'
import {
  calculateHourPassRedemption,
  isHourPackEligibleForDevice,
} from '../lib/subscriptions/hourPass'
import { revenueSplit } from '../lib/payments/revenueSplit'

const fullBalance = calculateHourPassRedemption(60, 600, 1900, 1900)
assert.deepEqual(fullBalance, { minutesUsed: 60, amountCovered: 1900 })

const partialBalance = calculateHourPassRedemption(60, 20, 1900, 1900)
assert.deepEqual(partialBalance, { minutesUsed: 20, amountCovered: 633.33 })

const subscribedPlayer = calculateHourPassRedemption(60, 600, 1900, 1900)
const companionWithoutPass = calculateHourPassRedemption(60, 0, 1900, 1900)
assert.equal(subscribedPlayer.minutesUsed, 60)
assert.equal(companionWithoutPass.minutesUsed, 0)
assert.equal(subscribedPlayer.amountCovered + companionWithoutPass.amountCovered, 1900)

assert.equal(isHourPackEligibleForDevice('american-pool', 'american-pool'), true)
assert.equal(isHourPackEligibleForDevice('american-pool', 'medium-snooker'), false)
assert.equal(isHourPackEligibleForDevice('american-pool', null), false)
assert.equal(isHourPackEligibleForDevice(null, 'medium-snooker'), true)

const freePlayStillConsumesTime = calculateHourPassRedemption(60, 60, 0, 0)
assert.deepEqual(freePlayStillConsumesTime, { minutesUsed: 60, amountCovered: 0 })

const noPass = calculateHourPassRedemption(60, 0, 1900, 1900)
assert.deepEqual(noPass, { minutesUsed: 0, amountCovered: 0 })

const billAfterPersonalPass = revenueSplit({
  deviceSubtotal: 3800,
  foodSubtotal: 500,
  hourPassDiscount: 1900,
  amountPaid: 2400,
})
assert.equal(billAfterPersonalPass.deviceCharged, 1900)
assert.equal(billAfterPersonalPass.foodCharged, 500)
assert.equal(billAfterPersonalPass.collected, 2400)

console.log('Hour-pack balance, category matching, and personal-share calculations passed.')
