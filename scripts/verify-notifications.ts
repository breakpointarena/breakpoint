/**
 * Admin notification checks.
 *
 * The repo has no test runner, so these are plain assertions runnable with the
 * tsx that is already a devDependency:
 *
 *   npm run test:notifications
 *
 * Scope is the two rules that decide whether the bell behaves, both of which
 * were got wrong once already and neither of which is visible without a browser:
 *
 *   1. One event is announced once - across the walk-in screen and the poller,
 *      and across a reload that replays the same orders from storage.
 *   2. History fills the bell in silence. The poller reaches back over the shift,
 *      so a reload on a fresh browser sees a dozen orders at once; toasting and
 *      chiming for each would be a stack of alarms about the morning's trade.
 *
 * The wording of each notification is checked too, since that is what staff read.
 */

/**
 * Dummy Supabase env vars, set before anything is loaded: lib/supabase/client.ts
 * builds its client at module load and throws without them. The modules under
 * test are therefore pulled in by dynamic import below, after these are in place -
 * a static import would be hoisted above them. No network call is made.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= `test-anon-key-${'x'.repeat(140)}`

import assert from 'node:assert/strict'
// Type-only, so this import is erased and pulls nothing in at runtime.
import type { Notification } from '../lib/contexts/NotificationContext'

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

const NOW = new Date('2026-08-17T12:00:00.000Z').getTime()

function notification(over: Partial<Notification> = {}): Notification {
  return {
    id: 'booking:abc',
    type: 'booking',
    title: 'New Booking',
    message: 'Ada • #BP-1 • ₹500',
    bookingId: 'abc',
    bookingNumber: 'BP-1',
    timestamp: new Date(NOW),
    read: false,
    ...over,
  }
}

async function main() {
  const { mergeNotification, notificationHref, rememberRead } = await import(
    '../lib/contexts/NotificationContext'
  )
  const { shouldAnnounce } = await import('../components/admin/layout/NotificationToast')
  const {
    describeOrderNotification,
    bookingNotificationId,
    isWalkIn,
    arrivedWithOrder,
  } = await import('../lib/hooks/useAdminNotificationPolling')

console.log('\nOne event, one entry')

check('the same id twice leaves the list untouched', () => {
  const first = mergeNotification([], notification(), NOW)
  const again = mergeNotification(first, notification(), NOW)
  assert.equal(again.length, 1)
  assert.equal(again, first, 'should return the same array so React skips a render')
})

check('the walk-in screen and the poller agree on the id', () => {
  // The screen announces the instant it creates; the poller sweeps it up later.
  const fromScreen = notification({ id: bookingNotificationId('abc'), title: 'New Walk-In Booking' })
  const fromPoller = notification({ id: bookingNotificationId('abc'), title: 'New Walk-In Booking' })
  const list = mergeNotification(mergeNotification([], fromScreen, NOW), fromPoller, NOW + 30_000)
  assert.equal(list.length, 1, 'one walk-in must not be listed twice')
})

check('a reload replaying stored orders adds nothing', () => {
  const stored = [notification({ id: 'booking:a' }), notification({ id: 'booking:b' })]
  // The first poll after a reload re-reads the same two bookings.
  let list = stored
  for (const id of ['booking:a', 'booking:b']) {
    list = mergeNotification(list, notification({ id }), NOW + 60_000)
  }
  assert.equal(list.length, 2)
})

check('a genuinely later event on the same booking still comes through', () => {
  const booked = notification({ id: 'booking:abc', title: 'New Booking' })
  const food = notification({ id: 'food:abc:t2', title: 'Food Added' })
  const list = mergeNotification(mergeNotification([], booked, NOW), food, NOW + 600_000)
  assert.equal(list.length, 2)
})

check('the list is capped, keeping the newest', () => {
  let list: Notification[] = []
  for (let i = 0; i < 40; i++) {
    // Distinct bookings, or the same-booking backstop below would fold them into
    // one entry and this would be measuring that rule instead of the cap.
    list = mergeNotification(
      list,
      notification({ id: `booking:${i}`, bookingId: `b${i}`, bookingNumber: `BP-${i}` }),
      NOW
    )
  }
  assert.equal(list.length, 30)
  assert.equal(list[0].id, 'booking:39', 'newest first')
})

check('a sweep replayed newest-first keeps the newest, not the oldest', () => {
  // The poller reads bookings `created_at` descending and announces them in
  // that order. Prepending each blindly kept this morning's thirty and threw
  // away the ones that just came in - and every reload evicted a different
  // thirty, which is how dismissed notifications kept coming back.
  let list: Notification[] = []
  for (let i = 0; i < 40; i++) {
    list = mergeNotification(
      list,
      notification({
        id: `booking:${i}`,
        bookingId: `b${i}`,
        bookingNumber: `BP-${i}`,
        timestamp: new Date(NOW - i * 60_000),
      }),
      NOW
    )
  }

  assert.equal(list.length, 30)
  assert.equal(list[0].id, 'booking:0', 'the newest is first')
  assert.ok(
    list.every(entry => Number(entry.id.split(':')[1]) < 30),
    'the thirty newest are the ones kept'
  )
})

console.log('\nRead once, read for good')

check('a receipt outlives the notification that carried it', () => {
  const receipts = rememberRead([], ['booking:abc'], NOW)
  assert.deepEqual(receipts, [{ id: 'booking:abc', at: NOW }])
})

check('marking the same id twice does not stack up receipts', () => {
  const once = rememberRead([], ['booking:abc'], NOW)
  const twice = rememberRead(once, ['booking:abc'], NOW + 1000)
  assert.equal(twice.length, 1)
  assert.equal(twice[0].at, NOW + 1000, 'the later reading wins')
})

check('marking all read records every id on screen', () => {
  const receipts = rememberRead([], ['booking:a', 'food:b:t1', 'menu:c:x'], NOW)
  assert.deepEqual(receipts.map(r => r.id), ['booking:a', 'food:b:t1', 'menu:c:x'])
})

check('nothing to mark leaves the set untouched', () => {
  const before = rememberRead([], ['booking:abc'], NOW)
  assert.equal(rememberRead(before, [], NOW), before)
})

check('a receipt older than the day it belongs to is dropped', () => {
  const stale = rememberRead([], ['booking:old'], NOW - 25 * 60 * 60 * 1000)
  const fresh = rememberRead(stale, ['booking:new'], NOW)
  assert.deepEqual(fresh.map(r => r.id), ['booking:new'])
})

check('the receipt set is capped', () => {
  let receipts = rememberRead([], [], NOW)
  for (let i = 0; i < 400; i++) receipts = rememberRead(receipts, [`booking:${i}`], NOW)
  assert.equal(receipts.length, 300)
  assert.equal(receipts[0].id, 'booking:399', 'the most recently read are kept')
})

check('callers without an id are still deduplicated within the window', () => {
  const a = notification({ id: 'generated-1' })
  const b = notification({ id: 'generated-2' })
  const list = mergeNotification(mergeNotification([], a, NOW), b, NOW + 1_000)
  assert.equal(list.length, 1, 'same booking and title moments apart is one event')
})

console.log('\nAlerts that are not about a booking')

/** A menu item having run out - no booking, and a link to the menu instead. */
function stockAlert(over: Partial<Notification> = {}): Notification {
  return {
    id: 'menu:coke:out-of-stock:2026-08-17T12:00:00Z',
    type: 'stock',
    title: 'Item Out of Stock',
    message: 'Coke has sold out and is off the customer menu.',
    href: '/admin/food',
    timestamp: new Date(NOW),
    read: false,
    ...over,
  }
}

check('two items running out together are both announced', () => {
  // The same-booking backstop asks "is this the same booking again?", and these
  // are not about a booking at all. Left to match on a bookingId they both lack
  // and a title they both share, the second would never have been heard.
  const coke = stockAlert()
  const fries = stockAlert({ id: 'menu:fries:out-of-stock:2026-08-17T12:00:00Z' })
  const list = mergeNotification(mergeNotification([], coke, NOW), fries, NOW + 1_000)
  assert.equal(list.length, 2)
})

check('the same item running out is still announced once', () => {
  const list = mergeNotification(mergeNotification([], stockAlert(), NOW), stockAlert(), NOW + 30_000)
  assert.equal(list.length, 1)
})

check('an item restocked and sold out again is a second event', () => {
  // Keyed on when it ran out, so this afternoon's is not swallowed by this
  // morning's. Keying on the item alone would have lost it.
  const morning = stockAlert()
  const afternoon = stockAlert({ id: 'menu:coke:out-of-stock:2026-08-17T16:30:00Z' })
  const list = mergeNotification(mergeNotification([], morning, NOW), afternoon, NOW + 4 * 3600_000)
  assert.equal(list.length, 2)
})

check('a stock alert opens the menu, not a booking', () => {
  assert.equal(notificationHref(stockAlert()), '/admin/food')
})

check('a booking notification still opens its booking', () => {
  assert.equal(notificationHref(notification()), '/admin/bookings?id=abc')
})

check('one with nowhere to go navigates nowhere', () => {
  // Rather than opening /admin/bookings?id=undefined, which is what a missing
  // booking id used to produce.
  assert.equal(notificationHref(stockAlert({ href: undefined })), null)
})

console.log('\nHistory is silent, arrivals are not')

check('an order placed seconds ago chimes', () => {
  assert.equal(shouldAnnounce(notification({ timestamp: new Date(NOW - 5_000) }), NOW), true)
})

check('an order from this morning does not', () => {
  const sixHoursAgo = new Date(NOW - 6 * 60 * 60 * 1000)
  assert.equal(shouldAnnounce(notification({ timestamp: sixHoursAgo }), NOW), false)
})

check('a backfilled order just outside the window does not', () => {
  assert.equal(shouldAnnounce(notification({ timestamp: new Date(NOW - 4 * 60_000) }), NOW), false)
})

check('an order already read never chimes again', () => {
  assert.equal(shouldAnnounce(notification({ read: true, timestamp: new Date(NOW) }), NOW), false)
})

console.log('\nWhat staff actually read')

check('a walk-in says so', () => {
  const { title } = describeOrderNotification({
    customer_name: 'Ada',
    booking_number: 'BP-1',
    device_subtotal: 500,
    food_subtotal: 0,
    total_amount: 500,
    locked_by: null,
  })
  assert.equal(title, 'New Walk-In Booking')
})

check('an online order does not claim to be a walk-in', () => {
  const { title } = describeOrderNotification({
    customer_name: 'Ada',
    booking_number: 'BP-1',
    device_subtotal: 500,
    food_subtotal: 0,
    total_amount: 500,
    locked_by: 'customer',
  })
  assert.equal(title, 'New Booking')
})

check('a session billed on actual time quotes no price', () => {
  // total_amount is 0 until checkout; "₹0" would read as a free session.
  const { message } = describeOrderNotification({
    customer_name: 'Ada',
    booking_number: 'BP-1',
    device_subtotal: 0,
    food_subtotal: 0,
    total_amount: 0,
    locked_by: null,
  })
  assert.match(message, /awaiting check-in/)
  assert.doesNotMatch(message, /₹0/)
})

check('slot and food in one order is said once, with the split', () => {
  const { type, title, message } = describeOrderNotification({
    customer_name: 'Ada',
    booking_number: 'BP-1',
    device_subtotal: 400,
    food_subtotal: 100,
    total_amount: 500,
    locked_by: 'customer',
  })
  assert.equal(type, 'booking')
  assert.equal(title, 'New Booking + Food Order')
  assert.match(message, /Slot ₹400/)
  assert.match(message, /Food ₹100/)
})

check('a food-only order is a food notification', () => {
  const { type, title } = describeOrderNotification({
    customer_name: 'Ada',
    booking_number: 'BP-1',
    device_subtotal: 0,
    food_subtotal: 120,
    total_amount: 120,
    locked_by: 'customer',
  })
  assert.equal(type, 'food')
  assert.equal(title, 'New Food Order')
})

console.log('\nSupporting rules')

check('only the online flows are stamped customer', () => {
  assert.equal(isWalkIn(null), true)
  assert.equal(isWalkIn(undefined), true)
  assert.equal(isWalkIn('customer'), false)
})

check('food written with its booking is not announced separately', () => {
  const bookingAt = '2026-08-17T12:00:00.000Z'
  assert.equal(arrivedWithOrder(bookingAt, '2026-08-17T12:00:20.000Z'), true)
  assert.equal(arrivedWithOrder(bookingAt, '2026-08-17T14:30:00.000Z'), false)
})

  console.log(
    failures === 0
      ? '\nAll notification checks passed.\n'
      : `\n${failures} notification check(s) failed.\n`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('Could not run notification checks:', err.message)
  process.exit(1)
})
