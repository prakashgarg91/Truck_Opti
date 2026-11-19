import React from 'react'
import { Link } from 'react-router-dom'
import { LifeBuoy } from 'lucide-react'
import { SUPPORT_EMAIL } from '../../config/support'
import { BTN_PRIMARY, FOCUS_RING } from './styles'

// Shown when Razorpay captured the payment but the server refused to apply it (verify answered
// state "support"). Nothing happens by itself here: the buyer must contact support. Do not add
// promises of an email or automatic activation.
export const PAYMENT_SUPPORT_FALLBACK_MESSAGE =
  'We could not apply it automatically. Please contact support and we will fix it.'

const CARD = 'rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-800'

interface PaymentSupportNoticeProps {
  /** The server's user-facing message; the fallback is used when it is missing or blank. */
  message?: string | null
  /** Razorpay payment id (pay_...), quoted so support can find the payment. */
  paymentId?: string | null
}

export const PaymentSupportNotice: React.FC<PaymentSupportNoticeProps> = ({ message, paymentId }) => {
  const text = message && message.trim() ? message.trim() : PAYMENT_SUPPORT_FALLBACK_MESSAGE
  const reference = paymentId && paymentId.trim() ? paymentId.trim() : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div role="status" className={`${CARD} max-w-md text-center`}>
        <LifeBuoy className="mx-auto h-10 w-10 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">We received your payment</h1>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{text}</p>
        <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">You do not need to pay again.</p>
        {reference && (
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
            Quote this payment reference: <span className="break-all font-mono font-semibold">{reference}</span>
          </p>
        )}
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
          Contact support:{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className={`inline-flex min-h-[44px] items-center font-semibold text-indigo-700 underline dark:text-indigo-300 ${FOCUS_RING}`}
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link to="/subscription" className={BTN_PRIMARY}>Back to subscription</Link>
        </div>
      </div>
    </div>
  )
}

export default PaymentSupportNotice
