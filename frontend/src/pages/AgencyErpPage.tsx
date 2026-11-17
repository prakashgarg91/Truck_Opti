import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, KeyRound, PauseCircle, PlayCircle, Plug, RefreshCw, ShieldAlert, ShieldOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyErpApi,
  type AgreementOption,
  type ConnectionKind,
  type ConnectionRow,
  type ConnectionStatus,
  type ErpEventRow,
  type EventOutcome,
} from '../services/agencyErpApi'

// TO-151 ERP connections (owner and dispatcher). A connection is one credentialed feed per client
// agreement. The database returns the secret in plaintext exactly once, on create and on rotate.
// SECRET RULES for this page: the secret lives only in `reveal`, is cleared when the panel is
// dismissed (or the page unmounts), is never logged, never put in a toast, URL or any other state,
// and is never read back from the database (secret_hash is not selectable; only the last 4
// characters, secret_hint, are shown in the list).

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const STATUS_STYLE: Record<ConnectionStatus, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  paused: { label: 'Paused', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  revoked: { label: 'Revoked', tone: 'bg-red-50 text-red-800 border-red-300' },
}

const OUTCOME_STYLE: Record<EventOutcome, { label: string; tone: string }> = {
  accepted: { label: 'Accepted', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Rejected', tone: 'bg-red-50 text-red-800 border-red-300' },
  duplicate: { label: 'Duplicate', tone: 'bg-slate-100 text-slate-800 border-slate-300' },
}

const KIND_LABELS: Record<ConnectionKind, string> = { csv_drop: 'CSV drop', webhook: 'Webhook' }

type Action = 'pause' | 'resume' | 'revoke' | 'rotate'

const ACTION_COPY: Record<Action, { button: string; confirm: string; busy: string; warning: string }> = {
  pause: {
    button: 'Pause',
    confirm: 'Pause connection',
    busy: 'Pausing…',
    warning: 'While paused, the ERP system cannot send orders. You can resume it at any time.',
  },
  resume: {
    button: 'Resume',
    confirm: 'Resume connection',
    busy: 'Resuming…',
    warning: 'The ERP system will be able to send orders again.',
  },
  revoke: {
    button: 'Revoke',
    confirm: 'Revoke permanently',
    busy: 'Revoking…',
    warning: 'Revoking is final. The connection stops working for good and cannot be resumed. Create a new connection to reconnect.',
  },
  rotate: {
    button: 'Rotate secret',
    confirm: 'Rotate secret',
    busy: 'Rotating…',
    warning: 'The current secret stops working immediately. Your ERP system must be updated with the new secret.',
  },
}

const MAX_NAME = 60

function Chip({ tone, label }: { tone: string; label: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function formatProblems(problems: unknown): string {
  try {
    return JSON.stringify(problems, null, 2) ?? ''
  } catch {
    return 'The details could not be shown.'
  }
}

interface Reveal {
  heading: string
  connectionName: string
  secret: string
}

export default function AgencyErpPage() {
  useEffect(() => {
    document.title = 'ERP connections - TruckOpti'
  }, [])

  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [agreements, setAgreements] = useState<AgreementOption[]>([])
  const [recent, setRecent] = useState<ErpEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  // The ONLY place the plaintext secret is held. Cleared on dismiss.
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)

  // One idempotency key per create intent: a failed request retries with the same key; a
  // completed one (success or typed refusal) starts a new intent next time.
  const createKey = useRef<string | null>(null)

  const [agreementId, setAgreementId] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ConnectionKind>('webhook')
  const [formError, setFormError] = useState<string | null>(null)

  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<{ id: string; action: Action } | null>(null)
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string } | null>(null)

  const [eventsFor, setEventsFor] = useState<string | null>(null)
  const [events, setEvents] = useState<ErpEventRow[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [openProblems, setOpenProblems] = useState<Set<string>>(new Set())

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [c, a, r] = await Promise.all([
        agencyErpApi.listConnections(),
        agencyErpApi.listAgreements(),
        agencyErpApi.listRecentEvents(),
      ])
      setConnections(c)
      setAgreements(a)
      setRecent(r)
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyErpPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load connections')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEvents = useCallback(async (connectionId: string) => {
    setEventsLoading(true)
    setEventsError(null)
    try {
      setEvents(await agencyErpApi.listEvents(connectionId))
    } catch (e) {
      logger.error('[AgencyErpPage] events load failed:', e)
      setEventsError(toUserFacingErrorMessage(e, 'Failed to load connection events'))
    } finally {
      setEventsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (reveal) revealRef.current?.focus()
  }, [reveal])

  const agreementById = useMemo(() => new Map(agreements.map((a) => [a.id, a])), [agreements])
  const activeAgreements = useMemo(() => agreements.filter((a) => a.status === 'active'), [agreements])
  const lastEvent = useMemo(() => {
    const map = new Map<string, ErpEventRow>()
    // recent is newest first; keep the first row seen per connection.
    for (const ev of recent) if (!map.has(ev.connection_id)) map.set(ev.connection_id, ev)
    return map
  }, [recent])

  const dismissReveal = () => setReveal(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!agreementId) return setFormError('Choose a client agreement.')
    if (!trimmed) return setFormError('Enter a connection name.')
    if (trimmed.length > MAX_NAME) return setFormError(`Keep the name to ${MAX_NAME} characters or fewer.`)
    setFormError(null)
    if (!createKey.current) createKey.current = crypto.randomUUID()
    setBusy('create')
    try {
      const result = await agencyErpApi.createConnection({ agreementId, name: trimmed, kind, idempotencyKey: createKey.current })
      createKey.current = null
      if (result.ok) {
        if (result.secret) {
          setReveal({ heading: 'Connection created', connectionName: trimmed, secret: result.secret })
          toast.success('Connection created')
        } else {
          toast.success('This connection was already created')
          setFormError('This connection already existed, and its secret was shown only once. Use Rotate secret to get a new one.')
        }
        setName('')
        await fetchAll()
      } else {
        setFormError(result.message)
        toast.error(result.message)
      }
    } catch (err) {
      logger.error('[AgencyErpPage] create failed:', err)
      const message = toUserFacingErrorMessage(err, 'Failed to create the connection')
      setFormError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const handleConfirm = async (c: ConnectionRow, action: Action) => {
    const intent = `${action}:${c.id}`
    setBusy(intent)
    setRowMessage(null)
    try {
      if (action === 'rotate') {
        const result = await agencyErpApi.rotateSecret(c.id, c.version)
        if (result.ok) {
          setReveal({ heading: 'Secret rotated', connectionName: c.name, secret: result.secret })
          toast.success('Secret rotated')
        } else {
          setRowMessage({ id: c.id, text: result.message })
          toast.error(result.message)
        }
      } else {
        const to: ConnectionStatus = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'revoked'
        const result = await agencyErpApi.setStatus(c.id, to, c.version)
        if (result.ok) toast.success(action === 'revoke' ? 'Connection revoked' : action === 'pause' ? 'Connection paused' : 'Connection resumed')
        else {
          setRowMessage({ id: c.id, text: result.message })
          toast.error(result.message)
        }
      }
      setPending(null)
      await fetchAll()
    } catch (err) {
      logger.error('[AgencyErpPage] action failed:', action, err)
      const message = toUserFacingErrorMessage(err, action === 'rotate' ? 'Failed to rotate the secret' : 'Failed to change the connection')
      setRowMessage({ id: c.id, text: message })
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const toggleEvents = (id: string) => {
    if (eventsFor === id) {
      setEventsFor(null)
      return
    }
    setEventsFor(id)
    setEvents([])
    setOpenProblems(new Set())
    fetchEvents(id)
  }

  const toggleProblems = (id: string) =>
    setOpenProblems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleCopy = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret)
      toast.success('Secret copied')
    } catch {
      // Deliberately not logging the error object: keep the secret out of every log path.
      toast.error('Could not copy. Select the secret and copy it by hand.')
    }
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="erp-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading ERP connections…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="erp-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to ERP connections</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for dispatcher access.</p>
        </div>
      </div>
    )
  }

  const revealOpen = reveal !== null

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">ERP connections</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Let a client&apos;s ERP system send orders straight into TruckOpti with a connection id and a secret.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              fetchAll()
            }}
            className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
          >
            Retry
          </button>
        </div>
      )}

      {reveal && (
        <div
          ref={revealRef}
          tabIndex={-1}
          role="alertdialog"
          aria-labelledby="erp-reveal-title"
          aria-describedby="erp-reveal-warning"
          data-testid="erp-secret-panel"
          className={`space-y-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 ${FOCUS_RING}`}
        >
          <h2 id="erp-reveal-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
            <KeyRound size={18} aria-hidden="true" />
            {reveal.heading}: {reveal.connectionName}
          </h2>
          <p id="erp-reveal-warning" className="text-sm font-semibold text-amber-900">
            Copy this secret now. It will not be shown again, and nobody can look it up later. If you lose it, rotate the secret to get a new one.
          </p>
          <pre
            data-testid="erp-secret-value"
            className="whitespace-pre-wrap break-all rounded-lg border border-amber-300 bg-white p-3 text-sm text-slate-900"
          >
            {reveal.secret}
          </pre>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => handleCopy(reveal.secret)}
              className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white ${FOCUS_RING}`}
            >
              <Copy size={16} aria-hidden="true" /> Copy secret
            </button>
            <button
              type="button"
              onClick={dismissReveal}
              className={`min-h-[44px] rounded-xl border border-slate-400 bg-white px-4 text-sm font-semibold text-slate-900 ${FOCUS_RING}`}
            >
              I have saved it, dismiss
            </button>
          </div>
        </div>
      )}

      <section aria-labelledby="erp-create" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="erp-create">
        <h2 id="erp-create" className="text-base font-bold text-slate-900">New connection</h2>
        {activeAgreements.length === 0 ? (
          <p data-testid="erp-no-agreements" className="text-sm text-slate-700">
            There is no active client agreement yet. Add a client agreement first, then connect its ERP system.
          </p>
        ) : (
          <form onSubmit={handleCreate} noValidate className="grid gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="erp-agreement" className="block text-sm font-medium text-slate-900">Client agreement</label>
              <select
                id="erp-agreement"
                value={agreementId}
                onChange={(e) => setAgreementId(e.target.value)}
                className={`mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-2 text-sm text-slate-900 ${FOCUS_RING}`}
              >
                <option value="">Choose a client…</option>
                {activeAgreements.map((a) => (
                  <option key={a.id} value={a.id}>{a.client_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="erp-name" className="block text-sm font-medium text-slate-900">Connection name</label>
              <input
                id="erp-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME}
                autoComplete="off"
                placeholder="For example: Tally order feed"
                className={`mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 ${FOCUS_RING}`}
              />
            </div>
            <div>
              <label htmlFor="erp-kind" className="block text-sm font-medium text-slate-900">Type</label>
              <select
                id="erp-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ConnectionKind)}
                className={`mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-2 text-sm text-slate-900 ${FOCUS_RING}`}
              >
                <option value="webhook">Webhook</option>
                <option value="csv_drop">CSV drop</option>
              </select>
            </div>
            {formError && (
              <p role="alert" className="md:col-span-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>
            )}
            {revealOpen && (
              <p className="md:col-span-3 text-sm text-amber-900">Dismiss the secret above before creating another connection.</p>
            )}
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={busy !== null || revealOpen}
                className={`flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`}
              >
                <Plug size={16} aria-hidden="true" />
                {busy === 'create' ? 'Creating…' : 'Create connection'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="erp-list" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="erp-list">
        <h2 id="erp-list" className="text-base font-bold text-slate-900">Connections</h2>
        {connections.length === 0 ? (
          <p data-testid="erp-empty" className="text-sm text-slate-700">No ERP connection has been created yet.</p>
        ) : (
          <ul className="space-y-3">
            {connections.map((c) => {
              const last = lastEvent.get(c.id)
              const isPending = pending?.id === c.id ? pending.action : null
              const revoked = c.status === 'revoked'
              const clientName = agreementById.get(c.agreement_id)?.client_name ?? 'Unknown client'
              return (
                <li key={c.id} data-testid={`erp-connection-${c.id}`} className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 break-words">{c.name}</p>
                      <p className="text-xs text-slate-600 break-words">
                        {clientName} · {KIND_LABELS[c.kind] ?? c.kind}
                      </p>
                    </div>
                    <Chip tone={STATUS_STYLE[c.status].tone} label={STATUS_STYLE[c.status].label} />
                  </div>

                  <dl className="grid gap-1 text-sm text-slate-800 sm:grid-cols-2">
                    <div>
                      <dt className="inline text-slate-600">Connection id: </dt>
                      <dd className="inline break-all font-mono text-xs">{c.id}</dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-600">Secret ends in: </dt>
                      <dd className="inline font-mono">…{c.secret_hint}</dd>
                    </div>
                    <div className="sm:col-span-2" data-testid={`erp-last-${c.id}`}>
                      <dt className="inline text-slate-600">Last event: </dt>
                      <dd className="inline">
                        {last ? (
                          <>
                            {formatWhen(last.received_at)} · {OUTCOME_STYLE[last.outcome]?.label ?? last.outcome}
                          </>
                        ) : (
                          'No events yet'
                        )}
                      </dd>
                    </div>
                  </dl>

                  {!revoked && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="group" aria-label={`Actions for ${c.name}`}>
                      {c.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => setPending({ id: c.id, action: 'pause' })}
                          disabled={busy !== null}
                          aria-label={`Pause ${c.name}`}
                          className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
                        >
                          <PauseCircle size={16} aria-hidden="true" /> Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPending({ id: c.id, action: 'resume' })}
                          disabled={busy !== null}
                          aria-label={`Resume ${c.name}`}
                          className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
                        >
                          <PlayCircle size={16} aria-hidden="true" /> Resume
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPending({ id: c.id, action: 'rotate' })}
                        disabled={busy !== null || revealOpen}
                        aria-label={`Rotate secret for ${c.name}`}
                        className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        <KeyRound size={16} aria-hidden="true" /> Rotate secret
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending({ id: c.id, action: 'revoke' })}
                        disabled={busy !== null}
                        aria-label={`Revoke ${c.name}`}
                        className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-800 disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        <ShieldOff size={16} aria-hidden="true" /> Revoke
                      </button>
                    </div>
                  )}
                  {revoked && <p className="text-sm text-slate-700">This connection was revoked. It cannot be changed or resumed.</p>}

                  {isPending && (
                    <div
                      role="group"
                      aria-label={`Confirm ${ACTION_COPY[isPending].button} for ${c.name}`}
                      data-testid={`erp-confirm-${c.id}`}
                      className={`space-y-2 rounded-xl border p-3 ${isPending === 'revoke' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <p className="text-sm text-slate-900">{ACTION_COPY[isPending].warning}</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleConfirm(c, isPending)}
                          disabled={busy !== null}
                          className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 ${isPending === 'revoke' ? 'bg-red-700' : 'bg-indigo-600'} ${FOCUS_RING}`}
                        >
                          {busy === `${isPending}:${c.id}` ? ACTION_COPY[isPending].busy : ACTION_COPY[isPending].confirm}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPending(null)}
                          disabled={busy !== null}
                          className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {rowMessage?.id === c.id && (
                    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{rowMessage.text}</p>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleEvents(c.id)}
                    aria-expanded={eventsFor === c.id}
                    aria-label={`${eventsFor === c.id ? 'Hide' : 'Show'} events for ${c.name}`}
                    className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                  >
                    {eventsFor === c.id ? 'Hide events' : 'Show events'}
                  </button>

                  {eventsFor === c.id && (
                    <div data-testid={`erp-events-${c.id}`} className="rounded-xl border border-slate-200 p-3">
                      {eventsError && (
                        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800">
                          <span>{eventsError}</span>
                          <button type="button" onClick={() => fetchEvents(c.id)} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>
                            Retry
                          </button>
                        </div>
                      )}
                      {eventsLoading ? (
                        <div role="status" aria-busy="true" className="py-2 text-center">
                          <RefreshCw className="mx-auto animate-spin text-indigo-600" size={20} aria-hidden="true" />
                          <span className="sr-only">Loading events…</span>
                        </div>
                      ) : events.length === 0 && !eventsError ? (
                        <p className="text-sm text-slate-700">No events yet. Events appear here when the ERP system sends orders.</p>
                      ) : events.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <caption className="sr-only">Events for {c.name}</caption>
                            <thead>
                              <tr className="border-b border-slate-200 text-xs text-slate-600">
                                <th scope="col" className="py-2 pr-3 font-semibold">Received</th>
                                <th scope="col" className="py-2 pr-3 font-semibold">External event id</th>
                                <th scope="col" className="py-2 pr-3 font-semibold">Outcome</th>
                                <th scope="col" className="py-2 font-semibold">Problems</th>
                              </tr>
                            </thead>
                            <tbody>
                              {events.map((ev) => {
                                const hasProblems = ev.problems !== null && ev.problems !== undefined
                                const open = openProblems.has(ev.id)
                                return (
                                  <tr key={ev.id} data-testid={`erp-event-${ev.id}`} className="border-b border-slate-100 align-top">
                                    <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(ev.received_at)}</td>
                                    <td className="py-2 pr-3 break-all font-mono text-xs">{ev.external_event_id}</td>
                                    <td className="py-2 pr-3">
                                      <Chip tone={OUTCOME_STYLE[ev.outcome]?.tone ?? OUTCOME_STYLE.duplicate.tone} label={OUTCOME_STYLE[ev.outcome]?.label ?? ev.outcome} />
                                    </td>
                                    <td className="py-2">
                                      {hasProblems ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => toggleProblems(ev.id)}
                                            aria-expanded={open}
                                            aria-label={`${open ? 'Hide' : 'Show'} problems for event ${ev.external_event_id}`}
                                            className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-800 ${FOCUS_RING}`}
                                          >
                                            {open ? 'Hide problems' : 'Show problems'}
                                          </button>
                                          {open && (
                                            <pre className="mt-2 max-w-xs whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900 sm:max-w-md">
                                              {formatProblems(ev.problems)}
                                            </pre>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-slate-600">None</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="erp-how" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" data-testid="erp-how">
        <h2 id="erp-how" className="text-base font-bold text-slate-900">How to connect</h2>
        <p className="text-sm text-slate-800">
          Your ERP system sends each batch of orders as a POST request with a JSON body to this address, where SUPABASE_URL is your
          TruckOpti project address provided by your account manager:
        </p>
        <pre data-testid="erp-endpoint" className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`POST SUPABASE_URL/functions/v1/erp-ingest
Content-Type: application/json
Authorization: Bearer <your-secret>

{
  "connection_id": "<connection id>",
  "external_event_id": "batch-2026-11-17-001",
  "lines": [ { "client_order_ref": "PO-1001", "line_no": 1, "sku": "SKU-1" } ]
}`}</pre>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
          <li>Send the connection id (shown on the connection above) and the secret you saved when you created or rotated it. Prefer the Authorization header (or an x-truckopti-secret header) for the secret over the request body, so it is not recorded by proxies.</li>
          <li>Send an external event id that is unique for each batch. Sending the same batch again with the same event id is safe: it is recorded as a duplicate and no orders are created twice.</li>
          <li>Send the order lines in the request. A batch is accepted whole or rejected whole; the problems for a rejected batch appear in the events table.</li>
          <li>
            Answers: 200 with {'{"ok": true, "outcome": "accepted"}'} (or "duplicate") when the batch is stored. 200 with{' '}
            {'{"ok": false, "outcome": "rejected", "problems": [...]}'} when lines need fixing; nothing is stored, so fix the lines and resend with the same event id. 401 for a wrong connection id or secret, 403 when the connection is not active, 413 when the batch is too large.
          </li>
          <li>A paused or revoked connection is refused. A rotated secret replaces the old one immediately.</li>
        </ul>
        <p className="text-sm text-slate-700">Keep the secret private. It is shown only once and is not stored in a readable form.</p>
      </section>
    </div>
  )
}
