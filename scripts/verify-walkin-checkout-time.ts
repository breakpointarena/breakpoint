/**
 * The checkout time a person states, rather than the one the clock observes.
 *
 *   npm run test:checkout-time
 *
 * Scope is `resolveCheckoutTime`: what the desk is allowed to say, and what it
 * is stopped from saying. The pricing that follows is already covered by
 * `npm run test:walkin`, and the database repeats both of these checks itself -
 * this is the half that can answer the desk instantly, before a round trip.
 */
import assert from 'node:assert/strict'
import { resolveCheckoutTime } from '../lib/bookings/walkInSession'

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

/** 14:00 IST on 19 Sep 2026, as the instant the database would hold. */
const NOW = new Date('2026-09-19T08:30:00Z')
/** Checked in at 11:00 IST the same day. */
const STARTED = '2026-09-19T05:30:00Z'

const at = (date: string, clock: string, checkedInAt = STARTED) =>
  resolveCheckoutTime({ date, clock, checkedInAt }, NOW)

console.log('\nAn ordinary checkout')

check('an hour into the session is fine', () => {
  const r = at('2026-09-19', '12:00')
  assert.equal(r.ok, true)
})

check('this very minute is fine', () => {
  const r = at('2026-09-19', '14:00')
  assert.equal(r.ok, true)
})

check('seconds are accepted and kept', () => {
  const r = at('2026-09-19', '12:30:45')
  assert.equal(r.ok && r.clock, '12:30:45')
})

check('a bare HH:MM is padded to seconds', () => {
  const r = at('2026-09-19', '12:30')
  assert.equal(r.ok && r.clock, '12:30:00')
})

console.log('\nWhat the desk is stopped from saying')

check('before the session started is refused', () => {
  const r = at('2026-09-19', '10:00')
  assert.equal(r.ok, false)
  assert.match((r as any).error, /after that/)
})

check('the exact moment of check-in is refused', () => {
  // A zero-length session is not a session, and would price as nothing.
  const r = at('2026-09-19', '11:00')
  assert.equal(r.ok, false)
})

check('later today is refused', () => {
  const r = at('2026-09-19', '16:00')
  assert.equal(r.ok, false)
  assert.match((r as any).error, /future/)
})

check('tomorrow is refused', () => {
  // The slip this exists for: picking the wrong day off a date picker, which
  // would otherwise bill an extra day and look like a plausible total.
  const r = at('2026-09-20', '12:00')
  assert.equal(r.ok, false)
  assert.match((r as any).error, /future/)
})

check('a missing date is refused', () => {
  assert.equal(at('', '12:00').ok, false)
})

check('a malformed date is refused', () => {
  assert.equal(at('19-09-2026', '12:00').ok, false)
})

check('a malformed time is refused', () => {
  assert.equal(at('2026-09-19', '2pm').ok, false)
})

check('a session with no check-in time is refused', () => {
  assert.equal(at('2026-09-19', '12:00', null as any).ok, false)
})

console.log('\nThe forgotten session, which is why there is no floor')

check('a session left open since Friday can be closed at Friday night', () => {
  // Checked in Friday 20:00 IST, noticed Monday. The bill must be the three
  // hours actually played, not the three days the row sat open.
  const friday = '2026-09-11T14:30:00Z' // 20:00 IST on 11 Sep
  const r = resolveCheckoutTime(
    { date: '2026-09-11', clock: '23:00', checkedInAt: friday },
    NOW
  )
  assert.equal(r.ok, true)
})

check('and a session that ran past midnight closes on the next date', () => {
  const lateFriday = '2026-09-11T17:30:00Z' // 23:00 IST on 11 Sep
  const r = resolveCheckoutTime(
    { date: '2026-09-12', clock: '01:30', checkedInAt: lateFriday },
    NOW
  )
  assert.equal(r.ok, true)
})

if (failures > 0) {
  console.error(`\n${failures} checkout time check(s) failed.\n`)
  process.exit(1)
}
console.log('\nAll checkout time checks passed.\n')
