/**
 * Browser-side Razorpay Checkout helper.
 *
 * The checkout SDK is loaded on demand rather than through `next/script` in the
 * root layout: it is only needed on the two payment screens, and a promise-based
 * loader lets a "Pay" click await the script instead of racing it.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

export interface RazorpaySuccessResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export interface OpenCheckoutOptions {
  keyId: string
  orderId: string
  /** Amount in rupees, used for display only - Razorpay charges the order amount. */
  amount: number
  name: string
  description: string
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  notes?: Record<string, string>
}

/** Thrown when the customer closes the checkout modal without paying. */
export class RazorpayDismissedError extends Error {
  constructor() {
    super('Payment cancelled')
    this.name = 'RazorpayDismissedError'
  }
}

/** Thrown when Razorpay reports the payment attempt as failed. */
export class RazorpayFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RazorpayFailedError'
  }
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: (response: any) => void) => void
    }
  }
}

let loaderPromise: Promise<void> | null = null

export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout can only load in the browser'))
  }

  if (window.Razorpay) {
    return Promise.resolve()
  }

  if (loaderPromise) {
    return loaderPromise
  }

  loaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SRC}"]`
    )

    const onLoad = () => resolve()
    const onError = () => {
      // Allow a later attempt to retry the download.
      loaderPromise = null
      reject(new Error('Could not reach Razorpay. Check your connection and try again.'))
    }

    if (existing) {
      existing.addEventListener('load', onLoad)
      existing.addEventListener('error', onError)
      return
    }

    const script = document.createElement('script')
    script.src = CHECKOUT_SRC
    script.async = true
    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
    document.body.appendChild(script)
  })

  return loaderPromise
}

/**
 * Opens Razorpay Checkout and resolves with the signed response once the
 * customer pays. Rejects with RazorpayDismissedError if they close the modal, or
 * RazorpayFailedError if the attempt fails.
 */
export async function openRazorpayCheckout(
  options: OpenCheckoutOptions
): Promise<RazorpaySuccessResponse> {
  await loadRazorpayCheckout()

  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout failed to initialise')
  }

  return new Promise<RazorpaySuccessResponse>((resolve, reject) => {
    let settled = false

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const checkout = new window.Razorpay!({
      key: options.keyId,
      order_id: options.orderId,
      amount: Math.round(options.amount * 100),
      currency: 'INR',
      name: options.name,
      description: options.description,
      prefill: options.prefill,
      notes: options.notes,
      theme: { color: '#B8860B' },
      // Close the modal on failure so `payment.failed` is a terminal outcome and
      // the promise below always settles exactly once.
      retry: { enabled: false },
      handler: (response: RazorpaySuccessResponse) => {
        settle(() => resolve(response))
      },
      modal: {
        ondismiss: () => {
          settle(() => reject(new RazorpayDismissedError()))
        },
      },
    })

    checkout.on('payment.failed', (response: any) => {
      const description =
        response?.error?.description || 'Your payment could not be completed.'
      settle(() => reject(new RazorpayFailedError(description)))
    })

    checkout.open()
  })
}
