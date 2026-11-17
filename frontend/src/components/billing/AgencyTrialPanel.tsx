import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Gift, ShieldAlert } from 'lucide-react'
import { agencyOwnerApi, entitlementApi, TrialError } from '../../services/subscriptionApi'
import { trialErrorMessage, type TrialErrorCode } from '../../lib/billingState'
import { useAuthStore } from '../../stores/authStore'
import { BTN_PRIMARY, FOCUS_RING } from './styles'

interface Props {
  /** Refetch the entitlement after the trial starts (the server is the authority). */
  onStarted: () => void | Promise<unknown>
}

/**
 * Offered when the agency has no subscription (status none). Owner only:
 * staff see an explanation instead of the button. The RPC is owner-only
 * server-side too, so an unknown owner check still ends in forbidden_scope.
 */
export default function AgencyTrialPanel({ onStarted }: Props) {
  const userId = useAuthStore((s) => s.user?.id)
  const [busy, setBusy] = useState(false)
  const [errorCode, setErrorCode] = useState<TrialErrorCode | null | undefined>(undefined)

  const ownerQuery = useQuery({
    queryKey: ['agency-is-owner', userId],
    queryFn: () => agencyOwnerApi.isOwner(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    retry: 0,
  })

  const start = async () => {
    setBusy(true)
    setErrorCode(undefined)
    try {
      await entitlementApi.startTrial()
      await onStarted()
    } catch (e) {
      setErrorCode(e instanceof TrialError ? e.code : null)
    } finally {
      setBusy(false)
    }
  }

  if (ownerQuery.isLoading) {
    return <div role="status" aria-label="Checking account" className="min-h-[44px]" />
  }

  if (ownerQuery.data === false) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="trial-staff-note">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>Only the agency owner can start the free trial. Ask the owner of your agency to start it from this page.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="trial-offer">
      <p className="max-w-md text-sm text-slate-700 dark:text-slate-200">
        Try every feature free for 14 days. No payment needed to start.
      </p>
      <button type="button" onClick={() => void start()} disabled={busy} className={BTN_PRIMARY}>
        <Gift className="h-4 w-4" aria-hidden="true" />
        {busy ? 'Starting your trial...' : 'Start your 14-day free trial'}
      </button>
      {errorCode !== undefined && (
        <div role="alert" className="max-w-md text-sm text-red-700 dark:text-red-300">
          <p>{trialErrorMessage(errorCode)}</p>
          {errorCode === 'identity_required' && (
            <Link to="/agency/profile" className={`mt-1 inline-flex min-h-[44px] items-center font-semibold underline ${FOCUS_RING}`}>
              Open agency profile
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
