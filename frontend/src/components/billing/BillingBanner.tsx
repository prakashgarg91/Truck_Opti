import { AlertTriangle, Clock, Lock } from 'lucide-react'
import type { BillingView } from '../../lib/billingState'
import { BTN_PRIMARY } from './styles'

interface Props {
  view: BillingView
  /** Pay now / Renew destination. */
  onAction: () => void
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** One banner per state: trial, past_due, grace (read-only), expired (lock). */
export default function BillingBanner({ view, onAction }: Props) {
  if (!view.banner) return null

  if (view.banner === 'trial') {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
        <p className="flex items-start gap-2 text-sm font-medium">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {view.daysLeft !== null ? `Free trial: ${plural(view.daysLeft, 'day')} left.` : 'You are on a free trial.'} Pick a plan to keep going.
        </p>
        <button type="button" onClick={onAction} className={BTN_PRIMARY}>Choose a plan</button>
      </div>
    )
  }

  if (view.banner === 'past_due') {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-4 text-orange-900 sm:flex-row sm:items-center sm:justify-between dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-100">
        <p className="flex items-start gap-2 text-sm font-medium">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Your last payment did not go through. Everything still works for now. Pay now to avoid a read-only lock.
        </p>
        <button type="button" onClick={onAction} className={BTN_PRIMARY}>Pay now</button>
      </div>
    )
  }

  if (view.banner === 'grace') {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between dark:border-red-700 dark:bg-red-900/20 dark:text-red-100">
        <p className="flex items-start gap-2 text-sm font-medium">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Read-only grace period{view.daysLeft !== null ? `: ${plural(view.daysLeft, 'day')} left` : ''}. You can view and export your data, but new trucks, drivers, staff and order imports are disabled until you renew.
        </p>
        <button type="button" onClick={onAction} className={BTN_PRIMARY}>Renew</button>
      </div>
    )
  }

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-400 bg-red-100 p-4 text-red-950 sm:flex-row sm:items-center sm:justify-between dark:border-red-600 dark:bg-red-900/30 dark:text-red-50">
      <p className="flex items-start gap-2 text-sm font-medium">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Your subscription has expired. Dispatch and new records are locked. Your data stays visible.
      </p>
      <button type="button" onClick={onAction} className={BTN_PRIMARY}>Renew</button>
    </div>
  )
}
