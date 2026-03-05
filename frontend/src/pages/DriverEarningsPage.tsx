import { useState, useEffect, useCallback } from 'react'
import { Wallet, TrendingUp, Calendar, CheckCircle2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'

interface EarningSummary {
  date: string
  trips: number
  earnings: number
}

interface JobRecord {
  id: string
  offered_at: string
  status: string
  shipments?: { origin_address: string; destination_address: string; estimated_distance_km: number }
}

const PER_KM_RATE = 15 // ₹15/km placeholder

export default function DriverEarningsPage() {
  const { user } = useAuthStore()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'week' | 'month' | 'total'>('week')

  const fetchDriverId = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('drivers').select('id').eq('user_id', user.id).maybeSingle()
    if (data?.id) setDriverId(data.id)
  }, [user?.id])

  const fetchJobs = useCallback(async (drId: string) => {
    setLoading(true)
    let query = supabase
      .from('job_offers')
      .select('id, offered_at, status, shipments(origin_address, destination_address, estimated_distance_km)')
      .eq('driver_id', drId)
      .eq('status', 'accepted')
      .order('offered_at', { ascending: false })

    if (period !== 'total') {
      const days = period === 'week' ? 7 : 30
      const since = new Date(Date.now() - days * 86400000).toISOString()
      query = query.gte('offered_at', since)
    }

    const { data, error } = await query.limit(100)
    if (error) toast.error('Failed to load earnings')
    setJobs((data as unknown as JobRecord[]) || [])
    setLoading(false)
  }, [period])

  useEffect(() => { fetchDriverId() }, [fetchDriverId])
  useEffect(() => { if (driverId) fetchJobs(driverId) }, [driverId, fetchJobs])

  const totalEarnings = jobs.reduce((sum, j) => sum + (j.shipments?.estimated_distance_km || 0) * PER_KM_RATE, 0)
  const totalKm = jobs.reduce((sum, j) => sum + (j.shipments?.estimated_distance_km || 0), 0)

  // Group by date
  const byDate: Record<string, EarningSummary> = {}
  jobs.forEach(j => {
    const date = new Date(j.offered_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    if (!byDate[date]) byDate[date] = { date, trips: 0, earnings: 0 }
    byDate[date].trips++
    byDate[date].earnings += (j.shipments?.estimated_distance_km || 0) * PER_KM_RATE
  })
  const dailySummary = Object.values(byDate).slice(0, 10)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-10 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
          <Wallet size={18} className="text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h1 className="font-bold text-slate-800 dark:text-slate-100">Earnings</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Your trip earnings summary</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-md mx-auto">
        {/* Period selector */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
          {(['week', 'month', 'total'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                period === p ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <Wallet size={20} className="text-green-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatCurrency(totalEarnings)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Earnings</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <CheckCircle2 size={20} className="text-blue-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{jobs.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Trips Completed</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <TrendingUp size={20} className="text-purple-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{Math.round(totalKm)} km</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Distance</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <Calendar size={20} className="text-amber-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {jobs.length > 0 ? formatCurrency(Math.round(totalEarnings / jobs.length)) : '₹0'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Avg/Trip</p>
              </div>
            </div>

            {/* Daily breakdown */}
            {dailySummary.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Daily Breakdown</h3>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-700/40">
                  {dailySummary.map(day => (
                    <div key={day.date} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{day.date}</p>
                        <p className="text-xs text-slate-400">{day.trips} trip{day.trips !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(day.earnings)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center shadow-sm">
                <Wallet size={36} className="text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">No trips in this period</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
