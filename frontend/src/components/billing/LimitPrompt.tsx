import { AlertTriangle } from 'lucide-react'
import type { SubscriptionErrorInfo } from '../../lib/billingState'
import { BTN_PRIMARY, BTN_SECONDARY } from './styles'

interface Props {
  info: SubscriptionErrorInfo
  onAction: () => void
  onDismiss?: () => void
}

const ACTION_LABEL: Record<SubscriptionErrorInfo['action'], string> = {
  upgrade: 'Upgrade plan',
  renew: 'Renew',
}

/** Prompt built from a parsed SB001/SB002/SB003 error (parseSubscriptionError). */
export default function LimitPrompt({ info, onAction, onDismiss }: Props) {
  return (
    <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-100">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {info.title}
      </p>
      <p className="mt-1 text-sm">{info.message}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onAction} className={BTN_PRIMARY}>{ACTION_LABEL[info.action]}</button>
        {onDismiss && <button type="button" onClick={onDismiss} className={BTN_SECONDARY}>Dismiss</button>}
      </div>
    </div>
  )
}
