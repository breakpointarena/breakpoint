/**
 * The AM/PM time field, and the round trip through what happy hours store.
 *
 *   npm run test:timefield
 *
 * Staff were entering happy hour times into `<input type="time">`, which renders
 * in whatever format the browser's locale prefers - on the machines here, 24
 * hours. The field that replaced it asks for hour, minute and AM/PM separately,
 * and hands the form the same 24-hour value the old input did.
 *
 * Which puts a 12-hour conversion on the path of every happy hour rule, in both
 * directions: opening one to edit converts the stored "06:00 PM" back into the
 * three selects, and saving converts it forward again. Noon and midnight are
 * where that goes wrong, and it goes wrong invisibly - the form still reads
 * 12:00, the promotion just runs at the other end of the day.
 */

import assert from 'node:assert/strict'
import { toParts, toTime24 } from '../components/ui/time-of-day-field'
import { formatDbTimeRange, formatTo24Hour } from '../lib/utils/timeSlots'

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

console.log('\nReading a stored time into the three selects')

check('an evening time', () => {
  assert.deepEqual(toParts('18:30'), { hour: 6, minute: 30, meridiem: 'PM' })
})

check('a morning time', () => {
  assert.deepEqual(toParts('09:05'), { hour: 9, minute: 5, meridiem: 'AM' })
})

check('midnight is 12 AM, not 0 AM', () => {
  assert.deepEqual(toParts('00:00'), { hour: 12, minute: 0, meridiem: 'AM' })
})

check('noon is 12 PM, not 0 PM', () => {
  assert.deepEqual(toParts('12:00'), { hour: 12, minute: 0, meridiem: 'PM' })
})

check('half past midnight is still AM', () => {
  assert.deepEqual(toParts('00:30'), { hour: 12, minute: 30, meridiem: 'AM' })
})

check('one in the afternoon', () => {
  assert.deepEqual(toParts('13:00'), { hour: 1, minute: 0, meridiem: 'PM' })
})

check('the last minute of the day', () => {
  assert.deepEqual(toParts('23:59'), { hour: 11, minute: 59, meridiem: 'PM' })
})

console.log('\nNothing to read')

check('an empty field has no parts', () => {
  assert.equal(toParts(''), null)
  assert.equal(toParts(undefined), null)
})

check('and neither does something that is not a time', () => {
  assert.equal(toParts('half past six'), null)
  assert.equal(toParts('25:00'), null)
})

console.log('\nWriting the selects back out')

check('12 AM is midnight', () => {
  assert.equal(toTime24({ hour: 12, minute: 0, meridiem: 'AM' }), '00:00')
})

check('12 PM is noon', () => {
  assert.equal(toTime24({ hour: 12, minute: 0, meridiem: 'PM' }), '12:00')
})

check('6 PM is 18:00', () => {
  assert.equal(toTime24({ hour: 6, minute: 0, meridiem: 'PM' }), '18:00')
})

check('a single-digit hour is padded', () => {
  assert.equal(toTime24({ hour: 9, minute: 5, meridiem: 'AM' }), '09:05')
})

console.log('\nEvery hour of the day survives the round trip')

check('open a rule, save it unchanged, and it is the same rule', () => {
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 5, 30, 45, 59]) {
      const stored = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const parts = toParts(stored)
      assert.notEqual(parts, null, `${stored} should be readable`)
      assert.equal(toTime24(parts!), stored, `${stored} came back different`)
    }
  }
})

console.log('\nAnd through the form as happy hours actually store it')

check('an evening promotion reads as staff wrote it', () => {
  // What the modal does on submit: the field hands it 24-hour, and the rule is
  // stored as the display range the pricing code reads back.
  assert.equal(formatDbTimeRange('18:00', '21:00'), '06:00 PM - 09:00 PM')
})

check('a rule spanning noon says PM on the right side of it', () => {
  assert.equal(formatDbTimeRange('11:30', '12:30'), '11:30 AM - 12:30 PM')
})

check('a late rule running to midnight', () => {
  assert.equal(formatDbTimeRange('22:00', '00:00'), '10:00 PM - 12:00 AM')
})

check('and the edit modal reads that back to where it started', () => {
  for (const stored of ['06:00 PM - 09:00 PM', '11:30 AM - 12:30 PM', '10:00 PM - 12:00 AM']) {
    const [start, end] = stored.split(' - ').map((part) => formatTo24Hour(part.trim()))
    assert.equal(formatDbTimeRange(start, end), stored, `${stored} did not survive editing`)
  }
})

console.log(
  failures === 0
    ? '\nAll time-of-day field checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
