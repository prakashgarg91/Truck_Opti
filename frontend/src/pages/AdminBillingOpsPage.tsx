import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ChevronLeft, RefreshCw, Search } from 'lucide-react'
import {
  adminBillingOpsApi,
  type AdminAgencyWithoutSubscription,
  type AdminCoupon,
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
const loadSweepRuns = () => adminBillingOpsApi.getSweepRuns(SWEEP_LIMIT)

export default function AdminBillingOpsPage() {
  const navigate = useNavigate()
  const agencies = useLoaded<AdminAgencyWithoutSubscription>('agencies', 'Unable to load agencies right now. Please try again.', loadAgencies)
  const events = useLoaded<AdminWebhookEvent>('webhook events', 'Unable to load webhook events right now. Please try again.', loadEvents)
  const attempts = useLoaded<AdminWebhookAttempt>('webhook attempts', 'Unable to load webhook retry attempts right now. Please try again.', loadAttempts)
  const coupons = useLoaded<AdminCoupon>('coupons', 'Unable to load coupons right now. Please try again.', loadCoupons)
  const sweeps = useLoaded<AdminSweepRun>('sweep runs', 'Unable to load sweep runs right now. Please try again.', loadSweepRuns)
  const [query, setQuery] = useState('')

  const runs = sweeps.rows
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
          )}
        </Block>
        <h3 className={H3}>Retry attempts</h3>
        <Block id="attempts" what="webhook retry attempts" empty="No failed or retried webhook attempts." state={attempts}>
          {(rows) => (
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
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRuns.map((run) => (
                      <tr key={run.id} className={TR}>
                        <td className={`${TD} ${MONO}`}>{run.id}</td>
                        <td className={TD}>{formatDateTime(run.startedAt)}</td>
                        <td className={TD}>{run.finishedAt ? formatDateTime(run.finishedAt) : 'Not finished'}</td>
                        <td className={TD}>{formatDateTime(run.asOf)}</td>
                        <td className={`${TD} tabular-nums`}>{run.trialsExpired}</td>
                        <td className={`${TD} tabular-nums`}>{run.graceStarted}</td>
                        <td className={`${TD} tabular-nums`}>{run.graceExpired}</td>
                        <td className={`${TD} tabular-nums`}>{run.remindersCreated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
