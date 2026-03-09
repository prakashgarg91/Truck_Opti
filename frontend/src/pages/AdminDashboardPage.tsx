import { useState, useEffect, useCallback } from 'react'
import {
  Users, Truck, Package, DollarSign, TrendingUp,
  RefreshCw, Building2, Calendar, Wallet, MessageSquare
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatCurrency } from '../utils/formatters'

interface Analytics {
  totalRevenue: number
  totalAgencies: number
  totalDrivers: number
  totalShipments: number
  platformFee: number
}

interface RecentJob {
  id: string
  agency_name: string
  origin: string
  destination: string
  fare: number
  created_at: string
}

export default function AdminDashboardPage() {
  const { user } = useAuthStore()
  const { language } = useLanguageStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<Analytics>({
    totalRevenue: 0,
    totalAgencies: 0,
    totalDrivers: 0,
    totalShipments: 0,
    platformFee: 0
  })
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])

  // Redirect non-admins
  useEffect(() => {
    const role = user?.role
    if (user && role !== 'admin') {
      toast.error('Admin access required')
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      // Get revenue from delivered jobs
      const { data: jobsData } = await supabase
        .from('agency_jobs')
        .select('fare, created_at, transport_agencies(company_name)')
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(20)

      const totalRevenue = (jobsData ?? [])
        .reduce((sum, job) => sum + (job.fare ?? 0), 0)

      // Get counts
      const [agenciesRes, driversRes, shipmentsRes] = await Promise.all([
        supabase.from('transport_agencies').select('id', { count: 'exact', head: true }),
        supabase.from('drivers').select('id', { count: 'exact', head: true }),
        supabase.from('shipments').select('id', { count: 'exact', head: true }),
      ])

      const agencies = agenciesRes.count ?? 0
      const drivers = driversRes.count ?? 0
      const shipments = shipmentsRes.count ?? 0

      // Map recent jobs
      const jobs: RecentJob[] = (jobsData ?? []).map((j: Record<string, unknown>) => {
        const agency = (Array.isArray(j.transport_agencies) ? j.transport_agencies[0] : j.transport_agencies) as { company_name?: string } | null
        return {
          id: j.id as string,
          agency_name: agency?.company_name ?? 'Unknown',
          origin: '',
          destination: '',
          fare: Number(j.fare ?? 0),
          created_at: j.created_at as string,
        }
      })

      // Get shipment details for the jobs
      if (jobs.length > 0) {
        const jobIds = jobs.map(j => j.id)
        const { data: shipmentsData } = await supabase
          .from('shipments')
          .select('id, origin, destination')
          .in('id', jobIds)

        if (shipmentsData) {
          const shipmentMap = new Map(shipmentsData.map(s => [s.id, s]))
          jobs.forEach(job => {
            const shipment = shipmentMap.get(job.id)
            if (shipment) {
              job.origin = shipment.origin ?? ''
              job.destination = shipment.destination ?? ''
            }
          })
        }
      }

      setRecentJobs(jobs)
      setAnalytics({
        totalRevenue,
        totalAgencies: agencies,
        totalDrivers: drivers,
        totalShipments: shipments,
        platformFee: totalRevenue * 0.10 // 10% platform fee
      })
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAnalytics()
    }
  }, [user?.role, fetchAnalytics])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary-500" />
            Platform Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">Real-time platform overview</p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-slate-500">Total Revenue</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(analytics.totalRevenue)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-slate-500">Agencies</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {analytics.totalAgencies}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-500">Drivers</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {analytics.totalDrivers}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500">Shipments</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {analytics.totalShipments}
          </p>
        </div>
      </div>

      {/* Platform Fee Card */}
      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm font-medium">Estimated Platform Revenue (10%)</p>
            <p className="text-3xl font-bold text-white mt-1">
              {formatCurrency(analytics.platformFee)}
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            Recent Delivered Jobs
          </h2>
        </div>

        {recentJobs.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No delivered jobs yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Agency</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Route</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Fare</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {recentJobs.map(job => (
                  <tr key={job.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {job.agency_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      <span className="truncate max-w-[200px] block">
                        {job.origin || '—'} → {job.destination || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-600 text-right">
                      {formatCurrency(job.fare)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 text-right">
                      {new Date(job.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/admin/drivers')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Users className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">{language === 'en' ? 'Manage Drivers' : 'चालक प्रबंधन'}</span>
        </button>
        <button
          onClick={() => navigate('/admin/agencies')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Building2 className="w-5 h-5 text-indigo-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">{language === 'en' ? 'Manage Agencies' : 'एजेंसी प्रबंधन'}</span>
        </button>
        <button
          onClick={() => navigate('/admin/payouts')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Wallet className="w-5 h-5 text-green-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">{language === 'en' ? 'Driver Payouts' : 'चालक भुगतान'}</span>
        </button>
        <button
          onClick={() => navigate('/admin/contact')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <MessageSquare className="w-5 h-5 text-orange-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">{language === 'en' ? 'Contact Inquiries' : 'संपर्क पूछताछ'}</span>
        </button>
      </div>
    </div>
  )
}
