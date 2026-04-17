import { useState, useEffect, useCallback } from 'react'
import {
  Briefcase, CheckCircle2, XCircle,
  RefreshCw, AlertTriangle, MapPin, Truck, UserPlus, X, UserCheck
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import MapViewWrapper, { MapMarker, MapRoute } from '../components/MapViewWrapper'
import { logger } from '../utils/logger'

type JobFilter = 'all' | 'in_transit' | 'pending' | 'accepted' | 'delivered' | 'cancelled'

interface AgencyJob {
  id: string
  shipment_id: string
  status: string
  origin: string
  destination: string
  vehicle_type: string
  offered_at: string
  completed_at: string | null
  weight_kg: number
  estimated_fare: number
  shipment_ref?: string
  driver_id?: string
  driver_name?: string
  driver_phone?: string
}

interface AvailableDriver {
  id: string
  truck_id: string
  vehicle_type: string
  rc_number: string
  driver_name: string
  driver_phone: string
  rating: number
}

interface DriverLocation {
  lat: number
  lng: number
  updated_at: string
  speed_kmh: number | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  accepted: { label: 'Accepted', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

export default function AgencyJobsPage() {
  const { user } = useAuthStore()
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<AgencyJob[]>([])
  const [filter, setFilter] = useState<JobFilter>('all')
  const [loading, setLoading] = useState(true)

  // Assign Driver Modal State
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedJob, setSelectedJob] = useState<AgencyJob | null>(null)
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>([])
  const [assigning, setAssigning] = useState(false)

  // Track Live Modal State
  const [showTrackModal, setShowTrackModal] = useState(false)
  const [trackingJob, setTrackingJob] = useState<AgencyJob | null>(null)
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null)

  const fetchAgency = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('transport_agencies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    setAgencyId(data?.id || null)

    if (data?.id) {
      const { data: jobData } = await supabase
        .from('agency_jobs')
        .select(`
          id,
          shipment_id,
          status,
          fare,
          driver_id,
          created_at,
          updated_at,
          shipments (
            shipment_id,
            origin,
            destination,
            total_weight,
            estimated_cost,
            vehicle_type
          ),
          drivers!agency_jobs_driver_id_fkey (
            id,
            full_name,
            phone
          )
        `)
        .eq('agency_id', data.id)
        .order('created_at', { ascending: false })

      const mapped: AgencyJob[] = (jobData ?? []).map((j: Record<string, unknown>) => {
        const s = (Array.isArray(j.shipments) ? j.shipments[0] : j.shipments) as Record<string, unknown> | null
        const d = Array.isArray(j.drivers) ? j.drivers[0] : j.drivers as { id?: string; full_name?: string; phone?: string } | null
        return {
          id: j.id as string,
          shipment_id: j.shipment_id as string,
          shipment_ref: s?.shipment_id as string ?? '',
          status: j.status as string,
          origin: s?.origin as string ?? '—',
          destination: s?.destination as string ?? '—',
          vehicle_type: (s?.vehicle_type as string) ?? '—',
          offered_at: j.created_at as string,
          completed_at: j.status === 'delivered' ? (j.updated_at as string) : null,
          weight_kg: Number(s?.total_weight ?? 0),
          estimated_fare: Number(j.fare ?? s?.estimated_cost ?? 0),
          driver_id: j.driver_id as string | undefined,
          driver_name: d?.full_name ?? undefined,
          driver_phone: d?.phone ?? undefined,
        }
      })
      setJobs(mapped)
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => { fetchAgency() }, [fetchAgency])

  // Fetch available drivers when modal opens
  const fetchAvailableDrivers = async () => {
    if (!agencyId) return

    const { data: trucksData, error } = await supabase
      .from('agency_trucks')
      .select(`
        id,
        vehicle_type,
        rc_number,
        driver_id,
        drivers!agency_trucks_driver_id_fkey (
          id,
          full_name,
          phone,
          rating
        )
      `)
      .eq('agency_id', agencyId)
      .not('driver_id', 'is', null)
      .eq('is_available', true)

    if (error) {
      toast.error('Failed to load drivers')
      return
    }

    const drivers: AvailableDriver[] = (trucksData ?? []).map(t => {
      const driver = Array.isArray(t.drivers) ? t.drivers[0] : t.drivers as { id?: string; full_name?: string; phone?: string; rating?: number } | null
      return {
        id: driver?.id ?? '',
        truck_id: t.id,
        vehicle_type: t.vehicle_type ?? '',
        rc_number: t.rc_number ?? '',
        driver_name: driver?.full_name ?? 'Unknown',
        driver_phone: driver?.phone ?? '',
        rating: driver?.rating ?? 0,
      }
    }).filter(d => d.id)

    setAvailableDrivers(drivers)
  }

  const openAssignModal = async (job: AgencyJob) => {
    setSelectedJob(job)
    setShowAssignModal(true)
    await fetchAvailableDrivers()
  }

  const handleAssignDriver = async (driver: AvailableDriver) => {
    if (!selectedJob || !agencyId) return
    setAssigning(true)

    try {
      const pickupOTP = Math.floor(1000 + Math.random() * 9000).toString()
      const deliveryOTP = Math.floor(1000 + Math.random() * 9000).toString()
      const expiresAt = new Date(Date.now() + 30 * 1000).toISOString()

      // 1. Update agency_jobs with selected driver
      const { error: updateError } = await supabase
        .from('agency_jobs')
        .update({ driver_id: driver.id, truck_id: driver.truck_id })
        .eq('id', selectedJob.id)

      if (updateError) throw updateError

      // 2. Mark truck as not available
      const { error: truckError } = await supabase
        .from('agency_trucks')
        .update({ is_available: false })
        .eq('id', driver.truck_id)

      if (truckError) {
        await supabase
          .from('agency_jobs')
          .update({ driver_id: null, truck_id: null })
          .eq('id', selectedJob.id)
        throw truckError
      }

      // 3. Check if job_offer already exists
      const { data: existing } = await supabase
        .from('job_offers')
        .select('id')
        .eq('shipment_id', selectedJob.shipment_id)
        .eq('driver_id', driver.id)
        .maybeSingle()

      // 4. Insert job_offer if not exists
      if (!existing) {
        const { error: offerError } = await supabase.from('job_offers').insert({
          shipment_id: selectedJob.shipment_id,
          driver_id: driver.id,
          status: 'pending',
          expires_at: expiresAt,
          pickup_otp: pickupOTP,
          delivery_otp: deliveryOTP,
        })

        if (offerError) {
          await supabase
            .from('agency_trucks')
            .update({ is_available: true })
            .eq('id', driver.truck_id)
          await supabase
            .from('agency_jobs')
            .update({ driver_id: null, truck_id: null })
            .eq('id', selectedJob.id)
          throw offerError
        }
      }

      toast.success(`Driver ${driver.driver_name} assigned!`)
      setShowAssignModal(false)
      setSelectedJob(null)
      fetchAgency()
    } catch (err) {
      logger.error('Assign error:', err)
      toast.error('Failed to assign driver')
    } finally {
      setAssigning(false)
    }
  }

  const handleAccept = async (job: AgencyJob) => {
    const { error } = await supabase
      .from('agency_jobs')
      .update({ status: 'accepted', assigned_at: new Date().toISOString() })
      .eq('id', job.id)
    if (error) { toast.error('Failed to accept job'); return }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'accepted' } : j))
    toast.success('Job accepted!')
  }

  const handleDecline = async (job: AgencyJob) => {
    const { error } = await supabase
      .from('agency_jobs')
      .update({ status: 'cancelled' })
      .eq('id', job.id)
    if (error) { toast.error('Failed to decline job'); return }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'cancelled' } : j))
    toast.success('Job declined')
  }

  const confirmDelivery = async (job: AgencyJob) => {
    const { error } = await supabase
      .from('agency_jobs')
      .update({ status: 'delivered', updated_at: new Date().toISOString() })
      .eq('id', job.id)
    if (error) { toast.error('Failed to confirm delivery'); return }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'delivered' } : j))
    toast.success('Job marked as delivered')
  }

  // Track Live functions
  const openTrackModal = async (job: AgencyJob) => {
    setTrackingJob(job)
    setShowTrackModal(true)

    // Fetch initial location
    if (job.driver_id) {
      const { data: loc } = await supabase
        .from('driver_locations')
        .select('lat, lng, updated_at, speed_kmh')
        .eq('driver_id', job.driver_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setDriverLocation(loc)
    }
  }

  // Subscribe to real-time location updates
  useEffect(() => {
    if (!showTrackModal || !trackingJob?.driver_id) return

    const channel = supabase.channel(`driver-loc-${trackingJob.driver_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'driver_locations',
        filter: `driver_id=eq.${trackingJob.driver_id}`
      }, (payload) => {
        if (payload.new) {
          const newLoc = payload.new as DriverLocation
          setDriverLocation(newLoc)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [showTrackModal, trackingJob?.driver_id])

  const filteredJobs = filter === 'all'
    ? jobs
    : jobs.filter(j => j.status === filter)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    )
  }

  if (!agencyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle size={48} className="text-amber-400 mb-4" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          No agency profile found. Please register your agency first.
        </p>
      </div>
    )
  }

  // Build markers and routes for tracking map
  const trackingMarkers: MapMarker[] = driverLocation ? [
    {
      id: 'driver',
      position: [driverLocation.lat, driverLocation.lng],
      label: '🚚',
      type: 'truck'
    }
  ] : []

  const trackingRoutes: MapRoute[] = []

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Jobs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{filteredJobs.length} jobs shown</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'pending', 'accepted', 'in_transit', 'delivered', 'cancelled'] as JobFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === f
              ? 'bg-indigo-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
          >
            {f === 'in_transit' ? 'In Transit' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1 opacity-70">
                ({jobs.filter(j => j.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 && (
        <div className="text-center py-16">
          <Briefcase size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No jobs found</p>
          <p className="text-slate-400 text-xs mt-1">
            Jobs will appear here once you start receiving bookings.
          </p>
        </div>
      )}

      {filteredJobs.map(job => {
        const statusConf = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending

        return (
          <div key={job.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Truck size={16} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    #{job.shipment_id.slice(-8)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(job.offered_at).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusConf.color}`}>
                {statusConf.label}
              </span>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{job.origin}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{job.destination}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Truck size={10} />
                {job.vehicle_type}
              </span>
              <span>•</span>
              <span>{job.weight_kg} kg</span>
              {job.estimated_fare > 0 && (
                <>
                  <span>•</span>
                  <span className="text-green-600 font-semibold">₹{job.estimated_fare.toLocaleString('en-IN')}</span>
                </>
              )}
            </div>

            {/* Pending Actions */}
            {job.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleAccept(job)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-xs font-semibold"
                >
                  <CheckCircle2 size={14} />
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(job)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold"
                >
                  <XCircle size={14} />
                  Decline
                </button>
              </div>
            )}

            {/* Accepted Actions - Assign Driver */}
            {job.status === 'accepted' && !job.driver_id && (
              <button
                onClick={() => openAssignModal(job)}
                className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
              >
                <UserPlus size={14} />
                Assign Driver
              </button>
            )}

            {/* Accepted with driver assigned - show driver name */}
            {job.status === 'accepted' && job.driver_id && (
              <div className="mt-3 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-xs flex items-center gap-2">
                <UserCheck size={14} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-indigo-600 dark:text-indigo-400">
                  Assigned: {job.driver_name || 'Driver assigned'}
                </span>
              </div>
            )}

            {/* In Transit Actions - Track Live + Confirm Delivery */}
            {job.status === 'in_transit' && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => openTrackModal(job)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"
                >
                  <MapPin size={14} />
                  Track Live
                </button>
                <button
                  onClick={() => confirmDelivery(job)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold"
                >
                  <CheckCircle2 size={14} />
                  Confirm Delivery
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Assign Driver Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white dark:bg-slate-800 rounded-t-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Assign Driver</h2>
              <button
                onClick={() => { setShowAssignModal(false); setSelectedJob(null) }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {availableDrivers.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  No available drivers. Add drivers to your trucks first.
                </p>
              ) : (
                <div className="space-y-3">
                  {availableDrivers.map(driver => (
                    <button
                      key={driver.id}
                      onClick={() => handleAssignDriver(driver)}
                      disabled={assigning}
                      className="w-full p-4 text-left bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{driver.driver_name}</p>
                          <p className="text-xs text-slate-500">{driver.vehicle_type} • {driver.rc_number}</p>
                        </div>
                        {driver.rating > 0 && (
                          <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded-full">
                            ⭐ {driver.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Track Live Modal */}
      {showTrackModal && trackingJob && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white dark:bg-slate-800 rounded-t-3xl w-full max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Live Tracking</h2>
                <p className="text-xs text-slate-500">
                  {trackingJob.origin} → {trackingJob.destination}
                </p>
              </div>
              <button
                onClick={() => { setShowTrackModal(false); setTrackingJob(null) }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>

            {/* Driver Info */}
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {trackingJob.driver_name || 'Driver'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {trackingJob.driver_phone || 'Phone not available'}
                  </p>
                </div>
                {driverLocation && (
                  <div className="text-right">
                    <p className="text-xs text-green-600 font-medium">● Live</p>
                    <p className="text-xs text-slate-400">
                      Updated: {new Date(driverLocation.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Map */}
            <div className="h-[50vh] bg-slate-100 dark:bg-slate-900">
              {driverLocation ? (
                <MapViewWrapper
                  markers={trackingMarkers}
                  routes={trackingRoutes}
                  center={[driverLocation.lat, driverLocation.lng]}
                  zoom={14}
                  height="100%"
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-slate-500">
                      Waiting for driver location...
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Driver hasn't started sharing location yet
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
