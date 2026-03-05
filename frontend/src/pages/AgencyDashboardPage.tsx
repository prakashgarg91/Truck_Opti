import { useState, useEffect, useCallback } from 'react'
import {
  Building2, Briefcase, Truck, TrendingUp,
  AlertTriangle, RefreshCw, CheckCircle2, Clock,
  ChevronRight, BarChart3
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'

interface AgencyRecord {
  id: string
  company_name: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  rating: number
  total_jobs: number
  fleet_size: number | null
  city: string | null
  gstin: string | null
}

interface JobSummary {
  active: number
  today: number
  pending: number
  thirtyDayRevenue: number
  thirtyDayJobs: number
}

export default function AgencyDashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [agency, setAgency] = useState<AgencyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<JobSummary>({
    active: 0, today: 0, pending: 0, thirtyDayRevenue: 0, thirtyDayJobs: 0
  })

  const fetchAgency = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('transport_agencies')
      .select('id, company_name, status, rating, total_jobs, fleet_size, city, gstin')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) toast.error('Failed to load agency profile')
    setAgency(data)
    setLoading(false)
  }, [user?.id])

  const fetchSummary = useCallback(async (agencyId: string) => {
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [activeRes, todayRes, pendingRes, revenueRes] = await Promise.all([
      supabase.from('agency_jobs').select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId).in('status', ['accepted', 'in_transit']),
      supabase.from('agency_jobs').select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId).gte('created_at', today),
      supabase.from('agency_jobs').select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId).eq('status', 'pending'),
      supabase.from('agency_jobs').select('fare')
        .eq('agency_id', agencyId).eq('status', 'delivered').gte('updated_at', thirtyDaysAgo),
    ])

    const thirtyDayJobs = revenueRes.data?.length ?? 0
    const thirtyDayRevenue = (revenueRes.data ?? []).reduce(
      (acc: number, j: { fare: number | null }) => acc + (j.fare ?? 0), 0
    )
    setSummary({
      active: activeRes.count ?? 0,
      today: todayRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      thirtyDayRevenue,
      thirtyDayJobs,
    })
  }, [])

  useEffect(() => {
    fetchAgency()
  }, [fetchAgency])

  useEffect(() => {
    if (agency?.id) {
      fetchSummary(agency.id)
    }
  }, [agency?.id, fetchSummary])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    )
  }

  if (!agency) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Building2 size={64} className="text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          No Agency Profile Found
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
          Register your transport agency to access the agency portal.
        </p>
        <button
          onClick={() => navigate('/agency/register')}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold"
        >
          Register Your Agency
        </button>
      </div>
    )
  }

  const statusConfig = {
    pending:   { label: 'Verification Pending',  color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    approved:  { label: 'Verified ✓',             color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    rejected:  { label: 'Application Rejected',  color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    suspended: { label: 'Account Suspended',     color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  }
  const statusInfo = statusConfig[agency.status]

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Status Banner */}
      {agency.status !== 'approved' && (
        <div className={`rounded-2xl p-4 ${statusInfo.color}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{statusInfo.label}</p>
              <p className="text-sm mt-1 opacity-80">
                {agency.status === 'pending'
                  ? 'Your application is under review. We\'ll notify you within 24–48 hours.'
                  : agency.status === 'rejected'
                  ? 'Contact support to reapply or resolve issues.'
                  : 'Contact support for more information.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Agency Header Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Building2 size={24} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate text-lg">
              {agency.company_name}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {agency.city || 'India'} {agency.gstin ? `• GSTIN: ${agency.gstin}` : ''}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase size={16} className="text-blue-500" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Active Jobs</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.active}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-500" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Jobs Today</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.today}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-amber-500" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Pending</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.pending}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-emerald-500" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Last 30 Days</span>
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {formatCurrency(summary.thirtyDayRevenue)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{summary.thirtyDayJobs} jobs completed</p>
        </div>
      </div>

      {/* Fleet Overview */}
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
        onClick={() => navigate('/agency/fleet')}
      >
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Truck size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Fleet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {agency.fleet_size != null ? `${agency.fleet_size} vehicles registered` : 'Set up your fleet'}
          </p>
        </div>
        <ChevronRight size={18} className="text-slate-400" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('/agency/jobs')}
            className="flex items-center gap-2 py-3 px-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-xl text-sm font-medium"
          >
            <Briefcase size={16} />
            View Jobs
          </button>
          <button
            onClick={() => navigate('/agency/fleet')}
            className="flex items-center gap-2 py-3 px-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-xl text-sm font-medium"
          >
            <Truck size={16} />
            Manage Fleet
          </button>
          <button
            onClick={() => navigate('/agency/billing')}
            className="flex items-center gap-2 py-3 px-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl text-sm font-medium"
          >
            <BarChart3 size={16} />
            Billing
          </button>
          <button
            onClick={() => navigate('/agency/rates')}
            className="flex items-center gap-2 py-3 px-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl text-sm font-medium"
          >
            <TrendingUp size={16} />
            Rate Cards
          </button>
        </div>
      </div>

      {agency.total_jobs > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <BarChart3 size={20} className="text-slate-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {agency.total_jobs} total jobs completed
            </p>
            <p className="text-xs text-slate-400">Rating: {agency.rating?.toFixed(1) || '—'} ★</p>
          </div>
        </div>
      )}
    </div>
  )
}
