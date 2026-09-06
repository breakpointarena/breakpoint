import Razorpay from 'razorpay'
import crypto from 'crypto'

const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET

/**
 * Razorpay is optional in local/dev environments. Every entry point checks this
 * before touching the SDK so an unconfigured environment fails with a clear
 * message instead of crashing at module load.
 *
 * "Present" is not the same as "usable". A freshly copied .env.example leaves
 * `your-razorpay-test-key-id` in place, which is a non-empty string - so a
 * naive truthy check called that configured, let the request reach the gateway,
 * and turned a 401 into the generic "Could not start the payment" catch. Real
 * keys always carry the rzp_test_ / rzp_live_ prefix, so the placeholder is
 * recognisable and can be reported as what it is: unconfigured.
 */
export function isRazorpayConfigured(): boolean {
  if (!keyId || !keySecret) return false
  if (!/^rzp_(test|live)_/.test(keyId)) return false
  if (keySecret.startsWith('your-')) return false
  return true
}

/** Explains *why* Razorpay is unusable, for logs - never shown to a customer. */
export function describeRazorpayConfig(): string {
  if (!keyId) return 'NEXT_PUBLIC_RAZORPAY_KEY_ID is not set'
  if (!keySecret) return 'RAZORPAY_KEY_SECRET is not set'
  if (!/^rzp_(test|live)_/.test(keyId)) {
    return `NEXT_PUBLIC_RAZORPAY_KEY_ID does not look like a Razorpay key (expected rzp_test_… or rzp_live_…, got "${keyId.slice(0, 12)}…")`
  }
  if (keySecret.startsWith('your-')) return 'RAZORPAY_KEY_SECRET is still the placeholder from .env.example'
  return 'configured'
}

export function getRazorpayKeyId(): string | null {
  return keyId || null
}

let instance: Razorpay | null = null

function getClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new Error(
      'Razorpay is not configured. Set NEXT_PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    )
  }

  if (!instance) {
    instance = new Razorpay({ key_id: keyId!, key_secret: keySecret! })
  }

  return instance
}

export interface CreateOrderParams {
  amount: number // in rupees
  receipt: string // Razorpay caps receipts at 40 characters
  notes?: Record<string, string>
}

/** Razorpay works in paise; every amount we hold is in rupees. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

export async function createRazorpayOrder(params: CreateOrderParams) {
  const order = await getClient().orders.create({
    amount: toPaise(params.amount),
    currency: 'INR',
    receipt: params.receipt.slice(0, 40),
    notes: params.notes,
  })

  return order
}

/**
 * Verifies the checkout signature returned to the browser.
 *
 * Razorpay signs `order_id|payment_id` with the key secret. Compared in constant
 * time so the check does not leak the expected digest through timing.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (!isRazorpayConfigured() || !orderId || !paymentId || !signature) {
    return false
  }

  const expected = crypto
    .createHmac('sha256', keySecret!)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')

  const expectedBuffer = Buffer.from(expected, 'utf8')
  const receivedBuffer = Buffer.from(signature, 'utf8')

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function fetchPaymentDetails(paymentId: string) {
  return await getClient().payments.fetch(paymentId)
}

export async function fetchOrderDetails(orderId: string) {
  return await getClient().orders.fetch(orderId)
}

export async function refundPayment(paymentId: string, amount?: number) {
  return await getClient().payments.refund(paymentId, {
    amount: amount !== undefined ? toPaise(amount) : undefined,
  })
}
