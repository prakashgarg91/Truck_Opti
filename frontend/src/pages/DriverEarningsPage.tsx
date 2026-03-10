import { useState, useEffect, useCallback } from 'react'
import { Wallet, TrendingUp, Calendar, CheckCircle2, RefreshCw, DollarSign, X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
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
  const { language } = useLanguageStore()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [driverData, setDriverData] = useState<{ total_earnings?: number; pending_payout?: number; bank_account?: string } | null>(null)
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'week' | 'month' | 'total'>('week')
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  const fetchDriverId = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('drivers').select('id, total_earnings, pending_payout, bank_account').eq('user_id', user.id).maybeSingle()
    if (data?.id) {
      setDriverId(data.id)
      setDriverData(data)
    }
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

  const handleWithdrawRequest = async () => {
    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error(language === 'en' ? 'Please enter a valid amount' : 'कृपया एक मान्य राशि दर्ज करें')
      return
    }
    const available = driverData?.pending_payout || 0
    if (amount > available) {
      toast.error(language === 'en' ? 'Amount exceeds available balance' : 'राशि उपलब्ध शेष से अधिक है')
      return
    }
    setWithdrawLoading(true)
    try {
      const { error } = await supabase.from('withdrawal_requests').insert({
        driver_id: driverId,
        amount: amount,
        status: 'pending',
        requested_at: new Date().toISOString()
      })
      if (error) {
        toast.error(language === 'en' ? 'Failed to submit request' : 'अनुरोध जमा करने में विफल')
      } else {
        toast.success(language === 'en' ? 'Withdrawal request submitted!' : 'निकासी अनुरोध जमा!')
        setShowWithdrawModal(false)
        setWithdrawAmount('')
        fetchDriverId() // Refresh driver data
      }
    } catch (err) {
      toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')
    } finally {
      setWithdrawLoading(false)
    }
  }

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
            {/* Available for withdrawal card with withdraw button */}
              <div className="col-span-2 bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium">{language === 'en' ? 'Available for Withdrawal' : 'निकासी के लिए उपलब्ध'}</p>
                    <p className="text-3xl font-bold text-white mt-1">{formatCurrency(driverData?.pending_payout || 0)}</p>
                  </div>
                  <button
                    onClick={() => setShowWithdrawModal(true)}
                    disabled={(driverData?.pending_payout || 0) <= 0}
                    className="px-5 py-2.5 bg-white text-green-600 font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-50 transition-colors"
                  >
                    {language === 'en' ? 'Withdraw' : 'निकालें'}
                  </button>
                </div>
              </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <Wallet size={20} className="text-green-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatCurrency(totalEarnings)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{language === 'en' ? 'Earnings' : 'कमाई'}</p>
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
                <p className="text-slate-500 dark:text-slate-400 text-sm">{language === 'en' ? 'No trips in this period' : 'इस अवधि में कोई यात्रा नहीं'}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Withdrawal Request Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {language === 'en' ? 'Request Withdrawal' : 'निकासी अनुरोध करें'}
              </h3>
              <button onClick={() => setShowWithdrawModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {language === 'en' ? 'Amount (₹)' : 'राशि (₹)'}
                </label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    placeholder="0"
                    className="w-full pl-9 pr4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white font-medium focus:outline-none focus:border-green-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {language === 'en' ? 'Available:' : 'उपलब्ध:'} {formatCurrency(driverData?.pending_payout || 0)}
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {language === 'en'
                    ? 'Withdrawal requests are processed within 24-48 hours. Funds will be transferred to your registered bank account.'
                    : 'निकासी अनुरोध 24-48 घंटों में संcessed किए जाते हैं।'}
                </p>
              </div>
              <button
                onClick={handleWithdrawRequest}
                disabled={withdrawLoading || !withdrawAmount}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold rounded-xl transition-colors"
              >
                {withdrawLoading ? (language === 'en' ? 'Submitting...' : 'जमा हो रहा...') : (language === 'en' ? 'Submit Request' : 'अनुरोध जमा करें')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
