import { useState, useEffect, useCallback } from 'react'
import {
  Power, Truck, Star, TrendingUp, Clock, MapPin,
  CheckCircle2, XCircle, AlertTriangle,
  Wallet, Navigation, PhoneCall, RefreshCw, UserCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'

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
    origin_address: string
    destination_address: string
    weight_kg: number
    estimated_distance_km: number
  }
}

interface TripHistory {
  id: string
  offered_at: string
  responded_at: string | null
  status: string
  shipments?: {
    origin_address: string
    destination_address: string
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

export default function DriverDashboardPage() {
  const { user } = useAuthStore()
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
    const { data } = await supabase
      .from('job_offers')
      .select('id, offered_at, responded_at, status, shipments(origin_address, destination_address)')
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'declined', 'expired'])
      .order('offered_at', { ascending: false })
      .limit(10)
    setTripHistory((data as unknown as TripHistory[]) || [])

    // Count today's accepted trips
    const today = new Date().toISOString().split('T')[0]
    const rawData = (data || []) as unknown as TripHistory[]
    const todayAccepted = rawData.filter(
      (j: TripHistory) => j.status === 'accepted' && j.offered_at.startsWith(today)
    )
    setTodayTrips(todayAccepted.length)
    setTodayEarnings(todayAccepted.length * 1200) // Placeholder ₹1200 per trip
  }, [])

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
          const job = payload.new as JobOffer
          if (job.status === 'pending') {
            setIncomingJob(job)
            setCountdown(30)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [driver?.id, driver?.status])

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
      {/* Incoming Job Offer Modal */}
      {incomingJob && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-t-3xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">New Job Offer! 🚛</h3>
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                  countdown <= 10 ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
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
                    {incomingJob.shipments?.origin_address || 'Pickup Location'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Drop</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                    {incomingJob.shipments?.destination_address || 'Drop Location'}
                  </p>
                </div>
              </div>
              {incomingJob.shipments?.estimated_distance_km && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <MapPin size={14} />
                  <span>{incomingJob.shipments.estimated_distance_km} km</span>
                  <span className="mx-1">•</span>
                  <Wallet size={14} />
                  <span className="text-green-600 font-semibold">
                    {formatCurrency(incomingJob.shipments.estimated_distance_km * 15)}
                  </span>
                  <span className="text-xs text-slate-400"> est.</span>
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

      <div className="p-4 space-y-4 max-w-md mx-auto">
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
                className={`relative w-16 h-8 rounded-full transition-colors duration-200 ${
                  driver.is_online ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                } disabled:opacity-60`}
              >
                <Power
                  size={16}
                  className={`absolute top-1 transition-all duration-200 ${
                    driver.is_online ? 'left-9 text-white' : 'left-1 text-slate-500'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Today's Stats */}
        <div className="grid grid-cols-3 gap-3">
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
            <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
              statusInfo.color
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
                onClick={() => toast.success('Opening maps...')}
              >
                <Navigation size={16} />
                Navigate
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
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    trip.status === 'accepted' ? 'bg-green-500' :
                    trip.status === 'declined' ? 'bg-red-400' : 'bg-slate-300'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {trip.shipments?.origin_address
                        ? `${trip.shipments.origin_address} → ${trip.shipments.destination_address}`
                        : 'Trip details unavailable'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(trip.offered_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      trip.status === 'accepted'
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
