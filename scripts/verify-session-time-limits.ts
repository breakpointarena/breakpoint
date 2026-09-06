/**
 * Sessions approaching their end time, and sessions past it.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:time-limits
 *
 * A booking sold for a fixed slot has a time it is supposed to end, and until
 * now nothing said so: the desk found out a customer had run over only by
 * reading the slot column and doing the arithmetic themselves. `sessionTimeStatus`
 * does that arithmetic, and everything downstream - the badge on the row and the
 * notification that chimes - is a rendering of its answer, so this is the thing
 * worth pinning down.
 *
 * `now` is injected throughout. These assertions must mean the same thing at
 * 3am as at noon, and a rule about clock time tested against the wall clock
 * passes or fails depending on when the suite is run.
 */

import assert from 'node:assert/strict'
import {
  ENDING_SOON_MINUTES,
  STARTING_SOON_MINUTES,
  bookingAttention,
  sessionTimeStatus,
} from '../lib/bookings/attention'

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

/**
 * An instant expressed on the arena's clock.
 *
 * The rules read arena wall-clock time, so the fixtures have to be pinned to a
 * real instant that lands on the intended arena reading. +05:30 is Asia/Kolkata,
 * which has no daylight saving, so this is stable year-round.
 */
function arenaInstant(clock: string, date = '2026-08-17'): Date {
  return new Date(`${date}T${clock}+05:30`)
}

/** A session being played now, sold as a fixed slot ending at `endTime`. */
function liveBooking(endTime: string, startTime = '16:00:00') {
  return {
    status: 'checked_in',
    checked_in_at: arenaInstant(startTime).toISOString(),
    billed_on_actual_time: false,
    total_amount: 500,
    amount_paid: 500,
    booking_device_slots: [
      { slot_date: '2026-08-17', slot_start_time: startTime, slot_end_time: endTime },
    ],
  }
}

console.log('\nThe reported case: a session due to finish at 18:00')

check('quiet while there is still an hour to go', () => {
  assert.equal(sessionTimeStatus(liveBooking('18:00:00'), arenaInstant('17:00:00')), null)
})

check('warns once inside the window', () => {
  const status = sessionTimeStatus(liveBooking('18:00:00'), arenaInstant('17:57:00'))
  assert.equal(status?.kind, 'ending_soon')
  assert.equal(status?.kind === 'ending_soon' && status.minutesLeft, 3)
  assert.equal(status?.endsAtClock, '06:00 PM')
})

check(`the window opens exactly ${ENDING_SOON_MINUTES} minutes out`, () => {
  const outside = sessionTimeStatus(liveBooking('18:00:00'), arenaInstant('17:54:00'))
  const inside = sessionTimeStatus(liveBooking('18:00:00'), arenaInstant('17:55:00'))
  assert.equal(outside, null)
  assert.equal(inside?.kind, 'ending_soon')
})

check('turns into an overrun the moment it passes', () => {
  const status = sessionTimeStatus(liveBooking('18:00:00'), arenaInstant('18:01:00'))
  assert.equal(status?.kind, 'overrunning')
  assert.equal(status?.kind === 'overrunning' && status.minutesOver, 1)
})

check('counts how far over it has run', () => {
  const status = sessionTimeStatus(liveBooking('18:00:00'), arenaInstant('18:25:00'))
  assert.equal(status?.kind === 'overrunning' && status.minutesOver, 25)
})

console.log('\nSessions that must never be flagged')

check('a walk-in has no time to run out of', () => {
  // Billed on actual play: the block it holds reserves a station, it does not
  // promise an end, so running long is the normal case rather than a problem.
  const walkIn = { ...liveBooking('18:00:00'), billed_on_actual_time: true }
  assert.equal(sessionTimeStatus(walkIn, arenaInstant('19:30:00')), null)
})

check('a booking nobody has checked in to', () => {
  const waiting = { ...liveBooking('18:00:00'), status: 'confirmed' }
  assert.equal(sessionTimeStatus(waiting, arenaInstant('18:30:00')), null)
})

check('a session already closed', () => {
  const done = { ...liveBooking('18:00:00'), status: 'completed' }
  assert.equal(sessionTimeStatus(done, arenaInstant('18:30:00')), null)
})

check('a row carrying no slot at all', () => {
  const noSlot = { ...liveBooking('18:00:00'), booking_device_slots: [] }
  assert.equal(sessionTimeStatus(noSlot, arenaInstant('18:30:00')), null)
})

console.log('\nBookings that run past midnight')

check('23:30 to 00:30 is not an hour overdue at 23:40', () => {
  // The end time being lower than the start is exactly how these rows are
  // stored. Compared naively, 00:30 reads as nearly a day in the past and the
  // session looks massively overrun while it is still being played.
  const overnight = liveBooking('00:30:00', '23:30:00')
  assert.equal(sessionTimeStatus(overnight, arenaInstant('23:40:00')), null)
})

check('and does warn as its real end approaches, on the following date', () => {
  const overnight = liveBooking('00:30:00', '23:30:00')
  const status = sessionTimeStatus(overnight, arenaInstant('00:27:00', '2026-08-18'))
  assert.equal(status?.kind, 'ending_soon')
  assert.equal(status?.kind === 'ending_soon' && status.minutesLeft, 3)
})

check('and runs over once the following date passes 00:30', () => {
  const overnight = liveBooking('00:30:00', '23:30:00')
  const status = sessionTimeStatus(overnight, arenaInstant('00:45:00', '2026-08-18'))
  assert.equal(status?.kind, 'overrunning')
  assert.equal(status?.kind === 'overrunning' && status.minutesOver, 15)
})

console.log('\nThe multi-slot case')

check('the last slot to finish is the one that counts', () => {
  const twoSlots = {
    ...liveBooking('17:00:00'),
    booking_device_slots: [
      { slot_date: '2026-08-17', slot_start_time: '16:00:00', slot_end_time: '17:00:00' },
      { slot_date: '2026-08-17', slot_start_time: '17:00:00', slot_end_time: '19:00:00' },
    ],
  }
  // 17:30 is past the first slot's end and well inside the second.
  assert.equal(sessionTimeStatus(twoSlots, arenaInstant('17:30:00')), null)
  assert.equal(sessionTimeStatus(twoSlots, arenaInstant('18:57:00'))?.kind, 'ending_soon')
})

console.log('\nBookings about to start')

/** Booked and paid for, nobody arrived yet, due to start at `startTime`. */
function upcomingBooking(startTime = '18:00:00', endTime = '20:00:00') {
  return {
    status: 'confirmed',
    checked_in_at: null,
    billed_on_actual_time: false,
    total_amount: 500,
    amount_paid: 500,
    booking_device_slots: [
      { slot_date: '2026-08-17', slot_start_time: startTime, slot_end_time: endTime },
    ],
  }
}

check('quiet half an hour out', () => {
  assert.equal(sessionTimeStatus(upcomingBooking(), arenaInstant('17:30:00')), null)
})

check('warns once inside the window, and names the start', () => {
  const status = sessionTimeStatus(upcomingBooking(), arenaInstant('17:57:00'))
  assert.equal(status?.kind, 'starting_soon')
  assert.equal(status?.kind === 'starting_soon' && status.minutesUntilStart, 3)
  assert.equal(status?.kind === 'starting_soon' && status.startsAtClock, '06:00 PM')
})

check(`the window opens exactly ${STARTING_SOON_MINUTES} minutes out`, () => {
  assert.equal(sessionTimeStatus(upcomingBooking(), arenaInstant('17:54:00')), null)
  assert.equal(
    sessionTimeStatus(upcomingBooking(), arenaInstant('17:55:00'))?.kind,
    'starting_soon'
  )
})

check('goes quiet once the start has passed', () => {
  // Past its start and still not checked in is lateness, which is `no_show`'s
  // business once the slot is over - not a repeat of "starting soon".
  assert.equal(sessionTimeStatus(upcomingBooking(), arenaInstant('18:01:00')), null)
})

check('a walk-in waiting to check in has no start to announce', () => {
  // It holds no slot at all until somebody sits down.
  const walkIn = { ...upcomingBooking(), billed_on_actual_time: true, booking_device_slots: [] }
  assert.equal(sessionTimeStatus(walkIn, arenaInstant('17:57:00')), null)
})

check('the first slot is the one the customer is due for', () => {
  const twoSlots = {
    ...upcomingBooking(),
    booking_device_slots: [
      { slot_date: '2026-08-17', slot_start_time: '18:00:00', slot_end_time: '19:00:00' },
      { slot_date: '2026-08-17', slot_start_time: '19:00:00', slot_end_time: '20:00:00' },
    ],
  }
  const status = sessionTimeStatus(twoSlots, arenaInstant('17:57:00'))
  assert.equal(status?.kind === 'starting_soon' && status.startsAtClock, '06:00 PM')
})

check('reads as a medium badge naming the start time', () => {
  const flags = bookingAttention(upcomingBooking(), arenaInstant('17:57:00'))
  const starting = flags.find((flag) => flag.kind === 'starting_soon')
  assert.equal(starting?.severity, 'medium')
  assert.equal(starting?.label, 'Starts 06:00 PM')
})

console.log('\nWhat the badges make of it')

check('an overrun reads as high severity', () => {
  const flags = bookingAttention(liveBooking('18:00:00'), arenaInstant('18:25:00'))
  const overrun = flags.find((flag) => flag.kind === 'overrunning')
  assert.equal(overrun?.severity, 'high')
  assert.equal(overrun?.label, 'Over by 25m')
})

check('an hour and five minutes over reads as 1h 05m', () => {
  const flags = bookingAttention(liveBooking('18:00:00'), arenaInstant('19:05:00'))
  assert.equal(flags.find((flag) => flag.kind === 'overrunning')?.label, 'Over by 1h 05m')
})

check('an approaching end reads as medium, and names the time', () => {
  const flags = bookingAttention(liveBooking('18:00:00'), arenaInstant('17:57:00'))
  const ending = flags.find((flag) => flag.kind === 'ending_soon')
  assert.equal(ending?.severity, 'medium')
  assert.equal(ending?.label, 'Ends 06:00 PM')
})

check('a session open for days says that instead of "over time"', () => {
  // Both are true of a session checked in on Tuesday, but "never checked out"
  // is the one worth reading; the overrun is a restatement of it.
  const stale = {
    ...liveBooking('18:00:00'),
    checked_in_at: new Date('2026-08-14T10:00:00+05:30').toISOString(),
  }
  const kinds = bookingAttention(stale, arenaInstant('18:25:00')).map((flag) => flag.kind)
  assert.ok(kinds.includes('never_checked_out'))
  assert.ok(!kinds.includes('overrunning'))
})

console.log(
  failures === 0
    ? '\nAll session time-limit checks passed.\n'
    : `\n${failures} check(s) failed.\n`
)

process.exit(failures === 0 ? 0 : 1)
