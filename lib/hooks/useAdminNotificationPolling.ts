'use client'

import { useEffect, useRef } from 'react'
import { useNotifications } from '@/lib/contexts/NotificationContext'
import { supabase } from '@/lib/supabase/client'
import {
  ENDING_SOON_MINUTES,
  STARTING_SOON_MINUTES,
  formatGap,
  sessionTimeStatus,
} from '@/lib/bookings/attention'

/**
 * How close to its booking a food row has to be to have arrived with the order.
 * Payment fulfilment writes the booking and its food rows back to back, so a
 * minute is generous; food added to an existing booking is minutes or hours
 * later and is a genuinely separate event.
 */
const SAME_ORDER_WINDOW_MS = 60 * 1000

/**
 * Describes one customer order in a single notification.
 *
 * An order is one `bookings` row, and its subtotals are written in the same
 * insert as the row itself - so what it contains is known the moment the poller
 * sees it, with no second query and no race against its food rows.
 */
export function describeOrderNotification(booking: {
  customer_name?: string | null
  booking_number?: string | null
  device_subtotal?: number | string | null
  food_subtotal?: number | string | null
  total_amount?: number | string | null
  locked_by?: string | null
}): { type: 'booking' | 'food'; title: string; message: string } {
  const deviceSubtotal = Number(booking.device_subtotal || 0)
  const foodSubtotal = Number(booking.food_subtotal || 0)
  const total = Number(booking.total_amount || 0)

  const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`
  const who = `${booking.customer_name || 'Customer'} • #${booking.booking_number || 'Unknown'}`

  // Says where the order came from, because the desk handles the two differently:
  // a walk-in is standing there, an online order is not.
  const origin = isWalkIn(booking.locked_by) ? 'Walk-In ' : ''

  // Slot and food in one order: say so once, with the split, rather than
  // raising a separate notification for each half.
  if (deviceSubtotal > 0 && foodSubtotal > 0) {
    return {
      type: 'booking',
      title: `New ${origin}Booking + Food Order`,
      message: `${who} • ${rupees(total)} (Slot ${rupees(deviceSubtotal)} + Food ${rupees(foodSubtotal)})`,
    }
  }

  if (foodSubtotal > 0 && deviceSubtotal === 0) {
    return {
      type: 'food',
      title: `New ${origin}Food Order`,
      message: `${who} • ${rupees(total)}`,
    }
  }

  // A walk-in session is billed on the time actually played, so at the moment it
  // is created there is no figure to quote - and quoting the zero that stands in
  // for "not yet known" reads as a free session.
  if (total === 0 && deviceSubtotal === 0 && foodSubtotal === 0) {
    return {
      type: 'booking',
      title: `New ${origin}Booking`,
      message: `${who} • awaiting check-in`,
    }
  }

  return {
    type: 'booking',
    title: `New ${origin}Booking`,
    message: `${who} • ${rupees(total)}`,
  }
}

/**
 * Walk-ins carry no `locked_by`; only the online flows stamp it as 'customer'.
 *
 * This used to decide what the poller ignored, on the grounds that the walk-in
 * screens announce their own. They only announce to the tab that created them -
 * so a walk-in was invisible to every other admin session, vanished on reload,
 * and the "start now" screen never announced at all. The poller now reads walk-ins
 * too and this only affects the wording; stable ids keep the screen's immediate
 * announcement and the poll from being listed twice.
 */
export function isWalkIn(lockedBy: string | null | undefined): boolean {
  return lockedBy !== 'customer'
}

/**
 * The natural key for an order's notification.
 *
 * Shared with the walk-in screens, which announce the same booking the instant
 * they create it. Same booking, same id, one entry in the bell - and the same id
 * again after a reload, so the restored list absorbs the re-poll instead of
 * doubling it.
 */
export function bookingNotificationId(bookingId: string): string {
  return `booking:${bookingId}`
}

/**
 * How far back the first poll looks.
 *
 * Starting from "now" meant anything that happened while the panel was shut, or
 * in the seconds around a reload, was never announced to anyone. Twelve hours
 * covers a shift; older orders are history and the age cap in the store drops
 * them anyway.
 */
const BACKFILL_WINDOW_MS = 12 * 60 * 60 * 1000

/**
 * How far back every later poll reads.
 *
 * Long enough that an order still shows up after the delay between a hold being
 * placed and the payment that turns it into a booking, which is capped at five
 * minutes by `HOLD_DURATION_MS`.
 */
const STEADY_WINDOW_MS = 15 * 60 * 1000

/**
 * True when food arrived as part of the order that created its booking - which
 * the booking poll already announces on its own. Food added to an existing
 * booking later, at the counter or by the customer, fails this and still gets
 * its own notification.
 */
export function arrivedWithOrder(
  bookingCreatedAt: string | null | undefined,
  foodCreatedAt: string
): boolean {
  if (!bookingCreatedAt) return false

  const bookingTime = new Date(bookingCreatedAt).getTime()
  const foodTime = new Date(foodCreatedAt).getTime()
  if (Number.isNaN(bookingTime) || Number.isNaN(foodTime)) return false

  return Math.abs(foodTime - bookingTime) <= SAME_ORDER_WINDOW_MS
}

export function useAdminNotificationPolling() {
  const { addNotification } = useNotifications()
  const isFirstPollRef = useRef(true)

  /**
   * Food keeps a moving cursor where bookings need a window.
   *
   * The window exists because a paid booking is an *updated* hold row carrying an
   * older `created_at`. Food rows have no such trick played on them - they are
   * plain inserts, stamped when they happen - so re-reading them buys nothing and
   * costs correctness: these notifications are grouped per booking and keyed on
   * the newest row in the group, so a second helping arriving while the first was
   * still inside the window formed a *different* group with a different key, and
   * announced "Food Added" twice for one order.
   */
  const lastFoodTimeRef = useRef<string | null>(null)

  useEffect(() => {
    /**
     * The stretch of history each poll reads.
     *
     * This replaces a moving "last seen" cursor, which could not be made to work
     * for the main online flow: paying does not insert a booking, it *updates* the
     * hold row that was already there, so a paid booking still carries the
     * `created_at` of the hold placed minutes earlier. Once any other booking had
     * pushed the cursor past that timestamp, the paid one was never announced to
     * anybody. A window that simply re-reads the recent past cannot miss it, and
     * with stable ids re-reading costs nothing: the second sighting of an order is
     * recognised and dropped.
     *
     * The first pass reaches back over the shift, so a reload or a panel that was
     * closed for an hour catches up.
     */
    function windowStart(): string {
      const span = isFirstPollRef.current ? BACKFILL_WINDOW_MS : STEADY_WINDOW_MS
      return new Date(Date.now() - span).toISOString()
    }

    async function checkForNewBookings() {
      try {
        const { data: newBookings, error } = await supabase
          .from('bookings')
          .select(
            'id, booking_number, customer_name, total_amount, device_subtotal, food_subtotal, created_at, locked_by, status'
          )
          .gt('created_at', windowStart())
          /**
           * Only rows that are actually an order.
           *
           * This used to exclude 'locked' and take everything else, on the
           * grounds that a hold becomes an order on payment. But a hold that is
           * *abandoned* does not stay locked either - `release_slot_hold` moves
           * it to 'expired', and `expire_locked_bookings` sweeps the rest the
           * same way - so a customer who opened the slot picker and backed out
           * left a row that passed the filter with no customer, no money and no
           * `locked_by`. `isWalkIn` reads that null as a walk-in, and the desk
           * was told "New Walk-In Booking - awaiting check-in" for somebody who
           * never booked anything.
           *
           * Naming the states that mean "this is a real order" says what is
           * meant, and cannot be widened by a new status being added elsewhere.
           * Walk-ins are still included: they are bookings the desk needs
           * announced on every screen, not just the one that typed them in.
           */
          .in('status', ['confirmed', 'checked_in', 'completed'])
          .order('created_at', { ascending: false })

        if (!error && newBookings && newBookings.length > 0) {
          // One notification per order, describing whatever it contains
          newBookings.reverse().forEach((booking: any) => {
            const { type, title, message } = describeOrderNotification(booking)

            addNotification({
              id: bookingNotificationId(booking.id),
              type,
              title,
              message,
              bookingId: booking.id,
              bookingNumber: booking.booking_number,
              // When the order was placed, not when this sweep found it.
              timestamp: new Date(booking.created_at),
            })
          })
        }
      } catch (error) {
        console.error('Error checking for new bookings:', error)
      }
    }

    async function checkForNewFood() {
      // First pass reaches back over the shift, as the booking sweep does.
      if (!lastFoodTimeRef.current) {
        lastFoodTimeRef.current = new Date(Date.now() - BACKFILL_WINDOW_MS).toISOString()
      }

      try {
        const { data: newFoodItems, error } = await supabase
          .from('booking_food_items')
          .select(`
            id,
            booking_id,
            quantity,
            unit_price,
            created_at,
            bookings (
              booking_number,
              customer_name,
              created_at,
              locked_by
            )
          `)
          .gt('created_at', lastFoodTimeRef.current)
          .order('created_at', { ascending: false })

        if (!error && newFoodItems && newFoodItems.length > 0) {
          // Nothing back-dates a food row, so everything up to the newest is seen.
          lastFoodTimeRef.current = newFoodItems[0].created_at

          // Food that came with an order is already covered by that order's
          // single notification; only later additions belong here. This holds for
          // walk-ins as much as online orders, so origin no longer decides it.
          const addedToExistingBooking = newFoodItems.filter(
            (item: any) => !arrivedWithOrder(item.bookings?.created_at, item.created_at)
          )

          // Group by booking_id and create notifications
          const bookingGroups = addedToExistingBooking.reduce((acc: any, item: any) => {
            const bookingId = item.booking_id
            if (!acc[bookingId]) {
              acc[bookingId] = {
                bookingId,
                bookingNumber: item.bookings?.booking_number || 'Unknown',
                customerName: item.bookings?.customer_name || 'Customer',
                items: [],
                totalAmount: 0,
                // The newest row in the group keys the notification, so re-reading
                // the same batch after a reload lands on the same id. A genuinely
                // later addition carries a newer stamp and is its own entry.
                latestAt: item.created_at,
              }
            }
            acc[bookingId].items.push(item)
            acc[bookingId].totalAmount += item.quantity * item.unit_price
            if (item.created_at > acc[bookingId].latestAt) {
              acc[bookingId].latestAt = item.created_at
            }
            return acc
          }, {})

          // Add notifications for each booking
          Object.values(bookingGroups).reverse().forEach((group: any) => {
            addNotification({
              id: `food:${group.bookingId}:${group.latestAt}`,
              type: 'food',
              title: 'Food Added',
              message: `${group.customerName} • #${group.bookingNumber} • ${group.items.length} item(s) • ₹${group.totalAmount.toLocaleString('en-IN')} pending`,
              bookingId: group.bookingId,
              bookingNumber: group.bookingNumber,
              timestamp: new Date(group.latestAt),
            })
          })
        }
      } catch (error) {
        console.error('Error checking for new food items:', error)
      }
    }

    /**
     * Bookings about to start, sessions running out of time, and sessions
     * already past it.
     *
     * Unlike the other two sweeps, nothing is inserted or updated when a booking
     * crosses one of these lines - it simply becomes true, quietly, while the
     * row sits there unchanged. So there is no `created_at` to poll on and no
     * cursor to keep: the only way to know is to look at what is booked and do
     * the arithmetic, which is what `sessionTimeStatus` is for.
     *
     * Each phase is announced once. The ids are stable per booking and per
     * phase, so a booking sitting five minutes from its start does not raise the
     * same warning at every sweep, and the same booking still gets its own
     * separate notifications when it later nears its end and when it runs over.
     */
    async function checkForSessionTimeLimits() {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select(
            `id, booking_number, customer_name, status, checked_in_at,
             billed_on_actual_time,
             booking_device_slots(slot_date, slot_start_time, slot_end_time)`
          )
          // `confirmed` covers the ones due to start; `checked_in` the ones
          // being played. A walk-in session sits in `confirmed` too but has no
          // slot until it checks in, so it falls out of the arithmetic itself.
          .in('status', ['confirmed', 'checked_in'])

        if (error || !data) return

        for (const booking of data as any[]) {
          const timing = sessionTimeStatus(booking)
          if (!timing) continue

          const who = `${booking.customer_name || 'Customer'} • #${
            booking.booking_number || 'Unknown'
          }`

          if (timing.kind === 'starting_soon') {
            addNotification({
              id: `booking:${booking.id}:starting-soon`,
              type: 'booking',
              title: 'Session Starting Soon',
              message: `${who} • starts ${timing.startsAtClock} • in ${formatGap(
                timing.minutesUntilStart
              )}`,
              bookingId: booking.id,
              bookingNumber: booking.booking_number,
              // Stamped when the booking entered the warning window, so one that
              // is halfway through it fills the bell without chiming again.
              timestamp: new Date(
                Date.now() - (STARTING_SOON_MINUTES - timing.minutesUntilStart) * 60_000
              ),
            })
          } else if (timing.kind === 'ending_soon') {
            addNotification({
              id: `booking:${booking.id}:ending-soon`,
              type: 'booking',
              title: 'Session Ending Soon',
              message: `${who} • ends ${timing.endsAtClock} • ${formatGap(
                timing.minutesLeft
              )} left`,
              bookingId: booking.id,
              bookingNumber: booking.booking_number,
              /**
               * Stamped when the session entered the warning window rather than
               * when this sweep noticed it. A desk opening the panel partway
               * through gets the entry in the bell without a chime for something
               * it is already halfway through; a session that has just crossed
               * the line still interrupts.
               */
              timestamp: new Date(
                Date.now() - (ENDING_SOON_MINUTES - timing.minutesLeft) * 60_000
              ),
            })
          } else if (timing.kind === 'overrunning') {
            addNotification({
              id: `booking:${booking.id}:overrun`,
              type: 'booking',
              title: 'Session Over Time',
              message: `${who} • ended ${timing.endsAtClock} • ${formatGap(
                timing.minutesOver
              )} over`,
              bookingId: booking.id,
              bookingNumber: booking.booking_number,
              // Likewise: the moment it ran over, so an hour-old overrun fills
              // the bell quietly instead of chiming on every fresh page load.
              timestamp: new Date(Date.now() - timing.minutesOver * 60_000),
            })
          }
        }
      } catch (error) {
        console.error('Error checking session time limits:', error)
      }
    }

    /**
     * Menu items that have run out.
     *
     * The desk finds out an item is gone when a customer asks for it and the
     * kitchen says no. The count is sitting in the database the whole time, so
     * this says it first - and it is the one notification here that is not about
     * a booking at all, which is why it carries a link to the menu instead.
     *
     * Keyed on when the row last changed rather than on the item alone. `status`
     * is set to out_of_stock by the trigger the moment the count reaches zero, so
     * `updated_at` is when it ran out - which makes the id unique per emptying.
     * An item that is restocked and sells out again the same afternoon is a
     * second thing worth hearing about, and keying on the item alone would have
     * swallowed it. The stamp doubles as the age the toast is judged on: one that
     * ran out an hour ago fills the bell quietly, one that just went interrupts.
     */
    async function checkForOutOfStock() {
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('id, name, quantity, status, updated_at')
          .lte('quantity', 0)
          // Not `hidden`: an item deliberately off the menu is not news, however
          // little of it there is in the fridge.
          .eq('status', 'out_of_stock')

        if (error || !data) return

        for (const item of data as any[]) {
          const ranOutAt = item.updated_at ? new Date(item.updated_at) : new Date()

          addNotification({
            id: `menu:${item.id}:out-of-stock:${item.updated_at ?? ''}`,
            type: 'stock',
            title: 'Item Out of Stock',
            message: `${item.name} has sold out and is off the customer menu. Restock it to put it back.`,
            href: '/admin/food',
            timestamp: Number.isNaN(ranOutAt.getTime()) ? new Date() : ranOutAt,
          })
        }
      } catch (error) {
        console.error('Error checking menu stock:', error)
      }
    }

    // Bookings first and awaited, so a new order is always announced before any
    // food notification that follows it
    async function poll() {
      await checkForNewBookings()
      await checkForNewFood()
      await checkForSessionTimeLimits()
      await checkForOutOfStock()
      // Both halves have had their look over the shift; from here the shorter
      // window is enough, and cheaper.
      isFirstPollRef.current = false
    }

    /**
     * Four queries every thirty seconds, on every admin page, for as long as the
     * tab is open - so it must not run against a tab nobody is looking at. Staff
     * leave the admin open all shift behind the booking screen, and a background
     * tab polling the database is load with no reader.
     *
     * Skipping while hidden rather than tearing the interval down: the checks
     * are windowed, so the first poll after the operator comes back catches
     * whatever happened while they were away.
     */
    const pollIfVisible = () => {
      if (document.visibilityState === "hidden") return
      void poll()
    }

    const interval = setInterval(pollIfVisible, 30000)

    // Not immediately on page load - let the page settle first.
    const initialTimeout = setTimeout(pollIfVisible, 5000)

    // Coming back to the tab should refresh now, not up to thirty seconds later.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      clearInterval(interval)
      clearTimeout(initialTimeout)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [addNotification])
}
