import { useState, useEffect, useCallback } from 'react'
import { Wallet, TrendingUp, Calendar, CheckCircle2, RefreshCw, DollarSign, X, AlertCircle, Download } from 'lucide-react'
import { driverEarningsApi, driverTripsApi } from '../services/supabaseApi'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import { formatCurrency } from '../utils/formatters'
import { downloadCsv, downloadJson, downloadXlsx, type ExportColumn } from '../utils/dataExport'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface EarningSummary {
  date: string
  trips: number
  earnings: number
}

interface JobRecord {
  id: string
  delivered_at: string | null
  status: string
  shipments?: {
    shipment_id?: string
    origin: string
    destination: string
    estimated_cost: number
  }
}

interface TripEarningRow {
  tripId: string
  shipmentRef: string
  route: string
  deliveredOn: string
  earning: number
}

function calculateAvailableBalance(totalEarned: number, payouts: { amount: number; status: string }[]) {
  const reservedStatuses = new Set(['pending', 'approved', 'paid'])
  const reservedAmount = payouts.reduce((sum, payout) => {
    return reservedStatuses.has(payout.status) ? sum + (payout.amount ?? 0) : sum
  }, 0)

  return Math.max(0, totalEarned - reservedAmount)
}

export default function DriverEarningsPage() {
  const { user } = useAuthStore()
  const { language } = useLanguageStore()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [availableBalance, setAvailableBalance] = useState<number>(0)
  const [payoutPaid, setPayoutPaid] = useState<number>(0)
  const [payoutApproved, setPayoutApproved] = useState<number>(0)
  const [payoutPending, setPayoutPending] = useState<number>(0)
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'week' | 'month' | 'total'>('week')
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  const fetchDriverId = useCallback(async () => {
    if (!user?.id) return
    const id = await driverTripsApi.getDriverIdByUserId(user.id)
    if (id) {
      setDriverId(id)
    }
  }, [user?.id])

  const loadData = useCallback(async (drId: string) => {
    try {
      const snapshot = await driverEarningsApi.getBalanceSnapshot(drId)
      setAvailableBalance(calculateAvailableBalance(snapshot.totalDelivered, snapshot.payouts))
      setPayoutPaid(snapshot.paid)
      setPayoutApproved(snapshot.approved)
      setPayoutPending(snapshot.pending)
    } catch (error) {
      logger.error('[DriverEarnings] balance:', error)
      toast.error('Failed to load balance')
    }
  }, [language])

  const fetchJobs = useCallback(async (drId: string) => {
    setLoading(true)
    try {
      const data = await driverTripsApi.getDeliveredTrips(drId, period)
      setJobs(((data ?? []) as Record<string, unknown>[]).map((job) => {
        const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
        return {
          id: job.id as string,
          delivered_at: (job.delivered_at as string | null) ?? null,
          status: job.status as string,
          shipments: shipment
            ? {
              shipment_id: (shipment as Record<string, unknown>).shipment_id as string | undefined,
              origin: (shipment as Record<string, unknown>).origin as string,
              destination: (shipment as Record<string, unknown>).destination as string,
              estimated_cost: Number((shipment as Record<string, unknown>).estimated_cost ?? 0),
            }
            : undefined,
        }
      }))
    } catch (_error) {
      toast.error('Failed to load earnings')
    }
    setLoading(false)
  }, [period])

  useEffect(() => { fetchDriverId() }, [fetchDriverId])
  useEffect(() => { if (driverId) fetchJobs(driverId) }, [driverId, fetchJobs])
  useEffect(() => { if (driverId) loadData(driverId) }, [driverId, loadData])

  const handleWithdrawRequest = async () => {
    if (!driverId) {
      toast.error('Driver account not found')
      return
    }

    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    const available = availableBalance
    if (amount > available) {
      toast.error('Amount exceeds available balance')
      return
    }
    setWithdrawLoading(true)
    try {
      await driverEarningsApi.requestPayout(driverId, amount)
      toast.success('Withdrawal request submitted!')
      setShowWithdrawModal(false)
      setWithdrawAmount('')
      await Promise.all([
        loadData(driverId),
        fetchJobs(driverId),
      ])
    } catch (_err) {
      toast.error('Failed to submit request')
    } finally {
      setWithdrawLoading(false)
    }
  }

  const totalEarnings = jobs.reduce((sum, j) => sum + (j.shipments?.estimated_cost || 0), 0)
  const tripRows: TripEarningRow[] = jobs.map((job) => ({
    tripId: job.id,
    shipmentRef: job.shipments?.shipment_id || job.id.slice(-8).toUpperCase(),
    route: `${job.shipments?.origin || '—'} → ${job.shipments?.destination || '—'}`,
    deliveredOn: new Date(job.delivered_at || Date.now()).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }),
    earning: job.shipments?.estimated_cost || 0,
  }))

  const tripExportColumns: ExportColumn<TripEarningRow>[] = [
    { label: 'Trip ID', value: (row) => row.tripId },
    { label: 'Shipment Ref', value: (row) => row.shipmentRef },
    { label: 'Route', value: (row) => row.route },
    { label: 'Delivered On', value: (row) => row.deliveredOn },
    { label: 'Earning (INR)', value: (row) => row.earning },
  ]

  const handleExport = async (format: 'csv' | 'json' | 'xlsx') => {
    if (tripRows.length === 0) {
      toast.error('No trip earnings available to export')
      return
    }

    const fileBase = `driver-earnings-${period}-${new Date().toISOString().slice(0, 10)}`

    try {
      if (format === 'csv') {
        downloadCsv(tripRows, tripExportColumns, `${fileBase}.csv`)
      } else if (format === 'json') {
        downloadJson(tripRows, `${fileBase}.json`)
      } else {
        await downloadXlsx(tripRows, tripExportColumns, `${fileBase}.xlsx`, 'Trip Earnings')
      }

      toast.success(`${format.toUpperCase()} export ready`)
    } catch (error) {
      logger.error('[DriverEarnings] export failed:', error)
      toast.error('Failed to export trip earnings')
    }
  }

  // Group by date
  const byDate: Record<string, EarningSummary> = {}
  jobs.forEach(j => {
    const date = new Date(j.delivered_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    if (!byDate[date]) byDate[date] = { date, trips: 0, earnings: 0 }
    byDate[date].trips++
    byDate[date].earnings += j.shipments?.estimated_cost || 0
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

      <div className="p-4 md:p-8 space-y-4 max-w-2xl md:max-w-4xl mx-auto">
        {/* Period selector */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
          {(['week', 'month', 'total'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${period === p ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'
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
            {/* Wallet card with earned and pending */}
            <div className="col-span-2 bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">{'Wallet Balance'}</p>
                  <p className="text-3xl font-bold text-white mt-1">₹{availableBalance.toLocaleString('en-IN')}</p>
                  {payoutPending > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-400/20 rounded-lg">
                      <span className="text-amber-100 text-xs font-medium">{'Pending'}: ₹{payoutPending.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {payoutApproved > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-400/20 rounded-lg md:ml-2">
                      <span className="text-blue-100 text-xs font-medium">{'Approved'}: ₹{payoutApproved.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={availableBalance <= 0}
                  className="px-5 py-2.5 bg-white text-green-600 font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-50 transition-colors"
                >
                  {'Withdraw'}
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <Wallet size={20} className="text-green-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatCurrency(totalEarnings)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{'Earnings'}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <CheckCircle2 size={20} className="text-blue-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{jobs.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Trips Completed</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <TrendingUp size={20} className="text-purple-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatCurrency(payoutPending + payoutApproved)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">In Process</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <Calendar size={20} className="text-amber-500 mb-2" />
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatCurrency(payoutPaid)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Withdrawn</p>
              </div>
            </div>

            {/* Per-trip earnings */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Per-Trip Earnings</h3>
                  <p className="text-xs text-slate-400">Filtered by the currently selected period</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['csv', 'xlsx', 'json'] as const).map((format) => (
                    <button
                      key={format}
                      onClick={() => void handleExport(format)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Download size={12} />
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {tripRows.length > 0 ? (
                <div className="divide-y divide-slate-50 dark:divide-slate-700/40">
                  {tripRows.map((trip) => (
                    <div key={trip.tripId} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{trip.route}</p>
                        <p className="text-xs text-slate-400">#{trip.shipmentRef} • {trip.deliveredOn}</p>
                      </div>
                      <p className="text-sm font-bold text-green-600 dark:text-green-400 whitespace-nowrap">{formatCurrency(trip.earning)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No trip earnings in this period
                </div>
              )}
            </div>

            {/* Daily breakdown */}
            {dailySummary.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Daily Summary</h3>
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
                <p className="text-slate-500 dark:text-slate-400 text-sm">{'No trips in this period'}</p>
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
                {'Request Withdrawal'}
              </h3>
              <button onClick={() => setShowWithdrawModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {'Amount (₹)'}
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
                  {'Available:'} ₹{availableBalance.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {'Withdrawal requests are reviewed manually and usually settle within 1 to 2 business days.'}
                </p>
              </div>
              <button
                onClick={handleWithdrawRequest}
                disabled={withdrawLoading || !withdrawAmount}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold rounded-xl transition-colors"
              >
                {withdrawLoading ? ('Submitting...') : ('Submit Request')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
