import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CreditCard, User, Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface Subscription {
  id: string
  user_id: string
  plan_id: string
  status: 'active' | 'trial' | 'expired' | 'cancelled'
  trial_ends_at: string | null
  created_at: string
  users: {
    name: string
    email: string
  } | null
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise'
}

export default function AdminSubscriptionsPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  // Redirect non-admins
  useEffect(() => {
    const role = user?.role
    if (user && role !== 'admin') {
      toast.error('Admin access required')
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, user_id, plan_id, status, trial_ends_at, created_at, users!inner(name, email)')
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[AdminSubscriptions] fetch:', error)
      toast.error('Failed to load subscriptions')
      setLoading(false)
      return
    }

    const subs: Subscription[] = (data ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      user_id: s.user_id as string,
      plan_id: s.plan_id as string,
      status: s.status as 'active' | 'trial' | 'expired' | 'cancelled',
      trial_ends_at: s.trial_ends_at as string | null,
      created_at: s.created_at as string,
      users: (Array.isArray(s.users) ? s.users[0] : s.users) as { name: string; email: string } | null
    }))

    setSubscriptions(subs)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchSubscriptions()
    }
  }, [user?.role, fetchSubscriptions])

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
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-4 gap-3">
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
                          {sub.users?.name || '—'}
                        </p>
                        <p className="text-xs text-slate-400">{sub.users?.email || '—'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {PLAN_LABELS[sub.plan_id] || sub.plan_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(sub.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {sub.trial_ends_at
                        ? new Date(sub.trial_ends_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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
