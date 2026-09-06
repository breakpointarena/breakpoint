'use server'

import { getRazorpayKeyId, isRazorpayConfigured, describeRazorpayConfig } from '@/lib/razorpay/client'
import { quoteDeviceBooking, type DeviceBookingInput, type DeviceBookingQuote } from '@/lib/payments/quote'
import { createPaymentOrder } from '@/lib/payments/orders'
import { fulfilDeviceBooking } from '@/lib/payments/fulfil'
import { verifyAndFulfilPayment, type CheckoutResponse } from '@/lib/payments/verify'
import { requireVerifiedPhone } from '@/lib/auth/customer-session'

/**
 * Razorpay payment flow for device slot bookings.
 *
 * The booking row is only created after the payment is verified, so an abandoned
 * or failed checkout leaves nothing behind.
 */

export interface CreateBookingOrderResult {
  success: boolean
  error?: string
  /** Set when the customer must (re)verify their phone before continuing. */
  verificationRequired?: boolean
  /** True when the booking is free after discounts and no payment is needed. */
  freeBooking?: boolean
  keyId?: string
  orderId?: string
  amount?: number
  /** Server-computed breakdown, so the UI can show the authoritative price. */
  summary?: {
    deviceSubtotal: number
    addonsTotal: number
    subscriptionDiscount: number
    promoDiscount: number
    happyHourDiscount: number
    happyHourRuleName: string | null
    totalAmount: number
  }
  /** Set for the free-booking path, where no Razorpay round trip happens. */
  bookingId?: string
  bookingNumber?: string
}

function summarise(quote: DeviceBookingQuote) {
  return {
    deviceSubtotal: quote.deviceSubtotal,
    addonsTotal: quote.addonsTotal,
    subscriptionDiscount: quote.subscriptionDiscount,
    promoDiscount: quote.promoDiscount,
    happyHourDiscount: quote.happyHourDiscount,
    happyHourRuleName: quote.happyHourRuleName,
    totalAmount: quote.totalAmount,
  }
}

export async function createDeviceBookingPaymentOrder(
  input: DeviceBookingInput
): Promise<CreateBookingOrderResult> {
  try {
    // Proof of phone ownership, before anything is priced or reserved. This is a
    // public HTTP endpoint, so the phone in `input` is only a claim until the
    // session cookie backs it up.
    const auth = await requireVerifiedPhone(input.phone)
    if (!auth.ok) {
      return { success: false, error: auth.error, verificationRequired: true }
    }

    const quoted = await quoteDeviceBooking({ ...input, phone: auth.phone })

    if (!quoted.success) {
      return { success: false, error: quoted.error }
    }

    const quote = quoted.quote

    // Fully discounted booking - nothing to charge, so skip the gateway entirely.
    if (quote.totalAmount < 1) {
      const result = await fulfilDeviceBooking(quote, {
        razorpayOrderId: '',
        razorpayPaymentId: '',
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      return {
        success: true,
        freeBooking: true,
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
        error: 'Online payments are not available right now. Please contact the arena.',
      }
    }

    const order = await createPaymentOrder({
      purpose: 'device_booking',
      amount: quote.totalAmount,
      quote,
      customerPhone: quote.customer.phone,
      notes: {
        device: quote.deviceTypeName,
        slot: `${quote.selectedDate} ${quote.slotLabel}`,
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
    console.error('createDeviceBookingPaymentOrder error:', err)
    return { success: false, error: 'Could not start the payment. Please try again.' }
  }
}

export interface ConfirmBookingPaymentResult {
  success: boolean
  error?: string
  bookingId?: string
  bookingNumber?: string
  amountPaid?: number
}

export async function confirmDeviceBookingPayment(
  response: CheckoutResponse
): Promise<ConfirmBookingPaymentResult> {
  const result = await verifyAndFulfilPayment(response, 'device_booking')

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
