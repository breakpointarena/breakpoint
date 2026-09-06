import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { settleWebhookPayment } from '@/lib/payments/verify'

/**
 * Razorpay webhook - the safety net for the customer payment flows.
 *
 * If a customer pays and then closes the tab before the browser can call back,
 * the booking would otherwise never be created even though the money moved. This
 * endpoint fulfils those orders independently.
 *
 * Fulfilment is idempotent (see `claimPaidOrder`), so the webhook and the browser
 * callback racing each other is harmless - whichever arrives first wins and the
 * other reports the same booking.
 *
 * Setup: Razorpay Dashboard -> Settings -> Webhooks
 *   URL:     https://<your-domain>/api/payment/webhook
 *   Events:  payment.captured
 *   Secret:  must match RAZORPAY_WEBHOOK_SECRET
 */

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

function isValidWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', webhookSecret!)
    .update(rawBody)
    .digest('hex')

  const expectedBuffer = Buffer.from(expected, 'utf8')
  const receivedBuffer = Buffer.from(signature, 'utf8')

  if (expectedBuffer.length !== receivedBuffer.length) return false

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  // The signature covers the raw bytes, so the body must be read as text and not
  // re-serialised from a parsed object.
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature')

  if (!signature || !isValidWebhookSignature(rawBody, signature)) {
    console.error('Razorpay webhook signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Only captured payments create bookings. Other events are acknowledged so
  // Razorpay stops retrying them.
  if (event?.event !== 'payment.captured') {
    return NextResponse.json({ received: true, ignored: event?.event ?? 'unknown' })
  }

  const payment = event?.payload?.payment?.entity
  const orderId = payment?.order_id
  const paymentId = payment?.id

  if (!orderId || !paymentId) {
    return NextResponse.json({ error: 'Missing order or payment id' }, { status: 400 })
  }

  try {
    const result = await settleWebhookPayment(orderId, paymentId)

    if (!result.success) {
      console.error(`Webhook fulfilment failed for order ${orderId}: ${result.error}`)

      // Transient failures (database unreachable, capture not propagated yet, a
      // fulfilment still in flight) earn a 5xx so Razorpay redelivers the event.
      if (result.retryable) {
        return NextResponse.json({ received: true, fulfilled: false, retry: true }, { status: 503 })
      }

      // Anything terminal - deliberately rejected, already refunded - is
      // acknowledged so Razorpay stops retrying it.
      return NextResponse.json({ received: true, fulfilled: false })
    }

    return NextResponse.json({
      received: true,
      fulfilled: true,
      bookingNumber: result.bookingNumber,
    })
  } catch (err) {
    console.error('Razorpay webhook error:', err)
    // A 500 tells Razorpay to retry, which is what we want for a transient fault.
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
