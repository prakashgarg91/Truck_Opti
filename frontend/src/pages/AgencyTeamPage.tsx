import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Clock, Copy, MailPlus, RefreshCw, ShieldAlert, Share2, UserMinus, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyTeamApi,
  type InvitationRow,
  type MembershipRow,
  type MembershipScope,
} from '../services/agencyOrganizationApi'

// TO-144-D2 Team & Access (Stitch screen 0691bdff). Owner-only: staff
// memberships and invitations. The server (RLS + command RPCs) is the
// authority; this page renders states and never decides access.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const SCOPES: ReadonlyArray<{ value: MembershipScope; label: string }> = [
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'fleet_manager', label: 'Fleet manager' },
  { value: 'finance', label: 'Finance' },
  { value: 'viewer', label: 'Viewer' },
]
const SCOPE_LABEL: Record<string, string> = Object.fromEntries(SCOPES.map((s) => [s.value, s.label]))

const DENIAL_MESSAGES = new Set(['Agency approval is required.', 'Sign-in is required.'])

type Confirm =
  | { kind: 'member'; id: string; version: number; name: string }
  | { kind: 'invitation'; id: string; version: number; name: string }

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function StatusBadge({ status, expired }: { status: string; expired?: boolean }) {
  const label = expired ? 'Expired' : status.charAt(0).toUpperCase() + status.slice(1)
  const good = status === 'active' || status === 'accepted'
  const wait = status === 'pending' && !expired
  const Icon = good ? Check : wait ? Clock : X
  const tone = good
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : wait
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : 'bg-slate-100 text-slate-700 border-slate-300'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  )
}

export default function AgencyTeamPage() {
  useEffect(() => {
    document.title = 'Team & Access - TruckOpti'
  }, [])

  const [members, setMembers] = useState<MembershipRow[]>([])
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [scope, setScope] = useState<MembershipScope>('dispatcher')
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  // One idempotency key per invite intent; a failed submit can be retried safely.
  const inviteKey = useRef<string | null>(null)
  const [shareCode, setShareCode] = useState<{ token: string; email: string } | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [m, i] = await Promise.all([agencyTeamApi.listMembers(), agencyTeamApi.listInvitations()])
      setMembers(m)
      setInvitations(i)
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyTeamPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load team')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const emailByInvitation = useMemo(() => new Map(invitations.map((i) => [i.id, i.invited_email])), [invitations])
  const pending = useMemo(() => invitations.filter((i) => i.status === 'pending'), [invitations])
  const activeMembers = members.filter((m) => m.status === 'active')
  const expiringSoon = pending.filter((i) => daysLeft(i.expires_at) <= 2 && daysLeft(i.expires_at) > 0)

  const memberName = (m: MembershipRow) =>
    (m.invitation_id && emailByInvitation.get(m.invitation_id)) || `Team member ${m.user_id.slice(0, 6)}`

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim()) {
      toast.error('Enter the email address to invite')
      return
    }
    if (!inviteKey.current) inviteKey.current = crypto.randomUUID()
    setBusy(true)
    try {
      const result = await agencyTeamApi.invite({
        email: email.trim(),
        scope,
        expiresInDays: days,
        idempotencyKey: inviteKey.current,
      })
      if (!result.ok) {
        toast.error(result.message)
        if (result.error === 'idempotency_key_reused') inviteKey.current = null
        return
      }
      if (result.state === 'created' && result.token) {
        setShareCode({ token: result.token, email: email.trim() })
        toast.success('Invitation created')
      } else {
        toast.success('This invitation already exists. The code cannot be shown again.')
      }
      inviteKey.current = null
      setShowInvite(false)
      setEmail('')
      await fetchData()
    } catch (e) {
      logger.error('[AgencyTeamPage] invite failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to create invitation'))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      const result =
        confirm.kind === 'member'
          ? await agencyTeamApi.revokeMember(confirm.id, confirm.version)
          : await agencyTeamApi.revokeInvitation(confirm.id, confirm.version)
      if (result.ok) toast.success(confirm.kind === 'member' ? 'Access revoked' : 'Invitation revoked')
      else toast.error(result.message)
      setConfirm(null)
      // Single refetch in every outcome; never an automatic retry.
      await fetchData()
    } catch (e) {
      logger.error('[AgencyTeamPage] revoke failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to revoke'))
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async () => {
    if (!shareCode) return
    try {
      await navigator.clipboard.writeText(shareCode.token)
      toast.success('Code copied')
    } catch {
      toast.error('Could not copy. Select the code and copy it manually.')
    }
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="team-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading team…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="team-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">Only the agency owner can manage team access</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the owner of your agency to add or change team members.</p>
        </div>
      </div>
    )
  }

  const whatsappHref = shareCode
    ? `https://wa.me/?text=${encodeURIComponent(`You are invited to join our agency team on TruckOpti. Sign in with ${shareCode.email} and enter this code: ${shareCode.token}`)}`
    : '#'

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Team &amp; Access</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Staff see only what their scope allows. You remain the owner.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className={`flex items-center gap-2 min-h-[44px] bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
        >
          <MailPlus size={16} aria-hidden="true" /> Invite team member
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={() => { setLoading(true); fetchData() }} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>
            Retry
          </button>
        </div>
      )}

      {shareCode && (
        <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-4 space-y-3" data-testid="team-share-code" role="region" aria-label="Invitation code">
          <p className="text-sm font-semibold text-indigo-950">
            Share this invitation code with {shareCode.email} now. It is shown only once and cannot be recovered.
          </p>
          <code className="block select-all break-all rounded-lg bg-white border border-indigo-200 px-3 py-2 font-mono text-base text-slate-900">
            {shareCode.token}
          </code>
          <div className="flex flex-wrap gap-2">
            <button onClick={copyCode} className={`flex items-center gap-2 min-h-[44px] rounded-xl bg-white border border-indigo-300 px-4 text-sm font-semibold text-indigo-900 ${FOCUS_RING}`}>
              <Copy size={16} aria-hidden="true" /> Copy
            </button>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 min-h-[44px] rounded-xl bg-white border border-indigo-300 px-4 text-sm font-semibold text-indigo-900 ${FOCUS_RING}`}>
              <Share2 size={16} aria-hidden="true" /> Share on WhatsApp
            </a>
            <button onClick={() => setShareCode(null)} className={`min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white ${FOCUS_RING}`}>
              I have shared it
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ['Active members', activeMembers.length],
          ['Pending invitations', pending.length],
          ['Expiring within 48h', expiringSoon.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="members-heading" data-testid="team-members" className="rounded-2xl border border-slate-200 bg-white">
        <h2 id="members-heading" className="px-4 pt-4 text-base font-bold text-slate-900">Members</h2>
        <ul className="divide-y divide-slate-100 p-2">
          <li className="flex flex-wrap items-center justify-between gap-2 px-2 py-3">
            <span className="font-medium text-slate-900">Owner <span className="text-slate-600">(you)</span></span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Full access</span>
          </li>
          {members.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-slate-600">
              <Users className="mx-auto mb-2 text-slate-400" size={24} aria-hidden="true" />
              No team members yet. Invite your first dispatcher.
            </li>
          )}
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-3">
              <div>
                <p className="font-medium text-slate-900">{memberName(m)}</p>
                <p className="text-xs text-slate-600">Joined {formatDate(m.granted_at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-900">
                  {SCOPE_LABEL[m.scope] ?? m.scope}
                </span>
                <StatusBadge status={m.status} />
                {m.status === 'active' && (
                  <button
                    onClick={() => setConfirm({ kind: 'member', id: m.id, version: m.version, name: memberName(m) })}
                    className={`flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-red-800 ${FOCUS_RING}`}
                  >
                    <UserMinus size={14} aria-hidden="true" /> Revoke access
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="invitations-heading" data-testid="team-invitations" className="rounded-2xl border border-slate-200 bg-white">
        <h2 id="invitations-heading" className="px-4 pt-4 text-base font-bold text-slate-900">Pending invitations</h2>
        <ul className="divide-y divide-slate-100 p-2">
          {pending.length === 0 && <li className="px-2 py-6 text-center text-sm text-slate-600">No pending invitations.</li>}
          {pending.map((i) => {
            const left = daysLeft(i.expires_at)
            const expired = left <= 0
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-3">
                <div>
                  <p className="font-medium text-slate-900">{i.invited_email}</p>
                  <p className="text-xs text-slate-600">
                    Sent {formatDate(i.created_at)} · {expired ? 'Expired' : `Expires in ${left} day${left === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-900">
                    {SCOPE_LABEL[i.scope] ?? i.scope}
                  </span>
                  <StatusBadge status={i.status} expired={expired} />
                  <button
                    onClick={() => setConfirm({ kind: 'invitation', id: i.id, version: i.version, name: i.invited_email })}
                    className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-red-800 ${FOCUS_RING}`}
                  >
                    Revoke invitation
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {showInvite && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={() => !busy && setShowInvite(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            onSubmit={handleInvite}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && !busy && setShowInvite(false)}
            className="h-full w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 shadow-xl"
          >
            <h2 id="invite-title" className="text-lg font-bold text-slate-900">Invite team member</h2>
            <div>
              <label htmlFor="invite-email" className="block text-sm font-medium text-slate-800">Email</label>
              <input
                id="invite-email"
                name="invite-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
            </div>
            <div>
              <label htmlFor="invite-scope" className="block text-sm font-medium text-slate-800">Access scope</label>
              <select
                id="invite-scope"
                name="invite-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as MembershipScope)}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              >
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-600">The owner role cannot be shared.</p>
            </div>
            <div>
              <label htmlFor="invite-days" className="block text-sm font-medium text-slate-800">Invitation valid for (days)</label>
              <input
                id="invite-days"
                name="invite-days"
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={`min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                {busy ? 'Creating…' : 'Create invitation'}
              </button>
              <button type="button" onClick={() => setShowInvite(false)} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onKeyDown={(e) => e.key === 'Escape' && !busy && setConfirm(null)}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="confirm-title" className="text-lg font-bold text-slate-900">
              {confirm.kind === 'member' ? 'Revoke access?' : 'Revoke invitation?'}
            </h2>
            <p className="text-sm text-slate-700">
              {confirm.kind === 'member'
                ? `${confirm.name} will lose access to your agency immediately.`
                : `The code sent to ${confirm.name} will stop working.`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={busy}
                autoFocus
                className={`min-h-[44px] flex-1 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
              >
                {confirm.kind === 'member' ? 'Revoke access' : 'Revoke invitation'}
              </button>
              <button onClick={() => setConfirm(null)} disabled={busy} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
