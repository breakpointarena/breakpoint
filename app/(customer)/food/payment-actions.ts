'use server'

import { getRazorpayKeyId, isRazorpayConfigured, describeRazorpayConfig } from '@/lib/razorpay/client'
import { quoteFoodOrder, type FoodOrderInput, type FoodOrderQuote } from '@/lib/payments/quote'
import { createPaymentOrder } from '@/lib/payments/orders'
import { fulfilFoodOrder } from '@/lib/payments/fulfil'
import { verifyAndFulfilPayment, type CheckoutResponse } from '@/lib/payments/verify'
import { requireVerifiedPhone } from '@/lib/auth/customer-session'

/**
 * Razorpay payment flow for standalone food & drinks orders.
 *
 * Food added to an in-progress device session is not handled here - that goes on
 * the customer's tab and is settled at the counter by an admin.
 */

export interface CreateFoodOrderResult {
  success: boolean
  error?: string
  /** Set when the customer must (re)verify their phone before continuing. */
  verificationRequired?: boolean
  freeOrder?: boolean
  keyId?: string
  orderId?: string
  amount?: number
  summary?: {
    itemsTotal: number
    totalAmount: number
  }
  bookingId?: string
  bookingNumber?: string
}

function summarise(quote: FoodOrderQuote) {
  return {
    itemsTotal: quote.itemsTotal,
    totalAmount: quote.totalAmount,
  }
}

export async function createFoodOrderPaymentOrder(
  input: FoodOrderInput
): Promise<CreateFoodOrderResult> {
  try {
    // Proof of phone ownership, before anything is priced. Server actions are
    // public HTTP endpoints, so the phone in `input` is only a claim.
    const auth = await requireVerifiedPhone(input.phone)
    if (!auth.ok) {
      return { success: false, error: auth.error, verificationRequired: true }
    }

    const quoted = await quoteFoodOrder({ ...input, phone: auth.phone })

    if (!quoted.success) {
      return { success: false, error: quoted.error }
    }

    const quote = quoted.quote

    // Fully discounted order - nothing to charge.
    if (quote.totalAmount < 1) {
      const result = await fulfilFoodOrder(quote, {
        razorpayOrderId: '',
        razorpayPaymentId: '',
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        freeOrder: true,
        bookingId: result.bookingId,
        bookingNumber: result.bookingNumber,
        amount: 0,
        summary: summarise(quote),
      }
    }

    if (!isRazorpayConfigured()) {
      // Loud, because the customer-facing message deliberately says nothing
      // about configuration - without this the cause is invisible.
      console.error(`Razorpay unusable: ${describeRazorpayConfig()}`)
      return {
        success: false,
        error: 'Online payments are not available right now. Please order at the counter.',
      }
    }

    const order = await createPaymentOrder({
      purpose: 'food_order',
      amount: quote.totalAmount,
      quote,
      customerPhone: quote.customer.phone,
      notes: {
        items: String(quote.items.reduce((sum, item) => sum + item.quantity, 0)),
      },
    })

    return {
      success: true,
      keyId: getRazorpayKeyId()!,
      orderId: order.razorpayOrderId,
      amount: order.amount,
      summary: summarise(quote),
    }
  } catch (err: any) {
    console.error('createFoodOrderPaymentOrder error:', err)
    return { success: false, error: 'Could not start the payment. Please try again.' }
  }
}

export interface ConfirmFoodOrderPaymentResult {
  success: boolean
  error?: string
  bookingId?: string
  bookingNumber?: string
  amountPaid?: number
}

export async function confirmFoodOrderPayment(
  response: CheckoutResponse
): Promise<ConfirmFoodOrderPaymentResult> {
  const result = await verifyAndFulfilPayment(response, 'food_order')

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    bookingId: result.bookingId,
    bookingNumber: result.bookingNumber,
    amountPaid: result.amountPaid,
  }
}
