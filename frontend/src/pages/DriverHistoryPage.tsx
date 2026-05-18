import { useState, useEffect, useCallback } from 'react'
import { Clock, MapPin, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { driverTripsApi } from '../services/supabaseApi'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { formatCurrency } from '../utils/formatters'

interface TripRecord {
  id: string
  offered_at: string
  responded_at: string | null
  status: 'accepted' | 'declined' | 'expired' | 'cancelled' | 'delivered'
  shipments?: {
    origin: string
    destination: string
    estimated_cost: number
    total_weight: number
  }
}

const STATUS_CONFIG = {
  delivered: { label: 'Completed', icon: CheckCircle2, color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
  accepted: { label: 'Accepted', icon: CheckCircle2, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
  declined: { label: 'Declined', icon: XCircle, color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400' },
  expired: { label: 'Expired', icon: AlertCircle, color: 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
}

export default function DriverHistoryPage() {
  const { user } = useAuthStore()
  const [driverId, setDriverId] = useState<string | null>(null)
  const [trips, setTrips] = useState<TripRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'delivered' | 'declined'>('all')

  const fetchDriverId = useCallback(async () => {
    if (!user?.id) return
    try {
      const driverId = await driverTripsApi.getDriverIdByUserId(user.id)
      if (driverId) setDriverId(driverId)
      else setLoading(false)
    } catch (_error) {
      toast.error('Failed to load driver profile')
      setLoading(false)
    }
  }, [user?.id])

  const fetchTrips = useCallback(async (drId: string) => {
    setLoading(true)
    try {
      const data = await driverTripsApi.getHistory(drId, filter)
      setTrips(((data ?? []) as Record<string, unknown>[]).map((trip) => {
        const shipment = Array.isArray(trip.shipments) ? trip.shipments[0] : trip.shipments
        return {
          id: trip.id as string,
          offered_at: trip.offered_at as string,
          responded_at: (trip.responded_at as string | null) ?? null,
          status: trip.status as TripRecord['status'],
          shipments: shipment
            ? {
              origin: (shipment as Record<string, unknown>).origin as string,
              destination: (shipment as Record<string, unknown>).destination as string,
              estimated_cost: Number((shipment as Record<string, unknown>).estimated_cost ?? 0),
              total_weight: Number((shipment as Record<string, unknown>).total_weight ?? 0),
            }
            : undefined,
        }
      }))
    } catch (_error) {
      toast.error('Failed to load trip history')
    }
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
          {(['all', 'delivered', 'declined'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-3 max-w-2xl md:max-w-4xl mx-auto">
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
                            {trip.shipments.origin}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                          <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                            {trip.shipments.destination}
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
                    <div>{trip.shipments.total_weight} kg</div>
                    {trip.shipments.estimated_cost > 0 && (
                      <div className="flex items-center gap-1">
                        <MapPin size={11} />
                        {formatCurrency(trip.shipments.estimated_cost)}
                      </div>
                    )}
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
