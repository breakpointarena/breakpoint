import { supabaseAdmin } from '@/lib/supabase/server'
import { createRazorpayOrder } from '@/lib/razorpay/client'
import type { DeviceBookingQuote, FoodOrderQuote, SubscriptionQuote } from './quote'

/**
 * The `payment_orders` table is the bridge between "customer clicked Pay" and
 * "booking exists". It stores the server-computed price so fulfilment reads the
 * amount back from the database rather than trusting whatever the browser posts.
 */

export type PaymentPurpose = 'device_booking' | 'food_order' | 'subscription'
export type StoredQuote = DeviceBookingQuote | FoodOrderQuote | SubscriptionQuote

export interface PaymentOrderRow {
  id: string
  razorpay_order_id: string
  purpose: PaymentPurpose
  amount: number
  quote: StoredQuote
  customer_phone: string
  status: 'created' | 'paid' | 'fulfilled' | 'failed' | 'refunding' | 'refunded'
  booking_id: string | null
  /** The membership a subscription order produced. Null on the booking flows. */
  subscription_id: string | null
  razorpay_payment_id: string | null
  paid_at: string | null
  fulfilling_at: string | null
}

/**
 * How long a fulfilment lease is honoured before another caller may take over.
 *
 * Long enough that an in-flight attempt is never duplicated, short enough that
 * Razorpay's webhook retries can still rescue a stranded order the same day.
 */
export const FULFILMENT_LEASE_MS = 3 * 60 * 1000

/** Razorpay caps receipts at 40 chars, so keep the random suffix short. */
function buildReceipt(purpose: PaymentPurpose): string {
  const prefix = purpose === 'device_booking' ? 'bk' : purpose === 'subscription' ? 'sb' : 'fd'
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function createPaymentOrder(params: {
  purpose: PaymentPurpose
  amount: number
  quote: StoredQuote
  customerPhone: string
  notes?: Record<string, string>
}): Promise<{ razorpayOrderId: string; amount: number }> {
  const receipt = buildReceipt(params.purpose)

  const order = await createRazorpayOrder({
    amount: params.amount,
    receipt,
    notes: {
      purpose: params.purpose,
      phone: params.customerPhone,
      ...params.notes,
    },
  })

  const { error } = await supabaseAdmin.from('payment_orders').insert({
    razorpay_order_id: order.id,
    purpose: params.purpose,
    amount: params.amount,
    currency: 'INR',
    quote: params.quote,
    customer_phone: params.customerPhone,
    status: 'created',
  })

  if (error) throw error

  return { razorpayOrderId: order.id, amount: params.amount }
}

/** Read-only lookup, used to inspect an order before anything is mutated. */
export async function getPaymentOrder(
  razorpayOrderId: string
): Promise<PaymentOrderRow | null> {
  const { data } = await supabaseAdmin
    .from('payment_orders')
    .select('*')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle()

  return (data as PaymentOrderRow | null) || null
}

export type ClaimResult =
  | { outcome: 'claimed'; order: PaymentOrderRow }
  | { outcome: 'already_fulfilled'; order: PaymentOrderRow }
  | { outcome: 'not_found' }
  | { outcome: 'unusable'; order: PaymentOrderRow }

/**
 * Moves an order from `created` to `paid` in a single conditional update, and
 * takes the fulfilment lease in the same statement.
 *
 * The `.eq('status', 'created')` filter makes this an atomic claim: if the
 * customer double-clicks or the browser retries, only the first call wins and the
 * rest report `already_fulfilled`, so one payment can never create two bookings.
 */
export async function claimPaidOrder(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): Promise<ClaimResult> {
  const now = new Date().toISOString()

  const { data: claimed, error } = await supabaseAdmin
    .from('payment_orders')
    .update({
      status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      paid_at: now,
      fulfilling_at: now,
    })
    .eq('razorpay_order_id', razorpayOrderId)
    .eq('status', 'created')
    .select('*')
    .maybeSingle()

  if (error) throw error

  if (claimed) {
    return { outcome: 'claimed', order: claimed as PaymentOrderRow }
  }

  // Nothing claimed: the order is either unknown or already past `created`.
  const { data: existing } = await supabaseAdmin
    .from('payment_orders')
    .select('*')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle()

  if (!existing) return { outcome: 'not_found' }

  const order = existing as PaymentOrderRow

  if (order.status === 'paid' || order.status === 'fulfilled') {
    return { outcome: 'already_fulfilled', order }
  }

  return { outcome: 'unusable', order }
}

/**
 * Takes over a `paid` order that never produced a booking.
 *
 * A previous attempt died somewhere between claiming the payment and inserting
 * the booking. The money is ours, so the order must be resumed - but only by one
 * caller. This re-takes the fulfilment lease with the same conditional-update
 * trick as `claimPaidOrder`: the `fulfilling_at` filter means a webhook retry and
 * a browser callback arriving together cannot both build a booking.
 *
 * Returns the claimed row, or null when someone else holds a live lease.
 */
export async function claimStrandedOrder(
  razorpayOrderId: string
): Promise<PaymentOrderRow | null> {
  const leaseCutoff = new Date(Date.now() - FULFILMENT_LEASE_MS).toISOString()

  const { data, error } = await supabaseAdmin
    .from('payment_orders')
    .update({ fulfilling_at: new Date().toISOString() })
    .eq('razorpay_order_id', razorpayOrderId)
    .eq('status', 'paid')
    .is('booking_id', null)
    .or(`fulfilling_at.is.null,fulfilling_at.lt.${leaseCutoff}`)
    .select('*')
    .maybeSingle()

  if (error) throw error

  return (data as PaymentOrderRow | null) || null
}

export async function markOrderFulfilled(
  razorpayOrderId: string,
  produced: { bookingId?: string; subscriptionId?: string }
): Promise<void> {
  // Whichever of the two the purpose produced. Written separately rather than
  // into one column, so "which membership did this order pay for" stays a
  // question the row can answer without knowing what kind of order it was.
  const { error } = await supabaseAdmin
    .from('payment_orders')
    .update({
      status: 'fulfilled',
      ...(produced.bookingId ? { booking_id: produced.bookingId } : {}),
      ...(produced.subscriptionId ? { subscription_id: produced.subscriptionId } : {}),
      fulfilled_at: new Date().toISOString(),
    })
    .eq('razorpay_order_id', razorpayOrderId)

  if (error) console.error('Failed to mark payment order fulfilled:', error)
}

/**
 * Moves an order out of `paid` *before* the refund is attempted.
 *
 * Ordering matters. If the refund were issued first and this write then failed,
 * the order would sit in `paid` with no booking, and the next webhook retry would
 * resume fulfilment - handing the customer a booking for money we had already
 * given back. Leaving `refunding` behind instead is the safe failure: it is
 * terminal for automated retries and shows up in the stranded-orders index.
 *
 * 'not_owned' means another caller is already handling this order. 'error' is a
 * database failure, which the caller must treat as retryable - otherwise a blip
 * here would leave money taken, no booking, and no refund.
 */
export async function beginRefund(
  razorpayOrderId: string,
  reason: string
): Promise<'claimed' | 'not_owned' | 'error'> {
  const { data, error } = await supabaseAdmin
    .from('payment_orders')
    .update({ status: 'refunding', failure_reason: reason })
    .eq('razorpay_order_id', razorpayOrderId)
    .eq('status', 'paid')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Failed to move payment order into refunding:', error)
    return 'error'
  }

  return data ? 'claimed' : 'not_owned'
}

export async function markOrderRefunded(razorpayOrderId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('payment_orders')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('razorpay_order_id', razorpayOrderId)

  // The refund itself already went through; this is bookkeeping. `refunding` is
  // just as terminal, so a failure here cannot resurrect the order.
  if (error) console.error('Failed to mark payment order refunded:', error)
}

export async function getBookingForOrder(
  bookingId: string
): Promise<{ id: string; booking_number: string } | null> {
  const { data } = await supabaseAdmin
    .from('bookings')
    .select('id, booking_number')
    .eq('id', bookingId)
    .maybeSingle()

  return (data as { id: string; booking_number: string } | null) || null
}

/**
 * Finds a booking by the payment that funded it.
 *
 * Used to tell a genuinely stranded claim (money taken, no booking) apart from a
 * fulfilment that succeeded but crashed before it could write `booking_id` back.
 * Without this check, resuming would create a second booking for one payment.
 */
export async function getBookingByPaymentId(
  razorpayPaymentId: string
): Promise<{ id: string; booking_number: string } | null> {
  if (!razorpayPaymentId) return null

  const { data } = await supabaseAdmin
    .from('bookings')
    .select('id, booking_number')
    .eq('razorpay_payment_id', razorpayPaymentId)
    .limit(1)
    .maybeSingle()

  return (data as { id: string; booking_number: string } | null) || null
}

export interface SettledMembership {
  id: string
  planName: string
}

/** Shared by the two membership lookups below - one row, one plan name. */
const toMembership = (row: any): SettledMembership | null =>
  row ? { id: row.id, planName: row.subscription_plan?.name || 'Membership' } : null

/**
 * The membership an order produced.
 *
 * The counterpart of `getBookingForOrder`, and the reason both exist: a
 * subscription order never carries a `booking_id`, so asking the booking
 * lookups about one always came back empty. That is not "no membership was
 * created" - it is the wrong table - and reading it as the former told customers
 * their paid membership had failed to activate.
 */
export async function getSubscriptionForOrder(
  subscriptionId: string
): Promise<SettledMembership | null> {
  if (!subscriptionId) return null

  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id, subscription_plan:subscription_plans(name)')
    .eq('id', subscriptionId)
    .maybeSingle()

  return toMembership(data)
}

/**
 * The membership a payment funded, when the order never got its id written back.
 *
 * `subscriptions.payment_id` holds the Razorpay payment id, written in the same
 * insert that creates the membership - so it is the source of truth for "did
 * this payment already produce one", exactly as the booking row is on that side.
 */
export async function getSubscriptionByPaymentId(
  razorpayPaymentId: string
): Promise<SettledMembership | null> {
  if (!razorpayPaymentId) return null

  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('id, subscription_plan:subscription_plans(name)')
    .eq('payment_id', razorpayPaymentId)
    .limit(1)
    .maybeSingle()

  return toMembership(data)
}
