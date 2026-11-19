import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, ChevronLeft, RefreshCw, Search } from 'lucide-react'
import {
  adminBillingOpsApi,
  type AdminAgencyWithoutSubscription,
  type AdminCoupon,
  type AdminSweepFailure,
  type AdminSweepRun,
  type AdminWebhookAttempt,
  type AdminWebhookEvent,
} from '../services/adminSupabaseApi'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import AdminLoadError from './AdminLoadError'

// Read-only ops view. Every section loads on its own and has its own loading, error (with Retry), empty and
// success state: a failed read never looks like a healthy empty list.

const BUTTON =
  'inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl text-sm font-medium ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'
const INPUT =
  'w-full min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 ' +
  'text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
const H3 = 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'
const TH = 'py-2 pr-3 font-medium'
const TD = 'py-2 pr-3'
const TR = 'border-t border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-100'
const MONO = 'font-mono text-xs break-all'

const SWEEP_LIMIT = 20
const WEBHOOK_LIMIT = 100

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

// failed / failures come from subscription_sweep_runs; older or malformed rows must not crash the page.
function failedOf(run: AdminSweepRun | undefined): number {
  return run && typeof run.failed === 'number' && run.failed > 0 ? run.failed : 0
}

function failuresOf(run: AdminSweepRun): AdminSweepFailure[] {
  return Array.isArray(run.failures) ? run.failures.filter((f) => !!f && typeof f === 'object') : []
}

const TRANSITION_WORDS: Record<string, string> = {
  'trial>expired': 'trial to expired',
  'active>grace': 'active to grace',
  'grace>expired': 'grace to expired',
}

function describeFailure(failure: AdminSweepFailure): string {
  const id = failure.subscriptionId ? failure.subscriptionId.slice(0, 8) : 'unknown'
  const attempted = TRANSITION_WORDS[failure.transition] ?? (failure.transition || 'an unknown change')
  const message = failure.message || 'No message was recorded.'
  return `Subscription ${id}: attempted ${attempted}. ${message}`
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-testid={`ops-section-${id}`} className="bg-white dark:bg-slate-800 rounded-2xl p-4 md:p-6 shadow-sm space-y-3">
      <h2 id={id} className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
      {children}
    </section>
  )
}

interface Loaded<T> {
  loading: boolean
  error: string | null
  rows: T[]
  reload: () => void
}

function useLoaded<T>(label: string, fallback: string, fetcher: () => Promise<T[]>): Loaded<T> {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<T[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetcher())
    } catch (e) {
      logger.error(`[AdminBillingOps] ${label}:`, e)
      setRows([])
      setError(toUserFacingErrorMessage(e, fallback))
    } finally {
      setLoading(false)
    }
  }, [fetcher, label, fallback])

  useEffect(() => {
    void load()
  }, [load])

  return { loading, error, rows, reload: () => void load() }
}

interface PagedSweeps {
  loading: boolean
  error: string | null
  rows: AdminSweepRun[]
  hasMore: boolean
  loadingMore: boolean
  moreError: string | null
  reload: () => void
  loadMore: () => void
}

// Sweep runs page forward with an offset, so older rows are reachable. A page shorter than SWEEP_LIMIT is the last one.
// A failed "Load more" keeps the rows already shown and offers a retry.
function usePagedSweeps(): PagedSweeps {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<AdminSweepRun[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setMoreError(null)
    try {
      const page = await adminBillingOpsApi.getSweepRuns(SWEEP_LIMIT)
      setRows(page)
      setHasMore(page.length === SWEEP_LIMIT)
    } catch (e) {
      logger.error('[AdminBillingOps] sweep runs:', e)
      setRows([])
      setHasMore(false)
      setError(toUserFacingErrorMessage(e, 'Unable to load sweep runs right now. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await adminBillingOpsApi.getSweepRuns(SWEEP_LIMIT, rows.length)
      setRows((prev) => [...prev, ...page])
      setHasMore(page.length === SWEEP_LIMIT)
    } catch (e) {
      logger.error('[AdminBillingOps] sweep runs (more):', e)
      setMoreError(toUserFacingErrorMessage(e, 'Unable to load more sweep runs right now. Please try again.'))
    } finally {
      setLoadingMore(false)
    }
  }, [rows.length])

  useEffect(() => {
    void load()
  }, [load])

  return { loading, error, rows, hasMore, loadingMore, moreError, reload: () => void load(), loadMore: () => void loadMore() }
}

// Shown under a list when the server returned exactly as many rows as were asked for: more rows may exist.
function CapNotice({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p role="note" data-testid={id} className="text-sm text-slate-600 dark:text-slate-300 pt-3">
      {children}
    </p>
  )
}

function Block<T>({ id, what, empty, state, children }: { id: string; what: string; empty: string; state: Loaded<T>; children: (rows: T[]) => ReactNode }) {
  if (state.loading) {
    return (
      <div role="status" aria-live="polite" data-testid={`${id}-loading`} className="flex items-center justify-center py-8">
        <RefreshCw className="animate-spin text-indigo-600" size={24} aria-hidden="true" />
        <span className="sr-only">{`Loading ${what}`}</span>
      </div>
    )
  }
  if (state.error) return <AdminLoadError what={what} message={state.error} onRetry={state.reload} />
  if (state.rows.length === 0) {
    return (
      <p data-testid={`${id}-empty`} className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
        {empty}
      </p>
    )
  }
  return <div className="overflow-x-auto">{children(state.rows)}</div>
}

const loadAgencies = () => adminBillingOpsApi.getAgenciesWithoutSubscription()
const loadEvents = () => adminBillingOpsApi.getWebhookEvents(WEBHOOK_LIMIT)
const loadAttempts = () => adminBillingOpsApi.getWebhookAttempts(WEBHOOK_LIMIT)
const loadCoupons = () => adminBillingOpsApi.getCoupons()

export default function AdminBillingOpsPage() {
  const navigate = useNavigate()
  const agencies = useLoaded<AdminAgencyWithoutSubscription>('agencies', 'Unable to load agencies right now. Please try again.', loadAgencies)
  const events = useLoaded<AdminWebhookEvent>('webhook events', 'Unable to load webhook events right now. Please try again.', loadEvents)
  const attempts = useLoaded<AdminWebhookAttempt>('webhook attempts', 'Unable to load webhook retry attempts right now. Please try again.', loadAttempts)
  const coupons = useLoaded<AdminCoupon>('coupons', 'Unable to load coupons right now. Please try again.', loadCoupons)
  const sweeps = usePagedSweeps()
  const [query, setQuery] = useState('')
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(() => new Set())

  const toggleRun = (id: string) =>
    setOpenRuns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const runs = sweeps.rows
  // The newest run is first; the banner reports only its failures. Tolerates rows that lack the new fields.
  const lastRunFailed = failedOf(runs[0])
  const needle = query.trim().toLowerCase()
  const visibleRuns = useMemo(() => {
    if (!needle) return runs
    return runs.filter((run) =>
      [run.id, formatDateTime(run.startedAt), formatDateTime(run.asOf)].some((value) => value.toLowerCase().includes(needle)),
    )
  }, [runs, needle])

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-5xl mx-auto pb-8 md:pb-10">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className={`${BUTTON} bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700`}
          aria-label="Back to admin dashboard"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
        <Activity className="w-5 h-5 text-purple-600" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Billing ops</h1>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">Read-only view of subscription enforcement and billing webhooks.</p>

      <Section id="ops-agencies-no-subscription" title="Agencies without a live subscription">
        <Block id="agencies" what="agencies" empty="Every approved agency has a live subscription." state={agencies}>
          {(rows) => (
            <table className="min-w-full text-sm" data-testid="agencies-table">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th scope="col" className={TH}>Agency</th>
                  <th scope="col" className={TH}>Owner</th>
                  <th scope="col" className={TH}>Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={TR}>
                    <td className={TD}>{a.name}</td>
                    <td className={`${TD} break-all`}>{a.ownerEmail ?? a.ownerUserId ?? '-'}</td>
                    <td className={TD}>{formatDateTime(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Block>
      </Section>

      <Section id="ops-webhooks" title="Webhook events">
        <h3 className={H3}>{`Webhook events (latest ${WEBHOOK_LIMIT})`}</h3>
        <Block id="events" what="webhook events" empty="No webhook events have been received yet." state={events}>
          {(rows) => (
            <>
            <table className="min-w-full text-sm" data-testid="events-table">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th scope="col" className={TH}>Received</th>
                  <th scope="col" className={TH}>Event</th>
                  <th scope="col" className={TH}>Type</th>
                  <th scope="col" className={TH}>Result</th>
                  <th scope="col" className={TH}>Order</th>
                  <th scope="col" className={TH}>Payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.eventId} className={TR}>
                    <td className={TD}>{formatDateTime(e.receivedAt)}</td>
                    <td className={`${TD} ${MONO}`}>{e.eventId}</td>
                    <td className={TD}>{e.eventType}</td>
                    <td className={TD}>{e.result}</td>
                    <td className={`${TD} ${MONO}`}>{e.orderId ?? '-'}</td>
                    <td className={`${TD} ${MONO}`}>{e.paymentId ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length >= WEBHOOK_LIMIT ? (
              <CapNotice id="events-cap-notice">{`Showing the first ${WEBHOOK_LIMIT} webhook events. Older events are not shown: this list has no paging yet.`}</CapNotice>
            ) : null}
            </>
          )}
        </Block>
        <h3 className={H3}>Retry attempts</h3>
        <Block id="attempts" what="webhook retry attempts" empty="No failed or retried webhook attempts." state={attempts}>
          {(rows) => (
            <>
            <table className="min-w-full text-sm" data-testid="attempts-table">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th scope="col" className={TH}>When</th>
                  <th scope="col" className={TH}>Event</th>
                  <th scope="col" className={TH}>Attempt</th>
                  <th scope="col" className={TH}>Code</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={`${a.eventId}-${a.attemptNo}`} className={TR}>
                    <td className={TD}>{formatDateTime(a.at)}</td>
                    <td className={`${TD} ${MONO}`}>{a.eventId}</td>
                    <td className={`${TD} tabular-nums`}>{a.attemptNo}</td>
                    <td className={`${TD} ${MONO}`}>{a.sqlstateOrCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length >= WEBHOOK_LIMIT ? (
              <CapNotice id="attempts-cap-notice">{`Showing the first ${WEBHOOK_LIMIT} retry attempts. Older attempts are not shown: this list has no paging yet.`}</CapNotice>
            ) : null}
            </>
          )}
        </Block>
      </Section>

      <Section id="ops-sweep-runs" title="Sweep runs">
        {sweeps.loading ? (
          <div role="status" aria-live="polite" data-testid="sweep-loading" className="flex items-center justify-center py-10">
            <RefreshCw className="animate-spin text-indigo-600" size={24} aria-hidden="true" />
            <span className="sr-only">Loading sweep runs</span>
          </div>
        ) : sweeps.error ? (
          <AdminLoadError what="sweep runs" message={sweeps.error} onRetry={sweeps.reload} />
        ) : runs.length === 0 ? (
          <p data-testid="sweep-empty" className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
            No sweep runs have been recorded yet.
          </p>
        ) : (
          <>
            {lastRunFailed > 0 ? (
              <div
                role="status"
                data-testid="sweep-failed-banner"
                className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-100"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{`The last sweep could not update ${lastRunFailed} subscription(s). They need a manual check.`}</span>
              </div>
            ) : null}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <label htmlFor="sweep-search" className="sr-only">Search sweep runs</label>
              <input
                id="sweep-search"
                type="search"
                className={`${INPUT} pl-9`}
                placeholder="Search by run id or date"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {visibleRuns.length === 0 ? (
              <p data-testid="sweep-no-match" className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                No sweep runs match your search.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" data-testid="sweep-table">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      <th scope="col" className={TH}>Run id</th>
                      <th scope="col" className={TH}>Started</th>
                      <th scope="col" className={TH}>Finished</th>
                      <th scope="col" className={TH}>As of</th>
                      <th scope="col" className={TH}>Trials expired</th>
                      <th scope="col" className={TH}>Grace started</th>
                      <th scope="col" className={TH}>Grace expired</th>
                      <th scope="col" className={TH}>Reminders</th>
                      <th scope="col" className={TH}>Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRuns.map((run) => {
                      const failed = failedOf(run)
                      const failures = failuresOf(run)
                      const open = openRuns.has(run.id)
                      const detailId = `sweep-failures-${run.id}`
                      return (
                        <Fragment key={run.id}>
                          <tr className={TR}>
                            <td className={`${TD} ${MONO}`}>{run.id}</td>
                            <td className={TD}>{formatDateTime(run.startedAt)}</td>
                            <td className={TD}>{run.finishedAt ? formatDateTime(run.finishedAt) : 'Not finished'}</td>
                            <td className={TD}>{formatDateTime(run.asOf)}</td>
                            <td className={`${TD} tabular-nums`}>{run.trialsExpired}</td>
                            <td className={`${TD} tabular-nums`}>{run.graceStarted}</td>
                            <td className={`${TD} tabular-nums`}>{run.graceExpired}</td>
                            <td className={`${TD} tabular-nums`}>{run.remindersCreated}</td>
                            <td className={`${TD} tabular-nums`}>
                              {failed > 0 ? (
                                <div className="flex flex-col items-start gap-1">
                                  <span className="inline-flex items-center gap-1 font-medium text-amber-800 dark:text-amber-200">
                                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    {failed}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggleRun(run.id)}
                                    aria-expanded={open}
                                    aria-controls={detailId}
                                    className={`${BUTTON} px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100`}
                                  >
                                    {open ? 'Hide failures' : 'Show failures'}
                                  </button>
                                </div>
                              ) : (
                                '0'
                              )}
                            </td>
                          </tr>
                          {failed > 0 && open ? (
                            <tr id={detailId} className={TR}>
                              <td colSpan={9} className="pb-3 pr-3">
                                {failures.length === 0 ? (
                                  <p className="text-sm text-slate-600 dark:text-slate-300">No failure details were recorded.</p>
                                ) : (
                                  <ul className="space-y-2 text-sm text-slate-800 dark:text-slate-100">
                                    {failures.map((failure, index) => (
                                      <li key={`${failure.subscriptionId}-${index}`} className="break-words">
                                        {describeFailure(failure)}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {failed > failures.length ? (
                                  <p className="pt-2 text-xs text-slate-500 dark:text-slate-400">
                                    {`Showing ${failures.length} of ${failed} failures. The rest were not recorded.`}
                                  </p>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {sweeps.moreError ? (
              <div role="alert" data-testid="sweep-more-error" className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 text-sm text-red-700 dark:text-red-300">
                <span>{sweeps.moreError}</span>
                <button type="button" onClick={sweeps.loadMore} className={`${BUTTON} bg-indigo-600 text-white`}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : null}
            {sweeps.hasMore ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={sweeps.loadMore}
                  disabled={sweeps.loadingMore}
                  data-testid="sweep-load-more"
                  className={`${BUTTON} bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 disabled:opacity-60`}
                >
                  {sweeps.loadingMore ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : null}
                  {sweeps.loadingMore ? 'Loading more sweep runs' : 'Load more sweep runs'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Section>

      <Section id="ops-coupons" title="Coupons">
        <Block id="coupons" what="coupons" empty="No coupons exist yet." state={coupons}>
          {(rows) => (
            <table className="min-w-full text-sm" data-testid="coupons-table">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th scope="col" className={TH}>Code</th>
                  <th scope="col" className={TH}>Discount</th>
                  <th scope="col" className={TH}>Cycles</th>
                  <th scope="col" className={TH}>Monthly only</th>
                  <th scope="col" className={TH}>Valid until</th>
                  <th scope="col" className={TH}>Redeemed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.code} className={TR}>
                    <td className={`${TD} ${MONO}`}>{c.code}</td>
                    <td className={`${TD} tabular-nums`}>{`${c.percentOff}%`}</td>
                    <td className={`${TD} tabular-nums`}>{c.maxCycles}</td>
                    <td className={TD}>{c.monthlyOnly ? 'Yes' : 'No'}</td>
                    <td className={TD}>{c.validUntil ? formatDateTime(c.validUntil) : 'No expiry'}</td>
                    <td className={`${TD} tabular-nums`}>
                      {c.maxRedemptions === null ? `${c.redemptionCount} (no limit)` : `${c.redemptionCount} of ${c.maxRedemptions}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Block>
      </Section>
    </div>
  )
}
