import { useState, useEffect, useCallback } from 'react'
import { Clock, MapPin, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

interface TripRecord {
  id: string
  offered_at: string
  responded_at: string | null
  status: 'accepted' | 'declined' | 'expired' | 'cancelled'
  shipments?: {
    origin_address: string
    destination_address: string
    estimated_distance_km: number
    weight_kg: number
  }
}

const STATUS_CONFIG = {
  accepted: { label: 'Completed', icon: CheckCircle2, color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
  declined: { label: 'Declined', icon: XCircle, color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' },
  expired: { label: 'Expired', icon: AlertCircle, color: 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
}

export default function DriverHistoryPage() {
  const { user } = useAuthStore()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [trips, setTrips] = useState<TripRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'accepted' | 'declined'>('all')

  const fetchDriverId = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('drivers').select('id').eq('user_id', user.id).maybeSingle()
    if (data?.id) setDriverId(data.id)
    else setLoading(false)
  }, [user?.id])

  const fetchTrips = useCallback(async (drId: string) => {
    setLoading(true)
    let query = supabase
      .from('job_offers')
      .select('id, offered_at, responded_at, status, shipments(origin_address, destination_address, estimated_distance_km, weight_kg)')
      .eq('driver_id', drId)
      .in('status', ['accepted', 'declined', 'expired', 'cancelled'])
      .order('offered_at', { ascending: false })
      .limit(50)

    if (filter !== 'all') {
      query = (query as typeof query).eq('status', filter)
    }

    const { data, error } = await query
    if (error) toast.error('Failed to load trip history')
    setTrips((data as unknown as TripRecord[]) || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchDriverId() }, [fetchDriverId])
  useEffect(() => { if (driverId) fetchTrips(driverId) }, [driverId, fetchTrips])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Clock size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 dark:text-slate-100">Trip History</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your past job offers</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 px-4 pb-3">
          {(['all', 'accepted', 'declined'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-md mx-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
          </div>
        ) : trips.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center shadow-sm">
            <Clock size={36} className="text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">No trips found</p>
          </div>
        ) : (
          trips.map(trip => {
            const cfg = STATUS_CONFIG[trip.status] || STATUS_CONFIG.expired
            const Icon = cfg.icon
            return (
              <div key={trip.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {trip.shipments ? (
                      <>
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                          <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                            {trip.shipments.origin_address}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                          <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                            {trip.shipments.destination_address}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic">Trip details unavailable</p>
                    )}
                  </div>
                  <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${cfg.color}`}>
                    <Icon size={11} />
                    {cfg.label}
                  </span>
                </div>

                {trip.shipments && (
                  <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mb-2">
                    <div className="flex items-center gap-1">
                      <MapPin size={11} />
                      {trip.shipments.estimated_distance_km} km
                    </div>
                    <div>{trip.shipments.weight_kg} kg</div>
                  </div>
                )}

                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {new Date(trip.offered_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
