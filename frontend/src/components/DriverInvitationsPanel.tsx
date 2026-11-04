import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Clock, Copy, RefreshCw, Share2, UserPlus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import { agencyDriverInvitationApi, type DriverInvitationRow } from '../services/agencyOrganizationApi'

// TO-144-D2 driver invitations (Stitch Roster edit eac990fe), embedded in
// /agency/drivers. Phone-bound, token-hashed, one-use on the server; the raw
// code is shown once here and never stored or listed.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const PHONE_ERROR = 'Driver phone is invalid.'

/** 10-digit Indian mobile -> +91...; otherwise digits with optional leading +, 10-15 long. */
function normalisePhone(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, '')
  if (/^[6-9][0-9]{9}$/.test(compact)) return `+91${compact}`
  if (/^\+?[0-9]{10,15}$/.test(compact)) return compact.startsWith('+') ? compact : `+${compact}`
  return null
}

function displayPhone(phone: string): string {
  const m = phone.match(/^\+91([0-9]{5})([0-9]{5})$/)
  return m ? `+91 ${m[1]} ${m[2]}` : phone
}

const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)

function Badge({ status, expired }: { status: string; expired: boolean }) {
  const label = expired ? 'Expired' : status.charAt(0).toUpperCase() + status.slice(1)
  const good = status === 'accepted'
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

export default function DriverInvitationsPanel() {
  const [rows, setRows] = useState<DriverInvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const key = useRef<string | null>(null)
  const [code, setCode] = useState<{ token: string; phone: string } | null>(null)
  const [confirm, setConfirm] = useState<DriverInvitationRow | null>(null)

  const fetchRows = useCallback(async () => {
    try {
      setError(null)
      setRows(await agencyDriverInvitationApi.list())
    } catch (e) {
      logger.error('[DriverInvitationsPanel] load failed:', e)
      setError(toUserFacingErrorMessage(e, 'Failed to load driver invitations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalised = normalisePhone(phone)
    if (!normalised) {
      setPhoneError(PHONE_ERROR)
      return
    }
    setPhoneError(null)
    if (!key.current) key.current = crypto.randomUUID()
    setBusy(true)
    try {
      const result = await agencyDriverInvitationApi.create({ phone: normalised, idempotencyKey: key.current })
      if (!result.ok) {
        toast.error(result.message)
        if (result.error === 'idempotency_key_reused') key.current = null
        return
      }
      if (result.state === 'created' && result.token) {
        setCode({ token: result.token, phone: normalised })
        toast.success('Invitation created')
      } else {
        toast.success('This invitation already exists. The code cannot be shown again.')
      }
      key.current = null
      setShowForm(false)
      setPhone('')
      await fetchRows()
    } catch (e) {
      logger.error('[DriverInvitationsPanel] create failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to create driver invitation')
      if (message === PHONE_ERROR) setPhoneError(message)
      else toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const doRevoke = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      const result = await agencyDriverInvitationApi.revoke(confirm.id, confirm.version)
      if (result.ok) toast.success('Invitation revoked')
      else toast.error(result.message)
    } catch (e) {
      logger.error('[DriverInvitationsPanel] revoke failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to revoke driver invitation'))
    } finally {
      setConfirm(null)
      setBusy(false)
      // Single refetch in every outcome; never an automatic retry.
      await fetchRows()
    }
  }

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.token)
      toast.success('Code copied')
    } catch {
      toast.error('Could not copy. Select the code and copy it manually.')
    }
  }

  const pending = rows.filter((r) => r.status === 'pending')

  return (
    <section aria-labelledby="driver-invites-heading" className="space-y-3" data-testid="driver-invites">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="driver-invites-heading" className="text-base font-bold text-slate-800 dark:text-slate-100">Driver invitations</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            The driver signs in with the invited phone number and finishes driver registration before appearing in your roster.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setPhoneError(null) }}
          className={`flex items-center gap-2 min-h-[44px] rounded-xl border border-indigo-300 px-4 text-sm font-semibold text-indigo-900 ${FOCUS_RING}`}
        >
          <UserPlus size={16} aria-hidden="true" /> Invite driver
        </button>
      </div>

      {code && (
        <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-4 space-y-3" data-testid="driver-invite-code" role="region" aria-label="Invitation code">
          <p className="text-sm font-semibold text-indigo-950">
            Share this invitation code with {displayPhone(code.phone)} now. It is shown only once and cannot be recovered.
          </p>
          <code className="block select-all break-all rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-base text-slate-900">{code.token}</code>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} className={`flex items-center gap-2 min-h-[44px] rounded-xl border border-indigo-300 bg-white px-4 text-sm font-semibold text-indigo-900 ${FOCUS_RING}`}>
              <Copy size={16} aria-hidden="true" /> Copy
            </button>
            <a
              href={`https://wa.me/${code.phone.replace('+', '')}?text=${encodeURIComponent(`You are invited to drive for our agency on TruckOpti. Sign in with this phone number and enter this code: ${code.token}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 min-h-[44px] rounded-xl border border-indigo-300 bg-white px-4 text-sm font-semibold text-indigo-900 ${FOCUS_RING}`}
            >
              <Share2 size={16} aria-hidden="true" /> Share on WhatsApp
            </a>
            <button onClick={() => setCode(null)} className={`min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white ${FOCUS_RING}`}>
              I have shared it
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-indigo-200 bg-white p-4 dark:bg-slate-800" noValidate>
          <div>
            <label htmlFor="driver-phone" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Driver mobile number</label>
            <input
              id="driver-phone"
              name="driver-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              autoFocus
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={phoneError ? 'true' : 'false'}
              aria-describedby={phoneError ? 'driver-phone-error' : undefined}
              className={`w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm ${FOCUS_RING}`}
            />
            {phoneError && <p id="driver-phone-error" role="alert" className="mt-1 text-xs font-medium text-red-700">{phoneError}</p>}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={`min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
              {busy ? 'Creating…' : 'Create invitation'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div role="status" aria-busy="true" data-testid="driver-invites-loading" className="flex justify-center py-6">
          <RefreshCw className="animate-spin text-indigo-600" size={24} aria-hidden="true" />
          <span className="sr-only">Loading driver invitations…</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={() => { setLoading(true); fetchRows() }} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-600 dark:text-slate-400">No driver invitations yet. Invite a driver by mobile number.</p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:divide-slate-700 dark:border-slate-700">
          {rows.map((r) => {
            const left = daysLeft(r.expires_at)
            const expired = r.status === 'pending' && left <= 0
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{displayPhone(r.invited_phone)}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Sent {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {r.status === 'pending' && ` · ${expired ? 'Expired' : `Expires in ${left} day${left === 1 ? '' : 's'}`}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={r.status} expired={expired} />
                  {r.status === 'pending' && (
                    <button onClick={() => setConfirm(r)} className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-red-800 ${FOCUS_RING}`}>
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {pending.length > 0 && <p className="sr-only" aria-live="polite">{pending.length} pending driver invitations</p>}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-revoke-title"
            onKeyDown={(e) => e.key === 'Escape' && !busy && setConfirm(null)}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="driver-revoke-title" className="text-lg font-bold text-slate-900">Revoke invitation?</h2>
            <p className="text-sm text-slate-700">The code sent to {displayPhone(confirm.invited_phone)} will stop working.</p>
            <div className="flex gap-2">
              <button onClick={doRevoke} disabled={busy} autoFocus className={`min-h-[44px] flex-1 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                Revoke invitation
              </button>
              <button onClick={() => setConfirm(null)} disabled={busy} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
