/**
 * Which start times a device type can offer.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:availability
 *
 * This arithmetic used to live inside the `checkFlexibleAvailability` server
 * action, which meant the slot picker asked the server again every time the
 * customer tried a different duration - even though the bookings behind the
 * answer are identical for every duration. It now lives in a pure module the
 * browser runs itself, so these cases pin the behaviour that moved.
 */

import assert from 'node:assert/strict'
import {
  availableStartMinutes,
  isRangeAvailable,
  MINUTES_PER_DAY,
  type DeviceTypeOccupancy
} from '../lib/bookings/slotAvailability'
import { formatMinutesTo12Hour } from '../lib/utils/timeSlots'

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

/** Minutes from midnight, from a 24-hour clock reading. */
const at = (hours: number, minutes = 0) => hours * 60 + minutes

console.log('\nA single station, booked 10:00-11:00')

const oneStationBusyAtTen: DeviceTypeOccupancy = {
  totalDevices: 1,
  occupied: [{ device: 0, start: at(10), end: at(11) }]
}

check('10:00 itself is refused', () => {
  assert.equal(isRangeAvailable(oneStationBusyAtTen, at(10), 60), false)
})

check('09:30 for an hour is refused - it runs into the booking', () => {
  assert.equal(isRangeAvailable(oneStationBusyAtTen, at(9, 30), 60), false)
})

check('09:30 for 30 minutes is fine - it ends exactly as the booking starts', () => {
  assert.equal(isRangeAvailable(oneStationBusyAtTen, at(9, 30), 30), true)
})

check('11:00 is fine - a booking ending is not a booking overlapping', () => {
  assert.equal(isRangeAvailable(oneStationBusyAtTen, at(11), 60), true)
})

check('08:00 for three hours is refused, for two is fine', () => {
  assert.equal(isRangeAvailable(oneStationBusyAtTen, at(8), 180), false)
  assert.equal(isRangeAvailable(oneStationBusyAtTen, at(8), 120), true)
})

console.log('\nWhy it counts stations and not rows')

check('one station with two back-to-back bookings is still one busy station', () => {
  // Counting rows would make this look like two stations busy and hide a slot
  // the second station can still take.
  const twoStations: DeviceTypeOccupancy = {
    totalDevices: 2,
    occupied: [
      { device: 0, start: at(10), end: at(11) },
      { device: 0, start: at(11), end: at(12) }
    ]
  }
  assert.equal(isRangeAvailable(twoStations, at(10), 120), true)
})

check('two different stations busy across the window leaves nothing free', () => {
  const twoStations: DeviceTypeOccupancy = {
    totalDevices: 2,
    occupied: [
      { device: 0, start: at(10), end: at(11) },
      { device: 1, start: at(10), end: at(11) }
    ]
  }
  assert.equal(isRangeAvailable(twoStations, at(10), 60), false)
})

console.log('\nBookings that cross midnight, rebased onto the day being asked about')

check("yesterday's overnight booking still holds this morning", () => {
  // 23:00 yesterday to 01:00 today, rebased: -60 to 60.
  const overnight: DeviceTypeOccupancy = {
    totalDevices: 1,
    occupied: [{ device: 0, start: -60, end: 60 }]
  }
  assert.equal(isRangeAvailable(overnight, at(0), 60), false)
  assert.equal(isRangeAvailable(overnight, at(0, 30), 30), false)
  assert.equal(isRangeAvailable(overnight, at(1), 60), true)
})

check("a late start that runs into tomorrow sees tomorrow's bookings", () => {
  // 00:30 to 02:00 tomorrow, rebased: 1470 to 1560.
  const tomorrowMorning: DeviceTypeOccupancy = {
    totalDevices: 1,
    occupied: [{ device: 0, start: MINUTES_PER_DAY + 30, end: MINUTES_PER_DAY + 120 }]
  }
  // 11:30 PM for two hours would end at 01:30 AM, inside that booking.
  assert.equal(isRangeAvailable(tomorrowMorning, at(23, 30), 120), false)
  // For half an hour it finishes at midnight, before the booking begins.
  assert.equal(isRangeAvailable(tomorrowMorning, at(23, 30), 30), true)
})

console.log('\nA full day of offers')

check('an empty arena offers all 48 half hours', () => {
  const free: DeviceTypeOccupancy = { totalDevices: 3, occupied: [] }
  assert.equal(availableStartMinutes(free, 60).length, 48)
})

check('a device type with no stations in service offers nothing', () => {
  const none: DeviceTypeOccupancy = { totalDevices: 0, occupied: [] }
  assert.equal(availableStartMinutes(none, 60).length, 0)
})

check('the same occupancy answers every duration without refetching', () => {
  // The property the picker relies on: one fetch, many durations. The longer
  // the booking, the fewer starts fit around a fixed obstruction.
  const busyMidday: DeviceTypeOccupancy = {
    totalDevices: 1,
    occupied: [{ device: 0, start: at(12), end: at(14) }]
  }

  const halfHour = availableStartMinutes(busyMidday, 30)
  const twoHours = availableStartMinutes(busyMidday, 120)

  assert.ok(twoHours.length < halfHour.length, 'a longer booking must have fewer options')
  // 30-minute slots lose exactly the four starts inside 12:00-14:00.
  assert.equal(halfHour.length, 44)
  assert.ok(!halfHour.includes(at(12)))
  assert.ok(!halfHour.includes(at(13, 30)))
  assert.ok(halfHour.includes(at(14)))
})

console.log('\nMinutes become the labels the grid matches on')

check('midnight and noon read the way the grid expects', () => {
  assert.equal(formatMinutesTo12Hour(0), '12:00 AM')
  assert.equal(formatMinutesTo12Hour(at(12)), '12:00 PM')
  assert.equal(formatMinutesTo12Hour(at(13, 30)), '01:30 PM')
  assert.equal(formatMinutesTo12Hour(at(23, 30)), '11:30 PM')
})

check('a minute past midnight wraps rather than inventing a 24th hour', () => {
  assert.equal(formatMinutesTo12Hour(MINUTES_PER_DAY + 30), '12:30 AM')
})

check('every offered start formats to one of the 48 grid labels', () => {
  const free: DeviceTypeOccupancy = { totalDevices: 1, occupied: [] }
  const labels = availableStartMinutes(free, 60).map(formatMinutesTo12Hour)
  assert.equal(new Set(labels).size, 48)
  assert.ok(labels.every((label) => /^(0\d|1[0-2]):[03]0 (AM|PM)$/.test(label)))
})

console.log(
  failures === 0
    ? '\nAll slot availability checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
