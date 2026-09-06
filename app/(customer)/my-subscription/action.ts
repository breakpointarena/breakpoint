'use server'

import { supabaseAdmin } from '@/lib/supabase/server'
import { arenaDate, arenaToday } from "@/lib/utils/dates";
import { getVerifiedCustomerPhone } from '@/lib/auth/customer-session'
import { revenueSplit } from '@/lib/payments/revenueSplit'
import { round2 } from '@/lib/payments/money'

/**
 * The verified caller's own subscription.
 *
 * Replaces getMyActiveSubscriptionByPhone(phone), which took the number from a
 * `?phone=` query parameter - so editing the URL showed anyone else's plan,
 * spend and renewal date. The number now comes from the session instead.
 */
export async function getMySubscription() {
  try {
    const phone = await getVerifiedCustomerPhone()

    if (!phone) {
      return {
        success: false,
        data: null,
        verificationRequired: true,
        message: 'Please verify your mobile number to view your subscription.',
      }
    }

    // 1. Get customer
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id, active_subscription_id')
      .eq('phone', phone)
      .single()

    if (customerError) {
      if (customerError.code === 'PGRST116') {
        return { success: true, data: null, message: 'Customer not found.' }
      }
      throw new Error(customerError.message)
    }

    if (!customer || !customer.active_subscription_id) {
      return { success: true, data: null, message: 'No active subscription.' }
    }

    // 2. Get active subscription
    const { data: subData, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq('id', customer.active_subscription_id)
      .eq('status', 'active')
      .gte('end_date', arenaToday())
      .single()

    if (subError) {
      if (subError.code === 'PGRST116') {
        return { success: true, data: null, message: 'No active subscription found.' }
      }
      throw new Error(subError.message)
    }

    return {
      success: true,
      data: subData,
      message: 'Subscription fetched successfully',
    }
  } catch (error: any) {
    console.error('Fetch Subscription by Phone Error:', error.message)
    return {
      success: false,
      data: null,
      message: error.message || 'Failed to fetch subscription details',
    }
  }
}

export interface ActivePlanSummary {
  planId: string
  planName: string
  discountPercentage: number
  /** The membership row itself, so a page can name the thing that was bought. */
  subscriptionId: string
  startDate: string
  endDate: string
  daysRemaining: number
}

/**
 * The membership the caller already holds, in the few fields a banner needs.
 *
 * Separate from `getMySubscription` above, which returns the whole record for
 * the account page. The plans list only wants to say "you are on this one, until
 * then", and pulling the full row to render two lines would mean the plans page
 * failing whenever anything in that larger shape changed.
 *
 * Null covers three cases that all mean the same thing to the caller - not
 * signed in, no membership, or one that has run out - because the banner simply
 * does not render for any of them.
 *
 * Same rule as `resolveActiveMembership`: the pointer on the customer row,
 * status `active`, and an end date that has not passed on the arena's calendar.
 * If those ever disagreed, the plan a customer is shown would not be the plan
 * their bookings are discounted by.
 *
 * Takes the number rather than reading the session, so a caller that has just
 * resolved it does not pay for a second lookup. Not exported for that reason:
 * the phone is trusted here, and a Server Function taking one would let anyone
 * POST somebody else's. `getMyActivePlanSummary` below is the public way in.
 */
async function activePlanForPhone(phone: string): Promise<ActivePlanSummary | null> {
  try {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('active_subscription_id')
      .eq('phone', phone)
      .maybeSingle()

    if (!customer?.active_subscription_id) return null

    const today = arenaToday()

    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'id, start_date, end_date, subscription_plan_id, ' +
          'plan:subscription_plans(name, discount_percentage)'
      )
      .eq('id', customer.active_subscription_id)
      .eq('status', 'active')
      .gte('end_date', today)
      .maybeSingle()

    const plan = (data as any)?.plan
    if (!data?.end_date || !plan) return null

    return {
      planId: String(data.subscription_plan_id || ''),
      planName: plan.name || 'Membership',
      discountPercentage: Number(plan.discount_percentage || 0),
      subscriptionId: String(data.id || ''),
      startDate: String(data.start_date || today),
      endDate: String(data.end_date),
      daysRemaining: daysUntil(today, String(data.end_date)),
    }
  } catch (err) {
    // A banner is not worth failing the plans page over.
    console.error('activePlanForPhone error:', err)
    return null
  }
}

/**
 * The membership the caller already holds, resolved from their own session.
 *
 * The session lookup is inside the try as well as the query. This is awaited
 * during the render of the subscription page, so a throwing cookie read here
 * would take the whole page down rather than just dropping the banner it
 * feeds - which is the opposite of what a decorative banner should do.
 */
export async function getMyActivePlanSummary(): Promise<ActivePlanSummary | null> {
  try {
    const phone = await getVerifiedCustomerPhone()
    if (!phone) return null
    return await activePlanForPhone(phone)
  } catch (err) {
    console.error('getMyActivePlanSummary error:', err)
    return null
  }
}

/** Everything the header control needs to draw itself. */
export interface CustomerHeaderState {
  /** The verified number, or null when this browser holds no session. */
  phone: string | null
  /** Their membership, or null for none - and always null without a session. */
  plan: ActivePlanSummary | null
}

/**
 * Session and membership in one request.
 *
 * The header used to ask for these as two Server Functions side by side, and it
 * asks on every route change - so every navigation in the customer app, down to
 * a page of static legal text, cost two round trips. Worse, each one resolved
 * the session cookie independently, so the same validation ran twice to answer
 * one question.
 *
 * One call, one session lookup. The plan is only read once the session has
 * produced a number, which is also what stops a membership being shown to a
 * browser whose session has since lapsed.
 */
export async function getCustomerHeaderState(): Promise<CustomerHeaderState> {
  try {
    const phone = await getVerifiedCustomerPhone()
    if (!phone) return { phone: null, plan: null }

    return { phone, plan: await activePlanForPhone(phone) }
  } catch (err) {
    // The header is decoration; it must never take the page down with it.
    console.error('getCustomerHeaderState error:', err)
    return { phone: null, plan: null }
  }
}

/**
 * Whole days from one `YYYY-MM-DD` to another, never negative.
 *
 * Counted in UTC on purpose: both sides are arena calendar dates rather than
 * instants, so the zone cancels out and no host offset can shift the answer.
 * Zero means the membership ends today, which reads as "last day" rather than
 * as expired.
 */
function daysUntil(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

/** One booking, reduced to what the summary card shows. */
export interface MembershipBookingRow {
  id: string
  bookingNumber: string
  /** Arena calendar date the slot is for, or the day it was booked. */
  date: string
  startTime: string | null
  deviceType: string | null
  durationHours: number
  status: string
  /** The bill after discounts, what has been received, and what is still owed. */
  charged: number
  collected: number
  outstanding: number
  /** The membership's own contribution to this booking. */
  saved: number
}

export interface MembershipBookingSummary {
  /** First day of the current term - every figure below is since then. */
  since: string
  bookings: number
  hoursPlayed: number
  saved: number
  spent: number
  outstanding: number
  /** Newest first, capped - the card is a summary, not a history page. */
  recent: MembershipBookingRow[]
}

/** The card shows a handful; /retrieve is where the full history lives. */
const RECENT_BOOKING_LIMIT = 5

/**
 * Bookings that go with a membership, and what it has been worth.
 *
 * The subscription page could only say which plan the customer is on and when it
 * runs out, which answers nothing about whether it is paying for itself. This is
 * the other half: how much has been booked since the term started, and how much
 * of the bill the membership took off.
 *
 * Scoped to the current term rather than to all time. A renewal starts a new
 * membership row with a new start date, so "saved" always means saved by the
 * membership being displayed above it - not by one that ended months ago.
 *
 * Money is never added up by hand here. `revenueSplit` settles the slot before
 * the food from the amounts on the row, which is the single rule the reports
 * page runs on; adding a second definition on the customer's side is how the
 * two start disagreeing about what somebody paid.
 */
export async function getMembershipBookingSummary(): Promise<MembershipBookingSummary | null> {
  try {
    const phone = await getVerifiedCustomerPhone()
    if (!phone) return null

    const plan = await getMyActivePlanSummary()
    if (!plan) return null

    /**
     * A deliberately wide net, narrowed below.
     *
     * `created_at` is a timestamptz and the arena is UTC+5:30, so asking Postgres
     * for `>= '2026-08-01'` gets midnight UTC - five and a half hours before the
     * arena's own start of that day. Over-selecting is harmless because the exact
     * test happens here against `arenaDate`; under-selecting would silently drop
     * the bookings made on the first evening of a membership.
     */
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select(
        `id, booking_number, status, created_at,
         device_subtotal, food_subtotal, subscription_discount, promo_discount,
         happy_hour_discount, amount_paid,
         booking_device_slots ( slot_date, slot_start_time, duration_hours, device_type )`
      )
      .eq('customer_phone', phone)
      .gte('created_at', `${plan.startDate}T00:00:00Z`)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    const rows: MembershipBookingRow[] = []

    for (const booking of (data as any[]) || []) {
      const status = String(booking.status || '').toLowerCase()

      /**
       * Not everything in this table is a booking somebody made. A slot hold the
       * customer opened and backed out of lands as `locked` and then `expired`,
       * and counting those would tell them they had booked eleven times when they
       * had booked once. Cancelled is excluded for the obvious reason.
       *
       * `isBillableBooking` is deliberately not used: it also drops anything with
       * a total of zero, which is exactly where a walk-in sits until checkout -
       * a real session that should be counted even before it has a price.
       */
      if (status === 'cancelled' || status === 'expired' || status === 'locked') continue

      // The precise membership-term test the query above could only approximate.
      const bookedOn = arenaDate(new Date(booking.created_at))
      if (bookedOn < plan.startDate) continue

      const slots = (booking.booking_device_slots as any[]) || []
      const split = revenueSplit({
        deviceSubtotal: booking.device_subtotal,
        foodSubtotal: booking.food_subtotal,
        subscriptionDiscount: booking.subscription_discount,
        promoDiscount: booking.promo_discount,
        happyHourDiscount: booking.happy_hour_discount,
        amountPaid: booking.amount_paid,
      })

      rows.push({
        id: String(booking.id),
        bookingNumber: String(booking.booking_number || ''),
        date: String(slots[0]?.slot_date || bookedOn),
        startTime: slots[0]?.slot_start_time ? String(slots[0].slot_start_time) : null,
        deviceType: slots[0]?.device_type ? String(slots[0].device_type) : null,
        durationHours: slots.reduce((sum, slot) => sum + (Number(slot.duration_hours) || 0), 0),
        status,
        charged: split.totalCharged,
        collected: split.collected,
        outstanding: split.outstanding,
        saved: Math.max(0, Number(booking.subscription_discount) || 0),
      })
    }

    const total = (pick: (row: MembershipBookingRow) => number) =>
      round2(rows.reduce((sum, row) => sum + pick(row), 0))

    return {
      since: plan.startDate,
      bookings: rows.length,
      hoursPlayed: total((row) => row.durationHours),
      saved: total((row) => row.saved),
      spent: total((row) => row.collected),
      outstanding: total((row) => row.outstanding),
      recent: rows.slice(0, RECENT_BOOKING_LIMIT),
    }
  } catch (err) {
    // A summary panel is not worth failing the subscription page over.
    console.error('getMembershipBookingSummary error:', err)
    return null
  }
}
