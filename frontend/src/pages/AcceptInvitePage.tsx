import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, MailWarning, RefreshCw } from 'lucide-react'
import { agencyInvitesApi, INVITE_FAILURE_MESSAGES, type InviteFailureCode, type InviteOutcome } from '../services/agencyInvitesApi'

// /invite/:token. The route is wrapped in ProtectedRoute, so a signed-out visitor is sent to
// /login with the return path and comes back here. One accept call per visit (no automatic retry:
// the server answers a repeat with idempotent_replay anyway); a retry is an explicit button.
// The code is never logged and never written anywhere but the RPC argument.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const FAILURE_TITLES: Record<InviteFailureCode, string> = {
  not_found: 'Invitation not found',
  expired: 'Invitation expired',
  already_used: 'Invitation already used',
  revoked: 'Invitation cancelled',
  wrong_account: 'Different account',
  owner_blocked: 'You own this agency',
  approval_required: 'Agency not active',
  sign_in_required: 'Sign in required',
  driver_profile_required: 'Driver profile needed',
  driver_not_approved: 'Driver approval pending',
  driver_employed_elsewhere: 'Already employed',
  driver_profile_conflict: 'Profile conflict',
  unavailable: 'Something went wrong',
}

const SCOPE_LABELS: Record<string, string> = {
  dispatcher: 'Dispatcher',
  fleet_manager: 'Fleet manager',
  finance: 'Finance',
  viewer: 'Viewer',
}

export default function AcceptInvitePage() {
  const { token = '' } = useParams<{ token: string }>()
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null)
  const started = useRef(false)

  useEffect(() => {
    document.title = 'Accept invitation - TruckOpti'
  }, [])

  const run = useCallback(async () => {
    setOutcome(null)
    setOutcome(await agencyInvitesApi.accept(token))
  }, [token])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  if (!outcome) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center p-6" data-testid="invite-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Accepting your invitation…</span>
      </div>
    )
  }

  if (outcome.status === 'accepted') {
    const isDriver = outcome.kind === 'driver'
    const scope = outcome.scope ? SCOPE_LABELS[outcome.scope] ?? outcome.scope : null
    return (
      <main className="mx-auto max-w-md p-6" data-testid="invite-accepted">
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto text-emerald-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">
            {outcome.alreadyJoined || outcome.replay ? 'You are already part of this agency' : 'You have joined the agency'}
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            {isDriver
              ? 'You now appear in the agency driver roster and can receive jobs.'
              : `You now have access${scope ? ` as ${scope}` : ''}. What you can see depends on your access level.`}
          </p>
          <Link
            to={isDriver ? '/driver/dashboard' : '/agency/dashboard'}
            className={`mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white ${FOCUS_RING}`}
          >
            {isDriver ? 'Go to my driver dashboard' : 'Go to the agency workspace'}
          </Link>
        </div>
      </main>
    )
  }

  if (outcome.status === 'limit') {
    return (
      <main className="mx-auto max-w-md p-6" data-testid="invite-limit">
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <MailWarning className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">The agency has no room right now</h1>
          <p className="mt-1 text-sm text-slate-700">
            {outcome.info.code === 'SB002'
              ? 'The agency plan is read-only at the moment, so new people cannot join yet.'
              : 'The agency has reached the limit of its plan, so you cannot join yet.'}{' '}
            Ask the agency owner to update the plan, then open this link again.
          </p>
          <button
            type="button"
            onClick={() => void run()}
            className={`mt-4 min-h-[44px] rounded-xl border border-amber-300 bg-white px-5 text-sm font-semibold text-amber-900 ${FOCUS_RING}`}
          >
            Try again
          </button>
        </div>
      </main>
    )
  }

  const retryable = outcome.code === 'unavailable'
  const needsDriverRegistration = outcome.code === 'driver_profile_required'
  return (
    <main className="mx-auto max-w-md p-6" data-testid="invite-failed" data-code={outcome.code}>
      <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <MailWarning className="mx-auto text-amber-700" size={32} aria-hidden="true" />
        <h1 className="mt-3 text-lg font-bold text-slate-900">{FAILURE_TITLES[outcome.code]}</h1>
        <p className="mt-1 text-sm text-slate-700">{outcome.message || INVITE_FAILURE_MESSAGES[outcome.code]}</p>
        {retryable ? (
          <button
            type="button"
            onClick={() => void run()}
            className={`mt-4 min-h-[44px] rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white ${FOCUS_RING}`}
          >
            Try again
          </button>
        ) : (
          <Link
            to={needsDriverRegistration ? '/driver/register' : '/'}
            className={`mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white ${FOCUS_RING}`}
          >
            {needsDriverRegistration ? 'Register as a driver' : 'Go to my account'}
          </Link>
        )}
      </div>
    </main>
  )
}
