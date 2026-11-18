import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ChevronLeft, RefreshCw, Search } from 'lucide-react'
import { adminBillingOpsApi, type AdminSweepRun } from '../services/adminSupabaseApi'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import AdminLoadError from './AdminLoadError'

// Read-only ops view. A section whose tables an admin cannot read under RLS/grants renders the
// "not available" notice and makes no query: an empty list would look like a healthy system.
export const NOT_AVAILABLE_TEXT = 'Not available yet: needs an admin read path'

const BUTTON =
  'inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl text-sm font-medium ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'
const INPUT =
  'w-full min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 ' +
  'text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

const SWEEP_LIMIT = 20

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function NotAvailable({ tables }: { tables: string[] }) {
  return (
    <div role="status" data-testid="ops-not-available" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 space-y-1">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{NOT_AVAILABLE_TEXT}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{`Table: ${tables.join(', ')}. Admins cannot read it yet.`}</p>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-testid={`ops-section-${id}`} className="bg-white dark:bg-slate-800 rounded-2xl p-4 md:p-6 shadow-sm space-y-3">
      <h2 id={id} className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
      {children}
    </section>
  )
}

export default function AdminBillingOpsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [runs, setRuns] = useState<AdminSweepRun[]>([])
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setRuns(await adminBillingOpsApi.getSweepRuns(SWEEP_LIMIT))
    } catch (error) {
      logger.error('[AdminBillingOps] sweep runs:', error)
      setRuns([])
      setLoadError(toUserFacingErrorMessage(error, 'Unable to load sweep runs right now. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
        <NotAvailable tables={['subscriptions']} />
      </Section>

      <Section id="ops-webhooks" title="Webhook events">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Webhook events (latest 100)</h3>
        <NotAvailable tables={['razorpay_webhook_events']} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Retry attempts</h3>
        <NotAvailable tables={['razorpay_webhook_attempts']} />
      </Section>

      <Section id="ops-sweep-runs" title="Sweep runs">
        {loading ? (
          <div role="status" aria-live="polite" data-testid="sweep-loading" className="flex items-center justify-center py-10">
            <RefreshCw className="animate-spin text-indigo-600" size={24} aria-hidden="true" />
            <span className="sr-only">Loading sweep runs</span>
          </div>
        ) : loadError ? (
          <AdminLoadError what="sweep runs" message={loadError} onRetry={() => void load()} />
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
                      <th scope="col" className="py-2 pr-3 font-medium">Run id</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Started</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Finished</th>
                      <th scope="col" className="py-2 pr-3 font-medium">As of</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Trials expired</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Grace started</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Grace expired</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Reminders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRuns.map((run) => (
                      <tr key={run.id} className="border-t border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                        <td className="py-2 pr-3 font-mono text-xs break-all">{run.id}</td>
                        <td className="py-2 pr-3">{formatDateTime(run.startedAt)}</td>
                        <td className="py-2 pr-3">{run.finishedAt ? formatDateTime(run.finishedAt) : 'Not finished'}</td>
                        <td className="py-2 pr-3">{formatDateTime(run.asOf)}</td>
                        <td className="py-2 pr-3 tabular-nums">{run.trialsExpired}</td>
                        <td className="py-2 pr-3 tabular-nums">{run.graceStarted}</td>
                        <td className="py-2 pr-3 tabular-nums">{run.graceExpired}</td>
                        <td className="py-2 pr-3 tabular-nums">{run.remindersCreated}</td>
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coupons</h3>
        <NotAvailable tables={['subscription_coupons']} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Redemption counts</h3>
        <NotAvailable tables={['subscription_coupon_redemptions']} />
      </Section>
    </div>
  )
}
