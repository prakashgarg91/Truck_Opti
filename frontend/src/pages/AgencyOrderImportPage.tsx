import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AlertTriangle, Check, CheckCircle2, Download, FileUp, RefreshCw, ShieldAlert, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import { subscriptionInfoFromError } from '../lib/subscriptionGuard'
import type { SubscriptionErrorInfo } from '../lib/billingState'
import { SubscriptionLimitPrompt, useBillingGate } from '../components/billing/BillingGate'
import {
  agencyOrdersApi,
  type ClientAgreementWithSites,
  type ImportResult,
  type OrderBatchRow,
  type OrderRow,
} from '../services/agencyOrdersApi'
import { ORDER_CSV_TEMPLATE, hashOrderFile, orderRowsToCsv, parseOrderCsv, type ParseResult, type RowStatus } from '../lib/orderImport'
import {
  BLOCKER_MESSAGES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_LINES,
  buildImportLines,
  buildKnownSites,
  importBlocker,
} from '../lib/orderImportPayload'

// TO-145 Order Import (Stitch screen f17f9e26). Pick a client agreement,
// download the template, upload a CSV, review every row, then import the
// ready rows as draft orders. The browser parser is a convenience; the
// agency_order_import command re-validates everything and is atomic, so one
// refused line imports nothing. Stitch shell extras (quick quote, settings,
// support) are intentionally not built.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const STATUS_STYLE: Record<RowStatus, { label: string; tone: string }> = {
  ready: { label: 'Ready', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  warning: { label: 'Warning', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  error: { label: 'Error', tone: 'bg-red-50 text-red-800 border-red-300' },
}

function RowBadge({ status }: { status: RowStatus }) {
  const Icon = status === 'ready' ? Check : status === 'warning' ? AlertTriangle : X
  const { label, tone } = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  )
}

function downloadTextFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsText(file)
  })
}

type FileState = { name: string; text: string; hash: string }

/** Client-side filter for the order history: case-insensitive match on the client's order reference. */
function matchesOrderRef(order: { client_order_ref: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q === '' || order.client_order_ref.toLowerCase().includes(q)
}

export default function AgencyOrderImportPage() {
  useEffect(() => {
    document.title = 'Order import - TruckOpti'
  }, [])

  const [agreements, setAgreements] = useState<ClientAgreementWithSites[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const [agreementId, setAgreementId] = useState('')

  const [file, setFile] = useState<FileState | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const gate = useBillingGate()
  const [limitInfo, setLimitInfo] = useState<SubscriptionErrorInfo | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<ImportResult | null>(null)
  // One idempotency key per import intent (agreement + file); a failed submit
  // can be retried safely, a changed file or agreement starts a new intent.
  const importKey = useRef<string | null>(null)

  const [batches, setBatches] = useState<OrderBatchRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [orderSearch, setOrderSearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  const fetchAgreements = useCallback(async () => {
    try {
      setError(null)
      setAgreements(await agencyOrdersApi.listAgreementsWithSites())
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyOrderImportPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load client agreements')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async (id: string) => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const [b, o] = await Promise.all([agencyOrdersApi.listBatches(id), agencyOrdersApi.listOrders(id)])
      setBatches(b)
      setOrders(o)
    } catch (e) {
      logger.error('[AgencyOrderImportPage] history load failed:', e)
      setHistoryError(toUserFacingErrorMessage(e, 'Failed to load recent imports'))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgreements()
  }, [fetchAgreements])

  useEffect(() => {
    if (agreementId) fetchHistory(agreementId)
  }, [agreementId, fetchHistory])

  const agreement = useMemo(() => agreements.find((a) => a.id === agreementId) ?? null, [agreements, agreementId])
  const agreementSites = useMemo(() => agreement?.sites ?? [], [agreement])

  const parsed: ParseResult | null = useMemo(
    () => (file && agreement ? parseOrderCsv(file.text, buildKnownSites(agreementSites)) : null),
    [file, agreement, agreementSites]
  )
  const lines = useMemo(() => (parsed ? buildImportLines(parsed.rows, agreementSites) : []), [parsed, agreementSites])

  const blocker = importBlocker({
    agreementActive: agreement ? agreement.status === 'active' : null,
    hasFile: file !== null,
    headerErrorCount: parsed?.headerErrors.length ?? 0,
    rowCount: parsed?.summary.rows ?? 0,
    errorCount: parsed?.summary.errors ?? 0,
    lineCount: lines.length,
    submitting,
  })

  const resetImport = () => {
    setFile(null)
    setFileError(null)
    setOutcome(null)
    importKey.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAgreementChange = (event: ChangeEvent<HTMLSelectElement>) => {
    resetImport()
    setConfirmCancel(null)
    setBatches([])
    setOrders([])
    setAgreementId(event.target.value)
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    setOutcome(null)
    importKey.current = null
    setFile(null)
    setFileError(null)
    if (!picked) return
    if (picked.size > MAX_IMPORT_FILE_BYTES) {
      setFileError('This file is larger than 5 MB. Split it into smaller files and upload them one at a time.')
      return
    }
    setReading(true)
    try {
      const text = await readFileText(picked)
      const hash = await hashOrderFile(text)
      setFile({ name: picked.name, text, hash })
    } catch (e) {
      logger.error('[AgencyOrderImportPage] file read failed:', e)
      setFileError('This file could not be read. Check that it is a CSV file and try again.')
    } finally {
      setReading(false)
    }
  }

  const handleImport = async () => {
    if (blocker !== null || !file || !agreement) return
    if (!importKey.current) importKey.current = crypto.randomUUID()
    setSubmitting(true)
    setOutcome(null)
    setLimitInfo(null)
    try {
      const result = await agencyOrdersApi.importOrders({
        agreementId: agreement.id,
        fileHash: file.hash,
        idempotencyKey: importKey.current,
        lines,
      })
      setOutcome(result)
      if (!result.ok) {
        if (result.error === 'idempotency_key_reused') importKey.current = null
        toast.error(result.message)
      } else if (result.state === 'created') {
        toast.success('Orders imported')
        importKey.current = null
      }
      // Single refetch in every completed outcome; never an automatic retry.
      await fetchHistory(agreement.id)
    } catch (e) {
      logger.error('[AgencyOrderImportPage] import failed:', e)
      const limit = subscriptionInfoFromError(e)
      if (limit) setLimitInfo(limit)
      else toast.error(toUserFacingErrorMessage(e, 'Failed to import orders'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelOrder = async (order: OrderRow) => {
    setCancelling(order.id)
    try {
      const result = await agencyOrdersApi.cancelOrder(order.id, order.version)
      if (result.ok) toast.success('Order cancelled')
      else toast.error(result.message)
      setConfirmCancel(null)
      if (agreement) await fetchHistory(agreement.id)
    } catch (e) {
      logger.error('[AgencyOrderImportPage] cancel failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to cancel order'))
      setConfirmCancel(null)
    } finally {
      setCancelling(null)
    }
  }

  const imported = outcome?.ok === true ? outcome : null
  const refused = outcome && !outcome.ok ? outcome : null
  const visibleRows = parsed?.rows ?? []
  const problemRows = visibleRows.filter((r) => r.status !== 'ready')

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="order-import-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading client agreements…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="order-import-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to order import</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for dispatcher access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Order import</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Upload a client sales-order CSV, review every row, then save the orders as drafts.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
            onClick={() => {
              setLoading(true)
              fetchAgreements()
            }}
            className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
          >
            Retry
          </button>
        </div>
      )}

      <section aria-labelledby="import-step-client" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 id="import-step-client" className="text-base font-bold text-slate-900">1. Client agreement</h2>
        {agreements.length === 0 && !error ? (
          <p data-testid="order-import-no-clients" className="text-sm text-slate-700">
            No client agreements yet. Add a client with its ship-to sites on the Clients page before importing orders.
          </p>
        ) : (
          <div>
            <label htmlFor="import-agreement" className="block text-sm font-medium text-slate-800">Client</label>
            <select
              id="import-agreement"
              name="import-agreement"
              value={agreementId}
              onChange={handleAgreementChange}
              disabled={submitting}
              className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
            >
              <option value="">Choose a client</option>
              {agreements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.client_name}
                  {a.status === 'active' ? '' : ` (${a.status})`}
                </option>
              ))}
            </select>
            {agreement && agreement.status !== 'active' && (
              <p role="note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {BLOCKER_MESSAGES.agreement_not_active}
              </p>
            )}
            {agreement && agreementSites.filter((s) => s.status === 'active' && s.site_kind === 'ship_to').length === 0 && (
              <p role="note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This client has no active ship-to site, so every drop site will be reported as not found. Add one on the Clients page first.
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="import-step-file" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 id="import-step-file" className="text-base font-bold text-slate-900">2. CSV file</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadTextFile('order-import-template.csv', `${ORDER_CSV_TEMPLATE}\n`)}
            className={`flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
          >
            <Download size={16} aria-hidden="true" /> Download template
          </button>
        </div>
        <div>
          <label htmlFor="import-file" className="block text-sm font-medium text-slate-800">
            Order file <span className="font-normal text-slate-600">(CSV, up to 5 MB and {MAX_IMPORT_LINES} lines)</span>
          </label>
          <input
            id="import-file"
            name="import-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={!agreement || submitting || reading}
            onChange={handleFile}
            aria-describedby="import-file-hint"
            className={`mt-1 block w-full min-h-[44px] rounded-xl border border-slate-300 p-2 text-sm text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
          />
          <p id="import-file-hint" className="mt-1 text-xs text-slate-600">
            {agreement ? 'Dates look like 2026-11-12. Site names must match the client sites exactly.' : 'Choose a client first.'}
          </p>
          {reading && (
            <p role="status" className="mt-2 text-sm text-slate-700">Reading file…</p>
          )}
          {fileError && (
            <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{fileError}</p>
          )}
        </div>
      </section>

      {file && parsed && (
        <section aria-labelledby="import-step-review" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4" data-testid="order-import-preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="import-step-review" className="text-base font-bold text-slate-900 break-all">3. Review {file.name}</h2>
            <button
              type="button"
              onClick={resetImport}
              disabled={submitting}
              className={`flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
            >
              <FileUp size={16} aria-hidden="true" /> Choose another file
            </button>
          </div>

          {parsed.headerErrors.length > 0 ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">This file cannot be read as an order file.</p>
              <ul className="mt-1 list-disc pl-5">
                {parsed.headerErrors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="mt-1">Download the template and use its column names.</p>
            </div>
          ) : parsed.summary.rows === 0 ? (
            <p data-testid="order-import-empty-file" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {BLOCKER_MESSAGES.no_rows}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="order-import-summary">
                <div className="rounded-xl border border-slate-200 p-3">
                  <dt className="text-xs text-slate-600">Rows</dt>
                  <dd className="text-lg font-bold text-slate-900">{parsed.summary.rows}</dd>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <dt className="text-xs text-emerald-900">Ready</dt>
                  <dd className="text-lg font-bold text-emerald-900">{parsed.summary.ready}</dd>
                </div>
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <dt className="text-xs text-amber-900">Warnings</dt>
                  <dd className="text-lg font-bold text-amber-900">{parsed.summary.warnings}</dd>
                </div>
                <div className="rounded-xl border border-red-300 bg-red-50 p-3">
                  <dt className="text-xs text-red-800">Errors</dt>
                  <dd className="text-lg font-bold text-red-800">{parsed.summary.errors}</dd>
                </div>
              </dl>

              {problemRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadTextFile('order-import-errors.csv', orderRowsToCsv(parsed.rows))}
                  className={`flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                >
                  <Download size={16} aria-hidden="true" /> Download errors CSV
                </button>
              )}

              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Row review">
                {visibleRows.map((row) => (
                  <li key={row.rowNumber} data-testid={`order-import-row-${row.rowNumber}`} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex items-center gap-2 sm:w-40 sm:shrink-0">
                      <span className="text-xs font-semibold text-slate-700">Row {row.rowNumber}</span>
                      <RowBadge status={row.status} />
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      {row.line ? (
                        <p className="text-slate-900 break-words">
                          <span className="font-medium">{row.line.clientOrderRef}</span> line {row.line.lineNo} · {row.line.sku} · {row.line.quantity} {row.line.unit}
                          <span className="block text-xs text-slate-600">
                            {row.line.pickupSite} → {row.line.dropSite}
                          </span>
                        </p>
                      ) : null}
                      {row.messages.length > 0 && (
                        <ul className={`${row.status === 'error' ? 'text-red-800' : 'text-amber-900'} text-xs`}>
                          {row.messages.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {refused && (
            <div role="alert" data-testid="order-import-refused" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">{refused.message}</p>
              {refused.error === 'invalid_lines' && refused.problems.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {refused.problems.map((p, i) => (
                    <li key={`${p.index}-${i}`}>Line {p.index + 1} of the import: {p.message}</li>
                  ))}
                </ul>
              )}
              {refused.error === 'order_exists' && refused.refs.length > 0 && (
                <p className="mt-1 break-words">Already imported: {refused.refs.join(', ')}</p>
              )}
            </div>
          )}

          {imported && imported.state === 'created' && (
            <div role="status" data-testid="order-import-success" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <span>
                Imported {imported.ordersCreated ?? 'the'} draft order{imported.ordersCreated === 1 ? '' : 's'}
                {imported.linesCreated != null ? ` with ${imported.linesCreated} line${imported.linesCreated === 1 ? '' : 's'}` : ''}.
              </span>
            </div>
          )}
          {imported && imported.state === 'duplicate_batch' && (
            <div role="status" data-testid="order-import-duplicate" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              This exact file was already imported for this client. Nothing new was added.
            </div>
          )}
          {imported && imported.state === 'idempotent_replay' && (
            <div role="status" data-testid="order-import-replay" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              This import was already saved. Nothing new was added.
            </div>
          )}

          {limitInfo && <SubscriptionLimitPrompt info={limitInfo} onDismiss={() => setLimitInfo(null)} />}

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={blocker !== null || imported !== null || !gate.canWrite}
              title={gate.writeTitle}
              aria-describedby={blocker && blocker !== 'submitting' ? 'import-blocker' : undefined}
              className={`min-h-[44px] w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`}
            >
              {submitting ? 'Importing…' : `Import ${lines.length} line${lines.length === 1 ? '' : 's'}`}
            </button>
            {blocker && blocker !== 'submitting' && !imported && (
              <p id="import-blocker" className="text-xs text-slate-700">{BLOCKER_MESSAGES[blocker]}</p>
            )}
            {imported && (
              <button
                type="button"
                onClick={resetImport}
                className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 sm:ml-2 ${FOCUS_RING}`}
              >
                Import another file
              </button>
            )}
          </div>
        </section>
      )}

      {agreement && (
        <section aria-labelledby="import-history" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="order-import-history">
          <h2 id="import-history" className="text-base font-bold text-slate-900">Recent orders for {agreement.client_name}</h2>
          {historyError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <span>{historyError}</span>
              <button onClick={() => fetchHistory(agreement.id)} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>
                Retry
              </button>
            </div>
          )}
          {historyLoading ? (
            <div role="status" aria-busy="true" className="py-4 text-center">
              <RefreshCw className="mx-auto animate-spin text-indigo-600" size={20} aria-hidden="true" />
              <span className="sr-only">Loading recent orders…</span>
            </div>
          ) : orders.length === 0 && !historyError ? (
            <p className="text-sm text-slate-700">No orders imported for this client yet.</p>
          ) : (
            <>
              <p className="text-xs text-slate-600">{batches.length} import{batches.length === 1 ? '' : 's'} on record.</p>
              <div>
                <label htmlFor="order-history-search" className="block text-xs font-medium text-slate-700">Search by order reference</label>
                <input
                  id="order-history-search"
                  type="search"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Order reference"
                  className={`mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 sm:max-w-xs ${FOCUS_RING}`}
                />
              </div>
              {orderSearch.trim() !== '' && orders.filter((o) => matchesOrderRef(o, orderSearch)).length === 0 && (
                <p className="text-sm text-slate-700">No orders match that reference.</p>
              )}
              <ul className="divide-y divide-slate-100">
                {orders.filter((o) => matchesOrderRef(o, orderSearch)).map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 break-words">{o.client_order_ref}</p>
                      <p className="text-xs text-slate-600">
                        {o.status.charAt(0).toUpperCase() + o.status.slice(1)} · {new Date(o.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {o.status === 'draft' &&
                      (confirmCancel === o.id ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleCancelOrder(o)}
                            disabled={cancelling !== null}
                            className={`min-h-[44px] rounded-xl bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                          >
                            {cancelling === o.id ? 'Cancelling…' : `Confirm cancel ${o.client_order_ref}`}
                          </button>
                          <button
                            onClick={() => setConfirmCancel(null)}
                            disabled={cancelling !== null}
                            className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                          >
                            Keep order
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmCancel(o.id)}
                          aria-label={`Cancel order ${o.client_order_ref}`}
                          className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-red-800 ${FOCUS_RING}`}
                        >
                          Cancel order
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
