import { useState, useEffect, useCallback } from 'react'
import {
  Briefcase, CheckCircle2, XCircle,
  RefreshCw, AlertTriangle, MapPin, Truck
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

type JobFilter = 'all' | 'active' | 'pending' | 'completed' | 'cancelled'

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
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  active:    { label: 'Active',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'Done',      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

export default function AgencyJobsPage() {
  const { user } = useAuthStore()
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<AgencyJob[]>([])
  const [filter, setFilter] = useState<JobFilter>('all')
  const [loading, setLoading] = useState(true)

  const fetchAgency = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('transport_agencies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    setAgencyId(data?.id || null)
    setLoading(false)
    // In Phase 3, we'd then fetch agency_jobs where agency_id = data.id
    // For now jobs list is empty (placeholder)
    setJobs([])
  }, [user?.id])

  useEffect(() => { fetchAgency() }, [fetchAgency])

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

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Jobs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{filteredJobs.length} jobs shown</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'active', 'pending', 'completed', 'cancelled'] as JobFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
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

            {job.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => toast('Accept job flow coming soon', { icon: 'ℹ️' })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-xs font-semibold"
                >
                  <CheckCircle2 size={14} />
                  Accept
                </button>
                <button
                  onClick={() => toast('Decline job flow coming soon', { icon: 'ℹ️' })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold"
                >
                  <XCircle size={14} />
                  Decline
                </button>
              </div>
            )}

            {job.status === 'active' && (
              <button
                onClick={() => toast('Track job flow coming soon', { icon: 'ℹ️' })}
                className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"
              >
                <MapPin size={14} />
                Track Live
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
