/**
 * What a cancelled booking gives back to the fridge.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:cancel
 *
 * Scope is the arithmetic: which food rows are credited, and how much of each.
 * The rest of cancelling - the status guards, the update that only lands on a
 * `confirmed` row - lives in the database round trip and is not exercised here.
 */

import assert from 'node:assert/strict'
import {
  foodItemsToCancel,
  stockToRestore,
  type CancellableFoodItem,
} from '../lib/bookings/cancellation'

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

const item = (over: Partial<CancellableFoodItem> = {}): CancellableFoodItem => ({
  id: 'row-1',
  menu_item_id: 'menu-1',
  quantity: 1,
  status: 'pending',
  ...over,
})

console.log('\nCancellation restock\n')

check('a single pending row is credited back', () => {
  assert.deepEqual(stockToRestore([item({ quantity: 3 })]), [{ menuItemId: 'menu-1', quantity: 3 }])
})

check('two rows of the same item are credited as one total', () => {
  const restored = stockToRestore([
    item({ id: 'a', quantity: 2 }),
    item({ id: 'b', quantity: 4 }),
  ])
  assert.deepEqual(restored, [{ menuItemId: 'menu-1', quantity: 6 }])
})

check('different items are credited separately', () => {
  const restored = stockToRestore([
    item({ id: 'a', menu_item_id: 'menu-1', quantity: 2 }),
    item({ id: 'b', menu_item_id: 'menu-2', quantity: 1 }),
  ])
  assert.deepEqual(restored, [
    { menuItemId: 'menu-1', quantity: 2 },
    { menuItemId: 'menu-2', quantity: 1 },
  ])
})

check('an already-cancelled row is not credited twice', () => {
  const restored = stockToRestore([
    item({ id: 'a', quantity: 2, status: 'cancelled' }),
    item({ id: 'b', quantity: 5 }),
  ])
  assert.deepEqual(restored, [{ menuItemId: 'menu-1', quantity: 5 }])
})

check('a row whose menu item was deleted is skipped', () => {
  assert.deepEqual(stockToRestore([item({ menu_item_id: null, quantity: 2 })]), [])
})

check('missing or nonsense quantities are skipped', () => {
  const restored = stockToRestore([
    item({ id: 'a', quantity: null }),
    item({ id: 'b', quantity: 0 }),
    item({ id: 'c', quantity: -3 }),
  ])
  assert.deepEqual(restored, [])
})

check('a booking with no food restores nothing', () => {
  assert.deepEqual(stockToRestore([]), [])
  assert.deepEqual(foodItemsToCancel([]), [])
})

check('only rows not already cancelled are marked', () => {
  const ids = foodItemsToCancel([
    item({ id: 'a' }),
    item({ id: 'b', status: 'cancelled' }),
    item({ id: 'c', status: 'served' }),
  ])
  assert.deepEqual(ids, ['a', 'c'])
})

console.log('')
if (failures > 0) {
  console.error(`${failures} check(s) failed\n`)
  process.exit(1)
}
console.log('All checks passed\n')
