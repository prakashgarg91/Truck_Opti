import { useState, useEffect, useCallback } from 'react'
import {
  Power, Truck, Star, TrendingUp, Clock,
  CheckCircle2, XCircle, AlertTriangle,
  Wallet, Navigation, PhoneCall, RefreshCw, UserCircle, X, DollarSign
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface DriverRecord {
  id: string
  full_name: string
  phone: string
  vehicle_type: string
  home_city: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  rating: number
  total_trips: number
  is_online: boolean
  active_job_id: string | null
  created_at: string
}

interface JobOffer {
  id: string
  shipment_id: string
  offered_at: string
  expires_at: string
  status: string
  shipments?: {
    origin: string
    destination: string
    total_weight: number
    estimated_cost: number
  }
}

interface TripHistory {
  id: string
  offered_at: string
  responded_at: string | null
  delivered_at: string | null
  status: string
  estimated_fare: number
  shipments?: {
    origin: string
    destination: string
    estimated_cost: number
  }
}

const VEHICLE_LABELS: Record<string, string> = {
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
}

function normalizeShipmentSummary(shipment: Record<string, unknown> | null | undefined) {
  if (!shipment) return undefined

  return {
    origin: typeof shipment.origin === 'string' ? shipment.origin : '—',
    destination: typeof shipment.destination === 'string' ? shipment.destination : '—',
    total_weight: Number(shipment.total_weight ?? 0),
    estimated_cost: Number(shipment.estimated_cost ?? 0),
  }
}

export default function DriverDashboardPage() {
  const { user } = useAuthStore()
  const { language } = useLanguageStore()
  const navigate = useNavigate()
  const [driver, setDriver] = useState<DriverRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [togglingOnline, setTogglingOnline] = useState(false)
  const [incomingJob, setIncomingJob] = useState<JobOffer | null>(null)
  const [countdown, setCountdown] = useState(30)
  const [tripHistory, setTripHistory] = useState<TripHistory[]>([])
  const [todayEarnings, setTodayEarnings] = useState(0)
  const [todayTrips, setTodayTrips] = useState(0)
  const [respondingJob, setRespondingJob] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)
  const [totalEarned, setTotalEarned] = useState(0)
  const [completedTrips, setCompletedTrips] = useState<TripHistory[]>([])
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [payoutHistory, setPayoutHistory] = useState<{ id: string, amount: number, status: string, requested_at: string }[]>([])

  const fetchIncomingJob = useCallback(async (jobOfferId: string): Promise<JobOffer | null> => {
    const { data, error } = await supabase
      .from('job_offers')
      .select('id, shipment_id, offered_at, expires_at, status, shipments(origin, destination, total_weight, estimated_cost)')
      .eq('id', jobOfferId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    const shipment = Array.isArray(data.shipments) ? data.shipments[0] : data.shipments

    return {
      id: data.id,
      shipment_id: data.shipment_id,
      offered_at: data.offered_at,
      expires_at: data.expires_at,
      status: data.status,
      shipments: normalizeShipmentSummary(shipment as Record<string, unknown> | null | undefined),
    }
  }, [])

  const fetchDriver = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      toast.error('Failed to load driver profile')
    }
    setDriver(data)
    setLoading(false)
  }, [user?.id])

  const fetchHistory = useCallback(async (driverId: string) => {
    const { data, error } = await supabase
      .from('job_offers')
      .select('id, offered_at, responded_at, delivered_at, status, shipments(origin, destination, estimated_cost)')
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'declined', 'expired', 'delivered'])
      .order('offered_at', { ascending: false })
      .limit(10)

    if (error) {
      toast.error('Failed to load trip history')
      return
    }

    const rawData: TripHistory[] = (data ?? []).map((job: Record<string, unknown>) => {
      const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
      const normalizedShipment = normalizeShipmentSummary(shipment as Record<string, unknown> | null | undefined)

      return {
        id: job.id as string,
        offered_at: job.offered_at as string,
        responded_at: (job.responded_at as string | null) ?? null,
        delivered_at: (job.delivered_at as string | null) ?? null,
        status: job.status as string,
        estimated_fare: normalizedShipment?.estimated_cost ?? 0,
        shipments: normalizedShipment
          ? {
            origin: normalizedShipment.origin,
            destination: normalizedShipment.destination,
            estimated_cost: normalizedShipment.estimated_cost,
          }
          : undefined,
      }
    })

    setTripHistory(rawData)

    // Count today's accepted trips
    const today = new Date().toISOString().split('T')[0]
    const delivered = rawData.filter((j: TripHistory) => j.status === 'delivered')
    const todayDelivered = delivered.filter(
      (j: TripHistory) => (j.delivered_at || j.responded_at || j.offered_at).startsWith(today)
    )
    setTodayTrips(todayDelivered.length)
    setTodayEarnings(todayDelivered.reduce((sum: number, j: TripHistory) => sum + j.estimated_fare, 0))

    // Calculate wallet earnings from delivered trips
    const total = delivered.reduce((sum: number, j: TripHistory) => sum + j.estimated_fare, 0)
    setTotalEarned(total)
    setWalletBalance(total) // Available = total (no withdrawals yet)
    setCompletedTrips(delivered.slice(0, 5))

    // Fetch payout history
    const { data: payouts } = await supabase
      .from('driver_payouts')
      .select('id, amount, status, requested_at')
      .eq('driver_id', driverId)
      .order('requested_at', { ascending: false })
      .limit(5)
    setPayoutHistory(payouts || [])
  }, [])

  const handleWithdrawal = async () => {
    if (!driver?.id) return
    const amount = parseFloat(withdrawalAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error(language === 'en' ? 'Please enter a valid amount' : 'कृपया एक मान्य राशि दर्ज करें')
      return
    }
    if (amount > walletBalance) {
      toast.error(language === 'en' ? 'Amount exceeds available balance' : 'राशि उपलब्ध शेष से अधिक है')
      return
    }
    setWithdrawing(true)
    const { error } = await supabase.from('driver_payouts').insert({
      driver_id: driver.id,
      amount: amount,
      status: 'pending'
    })
    if (error) {
      logger.error('[Withdrawal]', error)
      toast.error(language === 'en' ? 'Failed to submit withdrawal request' : 'निकासी अनुरोध सबमिट करने में विफल')
    } else {
      toast.success(language === 'en' ? 'Withdrawal request submitted' : 'निकासी अनुरोध सबमिट किया गया')
      setShowWithdrawalModal(false)
      setWithdrawalAmount('')
      // Refresh payout history
      const { data: payouts } = await supabase
        .from('driver_payouts')
        .select('id, amount, status, requested_at')
        .eq('driver_id', driver.id)
        .order('requested_at', { ascending: false })
        .limit(5)
      setPayoutHistory(payouts || [])
    }
    setWithdrawing(false)
  }

  useEffect(() => {
    fetchDriver()
  }, [fetchDriver])

  useEffect(() => {
    if (driver?.id) {
      fetchHistory(driver.id)
    }
  }, [driver?.id, fetchHistory])

  // Subscribe to incoming job offers via Supabase Realtime
  useEffect(() => {
    if (!driver?.id || driver.status !== 'approved') return

    const channel = supabase
      .channel(`job_offers_${driver.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_offers',
          filter: `driver_id=eq.${driver.id}`,
        },
        (payload) => {
          const job = payload.new as { id?: string; status?: string }
          if (job.status === 'pending' && job.id) {
            void fetchIncomingJob(job.id).then((fullJob) => {
              setIncomingJob(fullJob ?? { id: job.id as string, shipment_id: '', offered_at: '', expires_at: '', status: 'pending' })
              setCountdown(30)
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [driver?.id, driver?.status, fetchIncomingJob])

  // Countdown timer for incoming job
  useEffect(() => {
    if (!incomingJob) return
    if (countdown <= 0) {
      setIncomingJob(null)
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [incomingJob, countdown])

  const toggleOnline = async () => {
    if (!driver?.id) return
    if (driver.status !== 'approved') {
      toast.error('Your account must be approved before going online')
      return
    }
    setTogglingOnline(true)
    const newOnline = !driver.is_online
    const { error } = await supabase
      .from('drivers')
      .update({ is_online: newOnline })
      .eq('id', driver.id)
    if (error) {
      toast.error('Failed to update status')
    } else {
      setDriver(d => d ? { ...d, is_online: newOnline } : d)
      toast.success(newOnline ? '🟢 You are now Online' : '⚫ You are now Offline')
    }
    setTogglingOnline(false)
  }

  const respondToJob = async (accept: boolean) => {
    if (!incomingJob || !driver?.id) return
    setRespondingJob(true)
    const { error } = await supabase
      .from('job_offers')
      .update({
        status: accept ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', incomingJob.id)
    if (error) {
      toast.error('Failed to respond to job')
    } else {
      toast.success(accept ? '✅ Job Accepted! Navigate to pickup.' : 'Job declined.')
      if (accept) {
        await supabase
          .from('drivers')
          .update({ active_job_id: incomingJob.id })
          .eq('id', driver.id)
      }
    }
    setIncomingJob(null)
    setRespondingJob(false)
    fetchDriver()
    if (driver.id) fetchHistory(driver.id)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-blue-600" size={32} />
      </div>
    )
  }

  if (!driver) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <UserCircle size={64} className="text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          No Driver Profile Found
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
          Register as a driver to access the driver dashboard.
        </p>
        <button
          onClick={() => navigate('/driver/register')}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold"
        >
          Register as Driver
        </button>
      </div>
    )
  }

  const statusConfig = {
    pending: { label: 'Verification Pending', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    approved: { label: 'Verified ✓', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    rejected: { label: 'Application Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    suspended: { label: 'Account Suspended', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  }

  const statusInfo = statusConfig[driver.status]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Withdrawal Request Modal */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {language === 'en' ? 'Request Withdrawal' : 'निकासी का अनुरोध करें'}
              </h3>
              <button onClick={() => setShowWithdrawalModal(false)} className="p-1">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Amount (₹)' : 'राशि (₹)'}
                </label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    placeholder="0"
                    max={walletBalance}
                    className="w-full pl-9 pr-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {language === 'en' ? 'Available:' : 'उपलब्ध:'} {formatCurrency(walletBalance)}
                </p>
              </div>
              <button
                onClick={handleWithdrawal}
                disabled={withdrawing || !withdrawalAmount}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-semibold rounded-xl transition-colors"
              >
                {withdrawing
                  ? (language === 'en' ? 'Submitting...' : 'सबमिट हो रहा है...')
                  : (language === 'en' ? 'Submit Request' : 'अनुरोध सबमिट करें')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Job Offer Modal */}
      {incomingJob && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-t-3xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">New Job Offer! 🚛</h3>
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${countdown <= 10 ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  }`}
              >
                {countdown}
              </div>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pickup</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                    {incomingJob.shipments?.origin || 'Pickup Location'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Drop</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                    {incomingJob.shipments?.destination || 'Drop Location'}
                  </p>
                </div>
              </div>
              {incomingJob.shipments && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  {incomingJob.shipments.total_weight > 0 && (
                    <>
                      <Truck size={14} />
                      <span>{incomingJob.shipments.total_weight} kg</span>
                    </>
                  )}
                  {incomingJob.shipments.estimated_cost > 0 && (
                    <>
                      <span className="mx-1">•</span>
                      <Wallet size={14} />
                      <span className="text-green-600 font-semibold">
                        {formatCurrency(incomingJob.shipments.estimated_cost)}
                      </span>
                      <span className="text-xs text-slate-400"> est.</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                disabled={respondingJob}
                onClick={() => respondToJob(false)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-semibold disabled:opacity-50"
              >
                <XCircle size={18} />
                Decline
              </button>
              <button
                disabled={respondingJob}
                onClick={() => respondToJob(true)}
                className="flex-2 flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-50"
              >
                <CheckCircle2 size={18} />
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 lg:p-8 space-y-4 max-w-2xl lg:max-w-5xl mx-auto">
        {/* Status Banner for non-approved drivers */}
        {driver.status !== 'approved' && (
          <div className={`rounded-2xl p-4 ${statusInfo.color}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{statusInfo.label}</p>
                <p className="text-sm mt-1 opacity-80">
                  {driver.status === 'pending'
                    ? 'Your application is under review. We\'ll notify you within 24-48 hours.'
                    : driver.status === 'rejected'
                      ? 'Contact support to reapply or resolve issues.'
                      : 'Contact support for more information.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Online/Offline Toggle */}
        {driver.status === 'approved' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {driver.is_online ? '🟢 Online' : '⚫ Offline'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {driver.is_online
                    ? 'You are visible to customers and can receive jobs'
                    : 'Go online to start receiving job offers'}
                </p>
              </div>
              <button
                onClick={toggleOnline}
                disabled={togglingOnline}
                className={`relative w-16 h-8 rounded-full transition-colors duration-200 ${driver.is_online ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                  } disabled:opacity-60`}
              >
                <Power
                  size={16}
                  className={`absolute top-1 transition-all duration-200 ${driver.is_online ? 'left-9 text-white' : 'left-1 text-slate-500'
                    }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Today's Stats */}
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm text-center">
            <Wallet size={20} className="text-green-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {formatCurrency(todayEarnings)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Today</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm text-center">
            <CheckCircle2 size={20} className="text-blue-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{todayTrips}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Trips</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm text-center">
            <Star size={20} className="text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {driver.rating?.toFixed(1) || '—'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Rating</p>
          </div>
        </div>

        {/* Wallet Card */}
        {driver.status === 'approved' && (
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet size={24} className="text-white" />
                <h3 className="text-lg font-bold text-white">My Wallet</h3>
              </div>
              <button
                onClick={() => setShowWithdrawalModal(true)}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-full transition-colors"
              >
                Request Withdrawal →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-emerald-100 text-sm">Available Balance</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(walletBalance)}</p>
              </div>
              <div>
                <p className="text-emerald-100 text-sm">Total Earned</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalEarned)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Completed Trips Mini Ledger */}
        {driver.status === 'approved' && completedTrips.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Wallet size={16} className="text-green-500" />
                Recent Earnings
              </h3>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {completedTrips.map((trip) => (
                <div key={trip.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {trip.shipments?.origin
                        ? `${trip.shipments.origin} → ${trip.shipments.destination}`
                        : 'Trip completed'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(trip.offered_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short'
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-green-600">
                    +{formatCurrency(trip.estimated_fare)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payout History */}
        {driver.status === 'approved' && payoutHistory.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <DollarSign size={16} className="text-amber-500" />
                {language === 'en' ? 'Payout Requests' : 'भुगतान अनुरोध'}
              </h3>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {payoutHistory.map((payout) => (
                <div key={payout.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {formatCurrency(payout.amount)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(payout.requested_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${payout.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    payout.status === 'approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      payout.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                    {payout.status === 'pending' ? (language === 'en' ? 'Pending' : 'लंबित') :
                      payout.status === 'approved' ? (language === 'en' ? 'Approved' : 'स्वीकृत') :
                        payout.status === 'paid' ? (language === 'en' ? 'Paid' : 'भुगतान किया') :
                          (language === 'en' ? 'Rejected' : 'अस्वीकृत')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Driver Vehicle Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Truck size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                {VEHICLE_LABELS[driver.vehicle_type] || driver.vehicle_type}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                {driver.home_city} • {driver.total_trips} total trips
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusInfo.color
              }`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Active Job Card */}
        {driver.active_job_id && driver.status === 'approved' && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-green-800 dark:text-green-300">Active Job</span>
              <span className="text-xs bg-green-200 dark:bg-green-800/40 text-green-800 dark:text-green-300 px-2 py-0.5 rounded-full">
                In Progress
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm"
                onClick={() => navigate(`/driver/trip/${driver.active_job_id}`)}
              >
                <Navigation size={16} />
                View Trip
              </button>
              <button
                className="flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"
                onClick={() => toast.success('Calling customer support...')}
              >
                <PhoneCall size={16} />
                Support
              </button>
            </div>
          </div>
        )}

        {/* Online Waiting State */}
        {driver.is_online && !driver.active_job_id && driver.status === 'approved' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-5 text-center">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <RefreshCw size={24} className="text-blue-600 dark:text-blue-400 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
            </div>
            <p className="font-semibold text-blue-800 dark:text-blue-300">Looking for jobs...</p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              You'll receive notifications when a job is available near you
            </p>
          </div>
        )}

        {/* Trip History */}
        {tripHistory.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Clock size={16} className="text-slate-400" />
                  Recent Trips
                </h3>
                <span className="text-xs text-slate-400">{tripHistory.length} trips</span>
              </div>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {tripHistory.map((trip) => (
                <div key={trip.id} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${trip.status === 'accepted' ? 'bg-green-500' :
                    trip.status === 'declined' ? 'bg-red-400' : 'bg-slate-300'
                    }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {trip.shipments?.origin
                        ? `${trip.shipments.origin} → ${trip.shipments.destination}`
                        : 'Trip details unavailable'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(trip.offered_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${trip.status === 'accepted'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : trip.status === 'declined'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                      {trip.status}
                    </span>
                    <TrendingUp size={14} className="text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state for new drivers */}
        {driver.status === 'approved' && tripHistory.length === 0 && !driver.is_online && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center shadow-sm">
            <Truck size={40} className="text-slate-200 dark:text-slate-600 mx-auto mb-3" />
            <p className="font-semibold text-slate-600 dark:text-slate-400">No trips yet</p>
            <p className="text-sm text-slate-400 mt-1">Go online to start receiving job offers</p>
          </div>
        )}

        {/* Lifetime Stats */}
        {driver.status === 'approved' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" />
              All-time Stats
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{driver.total_trips}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Trips</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {driver.rating?.toFixed(1) || '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Avg Rating</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
