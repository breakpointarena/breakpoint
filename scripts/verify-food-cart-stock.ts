/**
 * A cart can never hold more of something than the kitchen has.
 *
 *   npm run test:cart
 *
 * The reported case: an item with one left, added four times. Three separate
 * buttons reach this cart - Add on a menu card, the stepper beside it, and the
 * stepper on the checkout page - and each was checked, or not checked, on its
 * own. Add was checked for "is there any at all" and not for "is there another
 * one", and the checkout stepper dispatched straight through. So the assertions
 * below are written against the reducer rather than against any of the three:
 * it is the only thing all of them have to go through, and the only place a
 * fourth button added later inherits the rule for free.
 *
 * None of this is what finally refuses an oversell - stock can run out between
 * loading the menu and paying, and only the server-side quote sees that. This is
 * what stops a customer building an order that was never fillable.
 */

import assert from 'node:assert/strict'
import reducer, {
  addToCart,
  decrementQuantity,
  incrementQuantity,
  removeFromCart,
  updateQuantity,
  type FoodCartItem,
} from '../lib/redux/slices/foodCartSlice'

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

/** A menu row as the Add button passes it on. */
function coke(available: number) {
  return {
    menu_item_id: 'coke',
    name: 'Coke',
    category: 'Drinks',
    price: 40,
    available,
  }
}

type State = ReturnType<typeof reducer>

const empty: State = reducer(undefined, { type: '@@INIT' })

/** Apply a list of actions in order, from empty unless a state is given. */
function run(actions: any[], from: State = empty): State {
  return actions.reduce((state, action) => reducer(state, action), from)
}

const line = (state: State, id = 'coke'): FoodCartItem | undefined =>
  state.items.find((item) => item.menu_item_id === id)

console.log('\nThe reported case: one in stock')

check('a second Add does not put a second one in the cart', () => {
  const state = run([addToCart(coke(1)), addToCart(coke(1))])
  assert.equal(line(state)?.quantity, 1)
})

check('and neither does a tenth', () => {
  const state = run(Array.from({ length: 10 }, () => addToCart(coke(1))))
  assert.equal(line(state)?.quantity, 1)
})

check('the stepper cannot get past it either', () => {
  const state = run([addToCart(coke(1)), incrementQuantity('coke'), incrementQuantity('coke')])
  assert.equal(line(state)?.quantity, 1)
})

check('nor can typing a quantity straight in', () => {
  const state = run([
    addToCart(coke(1)),
    updateQuantity({ menu_item_id: 'coke', quantity: 25 }),
  ])
  assert.equal(line(state)?.quantity, 1)
})

console.log('\nWith more on the shelf')

check('three can be added when three are in stock', () => {
  const state = run([addToCart(coke(3)), addToCart(coke(3)), addToCart(coke(3))])
  assert.equal(line(state)?.quantity, 3)
})

check('and the fourth is refused', () => {
  const state = run(Array.from({ length: 4 }, () => addToCart(coke(3))))
  assert.equal(line(state)?.quantity, 3)
})

check('the stepper fills the same room and stops', () => {
  const state = run([
    addToCart(coke(3)),
    incrementQuantity('coke'),
    incrementQuantity('coke'),
    incrementQuantity('coke'),
  ])
  assert.equal(line(state)?.quantity, 3)
})

check('an item with nothing left never enters the cart at all', () => {
  const state = run([addToCart(coke(0))])
  assert.equal(state.items.length, 0)
})

console.log('\nWhen the shelf changes under the cart')

check('a restock raises the cap on the line already there', () => {
  // The customer loaded the menu when one was left, and by the time they pressed
  // Add again the kitchen had put out more. What the menu says now is fresher.
  const state = run([addToCart(coke(1)), addToCart(coke(5))])
  assert.equal(line(state)?.quantity, 2)
  assert.equal(line(state)?.available, 5)
})

check('a drop lowers it, and holds what is already in the cart', () => {
  // Not trimmed down: the customer put three in the cart when three were there.
  // Refusing to *add* is this reducer's job; deciding what happens to an order
  // that outran its stock belongs to the server-side quote, which prices it.
  const before = run([addToCart(coke(3)), addToCart(coke(3)), addToCart(coke(3))])
  const after = run([addToCart(coke(1))], before)
  assert.equal(after.items[0].available, 1)
  assert.equal(after.items[0].quantity, 3)
})

console.log('\nEverything else the cart still has to do')

check('a line can be reduced and removed', () => {
  const state = run([addToCart(coke(3)), addToCart(coke(3)), decrementQuantity('coke')])
  assert.equal(line(state)?.quantity, 1)
  assert.equal(reducer(state, decrementQuantity('coke')).items.length, 0)
})

check('quantity zero removes the line', () => {
  const state = run([
    addToCart(coke(3)),
    updateQuantity({ menu_item_id: 'coke', quantity: 0 }),
  ])
  assert.equal(state.items.length, 0)
})

check('removing one line leaves the others alone', () => {
  const fries = { ...coke(2), menu_item_id: 'fries', name: 'Fries' }
  const state = run([addToCart(coke(2)), addToCart(fries), removeFromCart('coke')])
  assert.equal(state.items.length, 1)
  assert.equal(line(state, 'fries')?.quantity, 1)
})

check('a stepper on an item not in the cart does nothing', () => {
  assert.equal(reducer(empty, incrementQuantity('coke')).items.length, 0)
})

console.log(
  failures === 0
    ? '\nAll food cart stock checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
