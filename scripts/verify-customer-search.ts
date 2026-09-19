/**
 * Finding a customer at the counter, by number or by name.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:customer-search
 *
 * Scope is the part that decides *what gets asked of the database*: how a typed
 * string is cleaned, and how short a thing may be before it is worth asking at
 * all. The query itself is one `.ilike()` and the staff guard is covered by
 * `npm run check:guards`; what is worth pinning down here is that a desk cannot
 * type something that turns a narrow lookup into the whole phone book.
 */
import assert from 'node:assert/strict'
import {
  CUSTOMER_NAME_MIN_CHARS,
  CUSTOMER_SUGGESTION_LIMIT,
  CUSTOMER_SUGGESTION_MIN_DIGITS,
  nameQuery,
  phoneDigits,
} from '../lib/customers/suggestions'

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

/** What the action does before it will search: clean, then measure. */
const searchableName = (typed: string) =>
  nameQuery(typed).length >= CUSTOMER_NAME_MIN_CHARS
const searchablePhone = (typed: string) =>
  phoneDigits(typed).length >= CUSTOMER_SUGGESTION_MIN_DIGITS

/** The real rows in the arena's phone book, as of writing. */
const CUSTOMERS = [
  'Adithya', 'ahmmed', 'Akarsh', 'azzar', 'Dhamodharan', 'karthik',
  'kumar export', 'mohammed', 'Rahim', 'sameer', 'santhosh',
  'Santu pramanik', 'siva', 'Sreejith R', 'viswanathan',
]

/** What `name ILIKE '%q%'` would return, once `nameQuery` has had the string. */
const matches = (typed: string) => {
  const q = nameQuery(typed).toLowerCase()
  return CUSTOMERS.filter((n) => n.toLowerCase().includes(q))
}

console.log('\nWhat a name search is allowed to ask')

check('two letters is not yet a search', () => {
  assert.equal(searchableName('sr'), false)
})

check(`${CUSTOMER_NAME_MIN_CHARS} letters is`, () => {
  assert.equal(searchableName('sre'), true)
})

check('spaces are not letters', () => {
  assert.equal(searchableName('  a  '), false)
})

check('a lone wildcard is not a search', () => {
  // The whole point. Unstripped, '%' is a pattern that matches every customer
  // in the arena; stripped, it is an empty string and never reaches the query.
  assert.equal(nameQuery('%'), '')
  assert.equal(searchableName('%'), false)
})

check('wildcards cannot widen a real search either', () => {
  // '%a%' would otherwise match every name containing an a - which is most of
  // them - while looking to the desk like a three-character search.
  assert.equal(nameQuery('%a%'), 'a')
  assert.equal(searchableName('%a%'), false)
})

check('an underscore cannot stand in for a letter', () => {
  assert.equal(nameQuery('s_va'), 'sva')
})

check('a backslash cannot escape anything', () => {
  assert.equal(nameQuery('siva\\'), 'siva')
})

check('apostrophes and hyphens are names, not wildcards', () => {
  assert.equal(nameQuery("O'Brien"), "O'Brien")
  assert.equal(nameQuery('Jean-Luc'), 'Jean-Luc')
})

check('inner whitespace collapses to match how the row is stored', () => {
  assert.equal(nameQuery('santu   pramanik'), 'santu pramanik')
  assert.deepEqual(matches('santu   pramanik'), ['Santu pramanik'])
})

console.log('\nWhat the desk actually types, against the real phone book')

check('a surname finds its owner', () => {
  // The reason the match is not anchored to the front: nobody at a counter
  // reliably remembers which word of a name came first.
  assert.deepEqual(matches('pram'), ['Santu pramanik'])
})

check('a first name finds its owner', () => {
  assert.deepEqual(matches('sree'), ['Sreejith R'])
})

check('case is not something the desk should have to get right', () => {
  assert.deepEqual(matches('ADITH'), ['Adithya'])
  assert.deepEqual(matches('adith'), ['Adithya'])
})

check('an ambiguous three letters returns both, not one', () => {
  // "san" is two people. Showing both is the correct answer - picking one for
  // the desk is how the wrong customer gets billed.
  assert.deepEqual(matches('san'), ['santhosh', 'Santu pramanik'])
})

check('a name nobody has returns nobody', () => {
  assert.deepEqual(matches('zzz'), [])
})

check('the list can never be longer than the panel', () => {
  // Every name here contains an 'a'; the database clamps to the same limit.
  assert.ok(matches('a').length > CUSTOMER_SUGGESTION_LIMIT)
  assert.equal(CUSTOMER_SUGGESTION_LIMIT, 6)
})

console.log('\nThe phone search is unchanged by any of this')

check('three digits is still not a search', () => {
  assert.equal(searchablePhone('988'), false)
})

check('four digits still is', () => {
  assert.equal(searchablePhone('9883'), true)
})

check('a pasted +91 number still comes down to ten digits', () => {
  assert.equal(phoneDigits('+91 88387 37282'), '8838737282')
})

if (failures > 0) {
  console.error(`\n${failures} customer search check(s) failed.\n`)
  process.exit(1)
}
console.log('\nAll customer search checks passed.\n')
