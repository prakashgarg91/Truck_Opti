// Opens Razorpay Checkout for an order the SERVER created and priced.
// The result only says what the buyer did in the popup. It is never proof of
// activation: callers refetch the entitlement afterwards.

export interface RazorpayPaid {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export type RazorpayOutcome =
  | { kind: 'paid'; payload: RazorpayPaid }
  | { kind: 'dismissed' }
  | { kind: 'failed'; message: string }

interface RazorpayWindow {
  Razorpay?: new (options: Record<string, unknown>) => {
    open: () => void
    on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void
  }
}

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as RazorpayWindow).Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export async function openRazorpayCheckout(input: {
  keyId: string
  orderId: string
  /** Server-provided order amount in paise (shown by Razorpay, not computed here). */
  amount: number
  currency: string
  description: string
  prefill: { name?: string; email?: string; contact?: string }
}): Promise<RazorpayOutcome> {
  if (!(await loadScript())) {
    return { kind: 'failed', message: 'Could not load the payment window. Check your connection and try again.' }
  }

  return new Promise<RazorpayOutcome>((resolve) => {
    try {
      const Razorpay = (window as unknown as RazorpayWindow).Razorpay
      if (!Razorpay) {
        resolve({ kind: 'failed', message: 'The payment window is unavailable. Please try again.' })
        return
      }
      const instance = new Razorpay({
        key: input.keyId,
        order_id: input.orderId,
        amount: input.amount,
        currency: input.currency,
        name: 'TruckOpti',
        description: input.description,
        prefill: input.prefill,
        theme: { color: '#4f46e5' },
        handler: (response: RazorpayPaid) => resolve({ kind: 'paid', payload: response }),
        modal: { ondismiss: () => resolve({ kind: 'dismissed' }) },
      })
      instance.on('payment.failed', (response) => {
        resolve({ kind: 'failed', message: response?.error?.description || 'The payment did not go through. You have not been charged for a plan.' })
      })
      instance.open()
    } catch {
      resolve({ kind: 'failed', message: 'Could not open the payment window. Please try again.' })
    }
  })
}
