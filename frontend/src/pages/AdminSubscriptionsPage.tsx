import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, CreditCard, Building2, Calendar, CheckCircle2, XCircle, Clock, ChevronLeft, AlertTriangle, RotateCcw } from 'lucide-react'
import {
  adminSupabaseApi,
  type AdminSubscription as Subscription,
  type AdminSubscriptionsSnapshot,
} from '../services/adminSupabaseApi'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'

const STATUS_FILTERS = ['all', 'trial', 'active', 'past_due', 'grace', 'expired', 'cancelled'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trial: 'Trial',
  past_due: 'Past due',
  grace: 'Grace',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const EMPTY_SNAPSHOT: AdminSubscriptionsSnapshot = {
  subscriptions: [],
  opsAttention: { refusedPayments: [], refundExceptions: [] },
}

function getPlanLabel(subscription: Subscription) {
  if (subscription.plan?.name) {
    return subscription.plan.name
  }

  return 'Unknown plan'
}

function getAgencyLabel(subscription: Subscription) {
  return subscription.agency?.name || 'Unassigned agency'
}

function formatDate(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
}

function formatRupees(paise: number | null) {
  if (paise === null || paise === undefined) return '—'
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminSubscriptionsPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<AdminSubscriptionsSnapshot>(EMPTY_SNAPSHOT)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [agencyQuery, setAgencyQuery] = useState('')
  const [reopenTarget, setReopenTarget] = useState<Subscription | null>(null)
  const [reopening, setReopening] = useState(false)
  const subscriptions = snapshot.subscriptions

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true)
    try {
      setSnapshot(await adminSupabaseApi.getAdminSubscriptions())
    } catch (error) {
      logger.error('[AdminSubscriptions] fetch:', error)
      toast.error(toUserFacingErrorMessage(error, 'Failed to load subscriptions'))
      setSnapshot(EMPTY_SNAPSHOT)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchSubscriptions()
    }
  }, [currentUser?.role, fetchSubscriptions])

  const confirmReopen = useCallback(async () => {
    if (!reopenTarget?.agency_id) return
    setReopening(true)
    try {
      await adminSupabaseApi.reopenSubscription(reopenTarget.agency_id)
      toast.success('Subscription reopened. The agency can now buy a plan.')
      setReopenTarget(null)
      await fetchSubscriptions()
    } catch (error) {
      logger.error('[AdminSubscriptions] reopen:', error)
      toast.error(toUserFacingErrorMessage(error, 'Unable to reopen the subscription'))
    } finally {
      setReopening(false)
    }
  }, [reopenTarget, fetchSubscriptions])

  const agencyNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const sub of subscriptions) {
      if (sub.agency_id && sub.agency?.name) names.set(sub.agency_id, sub.agency.name)
    }
    return names
  }, [subscriptions])

  const visibleSubscriptions = useMemo(() => {
    const needle = agencyQuery.trim().toLowerCase()
    return subscriptions.filter((sub) => {
      if (statusFilter !== 'all' && sub.status !== statusFilter) return false
      if (!needle) return true
      return [sub.agency?.name, sub.agency?.gstin, sub.purchaser?.email, sub.purchaser?.name]
        .some((field) => (field ?? '').toLowerCase().includes(needle))
    })
  }, [subscriptions, statusFilter, agencyQuery])

  const agencyLabelFor = (agencyId: string | null) => (agencyId ? agencyNames.get(agencyId) ?? agencyId : 'Unknown agency')

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      trial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      past_due: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      grace: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
    }
    const icons: Record<string, typeof CheckCircle2> = {
      active: CheckCircle2,
      trial: Clock,
      past_due: AlertTriangle,
      grace: AlertTriangle,
      expired: XCircle,
      cancelled: XCircle
    }
    const Icon = icons[status] || Clock

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.cancelled}`}>
        <Icon size={10} />
        {STATUS_LABELS[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    )
  }

  const { refusedPayments, refundExceptions } = snapshot.opsAttention
  const opsCount = refusedPayments.length + refundExceptions.length
  const count = (...statuses: string[]) => subscriptions.filter((s) => statuses.includes(s.status)).length

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-4xl md:max-w-6xl mx-auto pb-8 md:pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            aria-label="Back to admin dashboard"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
          <CreditCard className="w-5 h-5 text-purple-600" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {'Subscriptions'}
          </h1>
        </div>
        <button aria-label="Refresh subscriptions"
          onClick={fetchSubscriptions}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Total'}</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{subscriptions.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Active'}</p>
          <p className="text-2xl font-bold text-green-600">{count('active')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Trial'}</p>
          <p className="text-2xl font-bold text-amber-600">{count('trial')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Past due / Grace'}</p>
          <p className="text-2xl font-bold text-orange-600">{count('past_due', 'grace')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Expired / Cancelled'}</p>
          <p className="text-2xl font-bold text-red-600">{count('expired', 'cancelled')}</p>
        </div>
      </div>

      {/* Ops attention */}
      <section aria-labelledby="ops-attention-heading" data-testid="ops-attention" className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <h2 id="ops-attention-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <AlertTriangle size={14} className="text-orange-600" />
          {'Ops attention'}
          <span className="text-xs font-normal text-slate-500">{`(${opsCount})`}</span>
        </h2>
        {opsCount === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{'Nothing needs attention.'}</p>
        ) : (
          <>
            {refusedPayments.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 mb-1">{'Captured payments the system refused'}</h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {refusedPayments.map((item) => (
                    <li key={item.id} data-testid="refused-payment" className="py-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{agencyLabelFor(item.agency_id)}</span>
                      {` — ${formatRupees(item.amount_paise)} refused: `}
                      <span className="font-mono text-xs">{item.refusal}</span>
                      <p className="text-xs text-slate-400">
                        {`Payment ${item.payment_id ?? '—'} · Order ${item.order_id ?? '—'} · ${formatDate(item.refused_at)}. Refund or resolve it in Razorpay.`}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {refundExceptions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 mb-1">{'Refunds that could not be credit-noted'}</h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {refundExceptions.map((item) => (
                    <li key={item.id} data-testid="refund-exception" className="py-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{agencyLabelFor(item.agency_id)}</span>
                      {` — ${formatRupees(item.amount_paise)} refunded: `}
                      <span className="font-mono text-xs">{item.reason}</span>
                      <p className="text-xs text-slate-400">
                        {`Refund ${item.refund_id} · Payment ${item.payment_id} · ${formatDate(item.created_at)}. Reconcile by hand.`}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <label className="sr-only" htmlFor="sub-status-filter">{'Filter by status'}</label>
        <select
          id="sub-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
        >
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>{value === 'all' ? 'All statuses' : STATUS_LABELS[value]}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="sub-agency-search">{'Search agency'}</label>
        <input
          id="sub-agency-search"
          type="search"
          value={agencyQuery}
          onChange={(e) => setAgencyQuery(e.target.value)}
          placeholder="Search agency, GSTIN or purchaser"
          className="flex-1 px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
        />
      </div>

      {/* Reopen confirm step */}
      {reopenTarget && (
        <div role="alertdialog" aria-labelledby="reopen-title" data-testid="reopen-confirm" className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-3">
          <p id="reopen-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {`Reopen after cancellation: ${getAgencyLabel(reopenTarget)}`}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {'This adds a fresh expired subscription so the agency can buy a plan again. It does not grant access or refund anything.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmReopen}
              disabled={reopening}
              className="px-3 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white disabled:opacity-60"
            >
              {reopening ? 'Reopening…' : 'Confirm reopen'}
            </button>
            <button
              onClick={() => setReopenTarget(null)}
              disabled={reopening}
              className="px-3 py-2 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              {'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Subscriptions Table */}
      {subscriptions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center">
          <CreditCard size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {'No subscriptions yet'}
          </p>
        </div>
      ) : visibleSubscriptions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {'No subscriptions match these filters'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <Building2 size={12} />
                      {'Agency'}
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <CreditCard size={12} />
                      {'Plan'}
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    {'Status'}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {'Trial End'}
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    {'Period End'}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    {'Grace End'}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    {'First Paid'}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {'Created'}
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    {'Action'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {visibleSubscriptions.map(sub => (
                  <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {getAgencyLabel(sub)}
                        </p>
                        <p className="text-xs text-slate-400">{sub.purchaser?.email || sub.agency?.gstin || '—'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {getPlanLabel(sub)}
                        </span>
                        {sub.plan?.tier ? (
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            {sub.plan.tier}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(sub.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(sub.trial_end)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(sub.current_period_end)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(sub.grace_end)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(sub.first_paid_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(sub.created_at)}</td>
                    <td className="px-4 py-3">
                      {sub.can_reopen ? (
                        <button
                          onClick={() => setReopenTarget(sub)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100"
                        >
                          <RotateCcw size={12} />
                          {'Reopen after cancellation'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">{'—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
