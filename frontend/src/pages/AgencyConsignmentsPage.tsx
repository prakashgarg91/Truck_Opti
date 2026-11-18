import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Copy, FilePlus2, QrCode, RefreshCw, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyConsignmentsApi,
  type ConsignmentEventRow,
  type ConsignmentRow,
  type OrderRow,
} from '../services/agencyConsignmentsApi'
import { subscriptionInfoFromError } from '../lib/subscriptionGuard'
import type { SubscriptionErrorInfo } from '../lib/billingState'
import { SubscriptionLimitPrompt, useBillingGate } from '../components/billing/BillingGate'
import { buildQrPayload, nextProofState, type ProofEvent, type ProofState } from '../lib/grLr'

// TO-146 Consignments (GR/LR). Create a GR for a draft or planned order, then
// record pickup, transit, delivery, receipt or a dispute in order. The database
// owns numbering, the transition rules and the version check; the buttons here
// are only the next legal events from nextProofState. The QR token is fetched on
// demand through the qr command (dispatcher or owner only) and shown as a text
// payload; no QR image library is used yet.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const STATUS_STYLE: Record<ProofState, { label: string; tone: string }> = {
  created: { label: 'GR created', tone: 'bg-slate-100 text-slate-800 border-slate-300' },
  picked_up: { label: 'Picked up', tone: 'bg-sky-50 text-sky-900 border-sky-200' },
  in_transit: { label: 'In transit', tone: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  delivered: { label: 'Delivered', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  receipt_confirmed: { label: 'Receipt confirmed', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  disputed: { label: 'Disputed', tone: 'bg-red-50 text-red-800 border-red-300' },
}

const EVENT_ORDER: ProofEvent[] = ['pickup_scanned', 'transit_started', 'delivery_scanned', 'receipt_signed', 'dispute_raised']

const EVENT_LABELS: Record<ProofEvent, string> = {
  pickup_scanned: 'Mark picked up',
  transit_started: 'Start transit',
  delivery_scanned: 'Mark delivered',
  receipt_signed: 'Confirm receipt',
  dispute_raised: 'Raise dispute',
}

const EVENT_HISTORY_LABELS: Record<string, string> = {
  created: 'GR created',
  pickup_scanned: 'Picked up',
  transit_started: 'Transit started',
  delivery_scanned: 'Delivered',
  receipt_signed: 'Receipt confirmed',
  dispute_raised: 'Dispute raised',
}

function nextEvents(status: ProofState): ProofEvent[] {
  return EVENT_ORDER.filter((e) => nextProofState(status, e).ok)
}

function StatusChip({ status }: { status: ProofState }) {
  const { label, tone } = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export default function AgencyConsignmentsPage() {
  useEffect(() => {
    document.title = 'Consignments - TruckOpti'
  }, [])

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [consignments, setConsignments] = useState<ConsignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const gate = useBillingGate()
  const [limitInfo, setLimitInfo] = useState<SubscriptionErrorInfo | null>(null)

  // One idempotency key per intent (create for an order, one event at one
  // version). A failed request is retried with the same key; a completed one
  // (success or typed refusal) starts a new intent next time.
  const keys = useRef<Map<string, string>>(new Map())
  const keyFor = (intent: string) => {
    let key = keys.current.get(intent)
    if (!key) {
      key = crypto.randomUUID()
      keys.current.set(intent, key)
    }
    return key
  }

  const [busy, setBusy] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<{ id: string; text: string } | null>(null)

  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [events, setEvents] = useState<ConsignmentEventRow[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const [disputeFor, setDisputeFor] = useState<string | null>(null)
  const [disputeNote, setDisputeNote] = useState('')

  const [qr, setQr] = useState<{ id: string; payload: string } | null>(null)
  const [qrBusy, setQrBusy] = useState<string | null>(null)
  const [qrMessage, setQrMessage] = useState<{ id: string; text: string } | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [o, c] = await Promise.all([agencyConsignmentsApi.listOrders(), agencyConsignmentsApi.listConsignments()])
      setOrders(o)
      setConsignments(c)
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyConsignmentsPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load consignments')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEvents = useCallback(async (consignmentId: string) => {
    setEventsLoading(true)
    setEventsError(null)
    try {
      setEvents(await agencyConsignmentsApi.listEvents(consignmentId))
    } catch (e) {
      logger.error('[AgencyConsignmentsPage] history load failed:', e)
      setEventsError(toUserFacingErrorMessage(e, 'Failed to load delivery history'))
    } finally {
      setEventsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const orderless = useMemo(() => {
    const withGr = new Set(consignments.map((c) => c.order_id))
    return orders.filter((o) => (o.status === 'draft' || o.status === 'planned') && !withGr.has(o.id))
  }, [orders, consignments])

  const handleCreate = async (order: OrderRow) => {
    const intent = `create:${order.id}`
    setBusy(intent)
    setFormMessage(null)
    setLimitInfo(null)
    try {
      const result = await agencyConsignmentsApi.createConsignment(order.id, keyFor(intent))
      keys.current.delete(intent)
      if (result.ok) toast.success(result.replay ? `GR ${result.grNumber} was already created` : `GR ${result.grNumber} created`)
      else {
        setFormMessage({ id: order.id, text: result.message })
        toast.error(result.message)
      }
      await fetchAll()
    } catch (e) {
      logger.error('[AgencyConsignmentsPage] create failed:', e)
      const limit = subscriptionInfoFromError(e)
      if (limit) {
        setLimitInfo(limit)
        return
      }
      const message = toUserFacingErrorMessage(e, 'Failed to create GR')
      setFormMessage({ id: order.id, text: message })
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const handleEvent = async (c: ConsignmentRow, event: ProofEvent, note?: string) => {
    const intent = `event:${c.id}:${event}:${c.version}`
    setBusy(intent)
    setFormMessage(null)
    try {
      const result = await agencyConsignmentsApi.recordEvent({
        consignmentId: c.id,
        event,
        expectedVersion: c.version,
        idempotencyKey: keyFor(intent),
        note: note && note.trim() ? note.trim() : null,
      })
      keys.current.delete(intent)
      if (result.ok) {
        toast.success('Delivery updated')
        setDisputeFor(null)
        setDisputeNote('')
      } else {
        setFormMessage({ id: c.id, text: result.message })
        toast.error(result.message)
      }
      await fetchAll()
      if (openHistory === c.id) await fetchEvents(c.id)
    } catch (e) {
      logger.error('[AgencyConsignmentsPage] event failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to update the delivery')
      setFormMessage({ id: c.id, text: message })
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const toggleHistory = (id: string) => {
    if (openHistory === id) {
      setOpenHistory(null)
      return
    }
    setOpenHistory(id)
    setEvents([])
    fetchEvents(id)
  }

  const handleQr = async (c: ConsignmentRow) => {
    setQrBusy(c.id)
    setQrMessage(null)
    try {
      const result = await agencyConsignmentsApi.getQrToken(c.id)
      if (result.ok) setQr({ id: c.id, payload: buildQrPayload({ grNumber: c.gr_number, consignmentId: c.id, token: result.token }) })
      else setQrMessage({ id: c.id, text: result.message })
    } catch (e) {
      logger.error('[AgencyConsignmentsPage] qr failed:', e)
      setQrMessage({ id: c.id, text: toUserFacingErrorMessage(e, 'Failed to load the QR code') })
    } finally {
      setQrBusy(null)
    }
  }

  const handleCopy = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload)
      toast.success('QR payload copied')
    } catch (e) {
      logger.error('[AgencyConsignmentsPage] copy failed:', e)
      toast.error('Could not copy. Select the text and copy it by hand.')
    }
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="consignments-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading consignments…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="consignments-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to consignments</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for dispatcher access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Consignments (GR/LR)</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Create a GR for an order, then record each step of the delivery until the receipt is confirmed.
        </p>
      </div>

      {limitInfo && <SubscriptionLimitPrompt info={limitInfo} onDismiss={() => setLimitInfo(null)} />}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
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

      <section aria-labelledby="gr-orders" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="consignments-orders">
        <h2 id="gr-orders" className="text-base font-bold text-slate-900">Orders waiting for a GR</h2>
        {orderless.length === 0 ? (
          <p data-testid="consignments-no-orders" className="text-sm text-slate-700">
            No draft or planned orders are waiting. Import orders first, or all of them already have a GR.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orderless.map((o) => {
              const intent = `create:${o.id}`
              return (
                <li key={o.id} data-testid={`consignments-order-${o.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 break-words">{o.client_order_ref}</p>
                    <p className="text-xs text-slate-600">
                      {o.status === 'draft' ? 'Draft' : 'Planned'} · {new Date(o.created_at).toLocaleDateString()}
                    </p>
                    {formMessage?.id === o.id && (
                      <p role="alert" className="mt-1 text-sm text-red-800">{formMessage.text}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCreate(o)}
                    disabled={busy !== null || !gate.canWrite}
                    title={gate.writeTitle}
                    aria-label={`Create GR for ${o.client_order_ref}`}
                    className={`flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`}
                  >
                    <FilePlus2 size={16} aria-hidden="true" />
                    {busy === intent ? 'Creating…' : 'Create GR'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="gr-list" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="consignments-list">
        <h2 id="gr-list" className="text-base font-bold text-slate-900">Consignments</h2>
        {consignments.length === 0 ? (
          <p data-testid="consignments-empty" className="text-sm text-slate-700">No GR has been created yet.</p>
        ) : (
          <ul className="space-y-3">
            {consignments.map((c) => {
              const order = orderById.get(c.order_id)
              const available = nextEvents(c.status)
              const showQr = qr?.id === c.id
              return (
                <li key={c.id} data-testid={`consignment-${c.id}`} className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 break-all">{c.gr_number}</p>
                      <p className="text-xs text-slate-600 break-words">
                        Order {order?.client_order_ref ?? 'unknown'} · updated {formatWhen(c.updated_at)}
                      </p>
                    </div>
                    <StatusChip status={c.status} />
                  </div>

                  {available.length > 0 ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="group" aria-label={`Next steps for ${c.gr_number}`}>
                      {available.map((event) =>
                        event === 'dispute_raised' ? (
                          <button
                            key={event}
                            type="button"
                            onClick={() => setDisputeFor(disputeFor === c.id ? null : c.id)}
                            disabled={busy !== null}
                            aria-expanded={disputeFor === c.id}
                            className={`min-h-[44px] rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-800 disabled:opacity-60 ${FOCUS_RING}`}
                          >
                            {EVENT_LABELS[event]}
                          </button>
                        ) : (
                          <button
                            key={event}
                            type="button"
                            onClick={() => handleEvent(c, event)}
                            disabled={busy !== null}
                            className={`min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                          >
                            {busy === `event:${c.id}:${event}:${c.version}` ? 'Saving…' : EVENT_LABELS[event]}
                          </button>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="flex items-center gap-1 text-sm text-slate-700">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      {c.status === 'disputed' ? 'This delivery is disputed. No further steps are available here.' : 'Delivery complete. No further steps.'}
                    </p>
                  )}

                  {disputeFor === c.id && available.includes('dispute_raised') && (
                    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                      <label htmlFor={`dispute-note-${c.id}`} className="block text-sm font-medium text-slate-900">
                        What is wrong? <span className="font-normal text-slate-700">(optional, up to 500 characters)</span>
                      </label>
                      <textarea
                        id={`dispute-note-${c.id}`}
                        value={disputeNote}
                        onChange={(e) => setDisputeNote(e.target.value)}
                        maxLength={500}
                        rows={3}
                        className={`w-full rounded-xl border border-slate-300 p-2 text-sm ${FOCUS_RING}`}
                      />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleEvent(c, 'dispute_raised', disputeNote)}
                          disabled={busy !== null}
                          className={`min-h-[44px] rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                        >
                          {busy === `event:${c.id}:dispute_raised:${c.version}` ? 'Saving…' : 'Confirm dispute'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDisputeFor(null)}
                          disabled={busy !== null}
                          className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                        >
                          Keep as is
                        </button>
                      </div>
                    </div>
                  )}

                  {formMessage?.id === c.id && (
                    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formMessage.text}</p>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => toggleHistory(c.id)}
                      aria-expanded={openHistory === c.id}
                      className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                    >
                      {openHistory === c.id ? 'Hide history' : 'Show history'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQr(c)}
                      disabled={qrBusy !== null}
                      aria-label={`Show QR for ${c.gr_number}`}
                      className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
                    >
                      <QrCode size={16} aria-hidden="true" />
                      {qrBusy === c.id ? 'Loading…' : 'Show QR'}
                    </button>
                  </div>

                  {qrMessage?.id === c.id && (
                    <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{qrMessage.text}</p>
                  )}

                  {showQr && qr && (
                    <div data-testid={`consignment-qr-${c.id}`} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-medium text-slate-900">QR payload</p>
                      <pre className="whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900">{qr.payload}</pre>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => handleCopy(qr.payload)}
                          className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                        >
                          <Copy size={16} aria-hidden="true" /> Copy payload
                        </button>
                        <button
                          type="button"
                          onClick={() => setQr(null)}
                          className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                        >
                          Hide QR
                        </button>
                      </div>
                      <p className="text-xs text-slate-600">QR image: later</p>
                    </div>
                  )}

                  {openHistory === c.id && (
                    <div data-testid={`consignment-history-${c.id}`} className="rounded-xl border border-slate-200 p-3">
                      {eventsError && (
                        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800">
                          <span>{eventsError}</span>
                          <button onClick={() => fetchEvents(c.id)} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>
                            Retry
                          </button>
                        </div>
                      )}
                      {eventsLoading ? (
                        <div role="status" aria-busy="true" className="py-2 text-center">
                          <RefreshCw className="mx-auto animate-spin text-indigo-600" size={20} aria-hidden="true" />
                          <span className="sr-only">Loading history…</span>
                        </div>
                      ) : events.length === 0 && !eventsError ? (
                        <p className="text-sm text-slate-700">No history yet.</p>
                      ) : (
                        <ol className="space-y-2">
                          {events.map((ev) => (
                            <li key={ev.id} className="text-sm">
                              <span className="font-medium text-slate-900">{EVENT_HISTORY_LABELS[ev.event] ?? ev.event}</span>
                              <span className="text-slate-600"> · {formatWhen(ev.created_at)}</span>
                              {ev.note && <p className="text-xs text-slate-700 break-words">Note: {ev.note}</p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
