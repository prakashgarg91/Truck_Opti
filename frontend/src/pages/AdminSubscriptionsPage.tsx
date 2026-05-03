import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, CreditCard, User, Calendar, CheckCircle2, XCircle, Clock, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface Subscription {
  id: string
  user_id: string
  status: 'active' | 'trial' | 'expired' | 'cancelled'
  billing_cycle: 'monthly' | 'yearly'
  current_period_start: string
  current_period_end: string
  trial_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  user: {
    name: string
    email: string
  } | null
  plan: {
    id: string
    name: string
    tier: string
  } | null
}

interface AdminSubscriptionsResponse {
  subscriptions: Subscription[]
}

async function getFunctionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error && typeof error === 'object') {
    const response = 'context' in error ? error.context : null

    if (response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as { error?: string }

        if (typeof payload.error === 'string' && payload.error.trim()) {
          return payload.error
        }
      } catch {
        // Fall back to the generic error message below.
      }
    }

    if ('message' in error && typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
  }

  return fallbackMessage
}

function getPlanLabel(subscription: Subscription) {
  if (subscription.plan?.name) {
    return subscription.plan.name
  }

  return 'Unknown plan'
}

export default function AdminSubscriptionsPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke<AdminSubscriptionsResponse>('admin-portal-subscriptions', {
        body: { action: 'list' },
      })

      if (error) {
        logger.error('[AdminSubscriptions] fetch:', error)
        toast.error(await getFunctionErrorMessage(error, 'Failed to load subscriptions'))
        setSubscriptions([])
        return
      }

      setSubscriptions(data?.subscriptions ?? [])
    } catch (error) {
      logger.error('[AdminSubscriptions] fetch:', error)
      toast.error(await getFunctionErrorMessage(error, 'Failed to load subscriptions'))
      setSubscriptions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchSubscriptions()
    }
  }, [currentUser?.role, fetchSubscriptions])

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      trial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
    }
    const labels: Record<string, string> = {
      active: 'Active',
      trial: 'Trial',
      expired: 'Expired',
      cancelled: 'Cancelled'
    }
    const icons: Record<string, typeof CheckCircle2> = {
      active: CheckCircle2,
      trial: Clock,
      expired: XCircle,
      cancelled: XCircle
    }
    const Icon = icons[status] || Clock

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.cancelled}`}>
        <Icon size={10} />
        {labels[status] || status}
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
        <button
          onClick={fetchSubscriptions}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Total'}</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{subscriptions.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Active'}</p>
          <p className="text-2xl font-bold text-green-600">{subscriptions.filter(s => s.status === 'active').length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Trial'}</p>
          <p className="text-2xl font-bold text-amber-600">{subscriptions.filter(s => s.status === 'trial').length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{'Expired'}</p>
          <p className="text-2xl font-bold text-red-600">{subscriptions.filter(s => s.status === 'expired' || s.status === 'cancelled').length}</p>
        </div>
      </div>

      {/* Subscriptions Table */}
      {subscriptions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center">
          <CreditCard size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {'No subscriptions yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      {'User'}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <CreditCard size={12} />
                      {'Plan'}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    {'Status'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {'Trial End'}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {'Created'}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {subscriptions.map(sub => (
                  <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {sub.user?.name || sub.user?.email || '—'}
                        </p>
                        <p className="text-xs text-slate-400">{sub.user?.email || '—'}</p>
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
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {sub.trial_end
                        ? new Date(sub.trial_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(sub.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
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
