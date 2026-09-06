'use server'

import { getRazorpayKeyId, isRazorpayConfigured, describeRazorpayConfig } from '@/lib/razorpay/client'
import { quoteSubscription, type SubscriptionInput } from '@/lib/payments/quote'
import { createPaymentOrder } from '@/lib/payments/orders'
import { verifyAndFulfilPayment, type CheckoutResponse } from '@/lib/payments/verify'
import { requireVerifiedPhone } from '@/lib/auth/customer-session'
import { supabaseAdmin } from '@/lib/supabase/server'
import { arenaToday } from '@/lib/utils/dates'

/**
 * Razorpay payment flow for memberships.
 *
 * Memberships were the one thing the arena sells that never went through a
 * gateway. The purchase page called `activateSubscriptionPlan` itself with a
 * payment id the browser invented -
 *
 *     const mockPaymentId = `pay_mock_${Math.floor(Math.random() * 10000)}`
 *
 * - so a membership was granted whether or not anybody paid, and every one of
 * the ten memberships in production was created that way.
 *
 * The membership row is now only written after the Razorpay signature has been
 * verified, so an abandoned or failed checkout leaves nothing behind, exactly as
 * with device bookings and food orders.
 */

export interface CreateSubscriptionOrderResult {
  success: boolean
  error?: string
  /** Set when the customer must verify their phone before continuing. */
  verificationRequired?: boolean
  /** Set when they already hold this plan, or another one still running. */
  alreadySubscribed?: boolean
  keyId?: string
  orderId?: string
  amount?: number
  summary?: {
    planName: string
    durationMonths: number
    discountPercentage: number
    totalAmount: number
  }
}

export async function createSubscriptionPaymentOrder(
  input: SubscriptionInput
): Promise<CreateSubscriptionOrderResult> {
  try {
    // Proof of phone ownership before anything is priced. This is a public HTTP
    // endpoint, so the phone in `input` is a claim until the session backs it up.
    const auth = await requireVerifiedPhone(input.phone)
    if (!auth.ok) {
      return { success: false, error: auth.error, verificationRequired: true }
    }

    const quoted = await quoteSubscription({ ...input, phone: auth.phone })
    if (!quoted.success) {
      return { success: false, error: quoted.error }
    }

    const quote = quoted.quote

    /**
     * Refused while a membership is still running.
     *
     * Nothing stopped this before, and three customers in production hold two
     * active memberships each - the second quietly supersedes the first, because
     * `active_subscription_id` can only point at one. Taking money for a plan
     * that cancels the one already paid for is not a purchase anybody meant to
     * make, so it is refused here and the customer is told what they have.
     */
    const existing = await activeMembershipFor(auth.phone)
    if (existing) {
      return {
        success: false,
        alreadySubscribed: true,
        // Plan names already read as memberships ("Starter Membership"), so
        // appending the word again gives "Starter Membership membership".
        error:
          `Your ${existing.planName} is active until ${existing.endDate}. ` +
          `Please wait until it ends before buying another.`,
      }
    }

    if (!isRazorpayConfigured()) {
      // Loud, because the customer-facing message deliberately says nothing
      // about configuration - without this the cause is invisible.
      console.error(`Razorpay unusable: ${describeRazorpayConfig()}`)
      return {
        success: false,
        error: 'Online payments are not available right now. Please contact the arena.',
      }
    }

    const order = await createPaymentOrder({
      purpose: 'subscription',
      amount: quote.totalAmount,
      quote,
      customerPhone: quote.customer.phone,
      notes: {
        plan: quote.planName,
        months: String(quote.durationMonths),
      },
    })

    return {
      success: true,
      keyId: getRazorpayKeyId()!,
      orderId: order.razorpayOrderId,
      amount: order.amount,
      summary: {
        planName: quote.planName,
        durationMonths: quote.durationMonths,
        discountPercentage: quote.discountPercentage,
        totalAmount: quote.totalAmount,
      },
    }
  } catch (err: any) {
    console.error('createSubscriptionPaymentOrder error:', err)
    return { success: false, error: 'Could not start the payment. Please try again.' }
  }
}

export interface ConfirmSubscriptionPaymentResult {
  success: boolean
  error?: string
  subscriptionId?: string
  planName?: string
  amountPaid?: number
}

export async function confirmSubscriptionPayment(
  response: CheckoutResponse
): Promise<ConfirmSubscriptionPaymentResult> {
  const result = await verifyAndFulfilPayment(response, 'subscription')

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    subscriptionId: result.subscriptionId,
    planName: result.planName,
    amountPaid: result.amountPaid,
  }
}

/**
 * The membership a customer is currently on, if any.
 *
 * Deliberately the same rule `resolveActiveMembership` applies when deciding a
 * discount - the pointer on the customer row, status `active`, and an end date
 * that has not passed on the arena's calendar - so what the purchase page refuses
 * and what the booking flow discounts can never disagree.
 */
async function activeMembershipFor(
  phone: string
): Promise<{ planName: string; endDate: string } | null> {
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('active_subscription_id')
    .eq('phone', phone)
    .maybeSingle()

  if (!customer?.active_subscription_id) return null

  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('end_date, subscription_plan:subscription_plans(name)')
    .eq('id', customer.active_subscription_id)
    .eq('status', 'active')
    .gte('end_date', arenaToday())
    .maybeSingle()

  if (!data?.end_date) return null

  return {
    planName: (data as any).subscription_plan?.name || 'Membership',
    endDate: String(data.end_date),
  }
}
