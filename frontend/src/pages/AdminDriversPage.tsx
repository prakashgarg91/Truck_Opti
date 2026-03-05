import { useState, useEffect, useCallback } from 'react'
import {
  Users, CheckCircle2, XCircle, Clock, Search,
  Phone, Truck, Calendar, AlertTriangle, RefreshCw, ShieldCheck
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

interface Driver {
  id: string
  full_name: string
  phone: string
  vehicle_type: string
  home_city: string
  rc_number: string | null
  license_number: string | null
  aadhaar_last4: string | null
  bank_account: string | null
  ifsc_code: string | null
  upi_id: string | null
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  rating: number | null
  total_trips: number | null
  created_at: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
}

type Tab = 'pending' | 'approved' | 'rejected' | 'suspended'

const STATUS_COLORS: Record<Tab, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
}

const TAB_ICONS: Record<Tab, React.ElementType> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  suspended: AlertTriangle,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function vehicleLabel(type: string) {
  const map: Record<string, string> = {
    tata_407: 'Tata 407 (1T)', eicher_14ft: 'Eicher 14ft (3T)', eicher_17ft: 'Eicher 17ft (5T)',
    ashok_19ft: 'Ashok Leyland 19ft (7T)', bharatbenz_24ft: 'BharatBenz 24ft (10T)', bharatbenz_32ft: 'BharatBenz 32ft (15T)',
  }
  return map[type] ?? type
}

export default function AdminDriversPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('pending')
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [rejectModal, setRejectModal] = useState<{ driverId: string; name: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Redirect non-admins
  useEffect(() => {
    const role = user?.role
    if (user && role !== 'admin') {
      toast.error('Admin access required')
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  const fetchDrivers = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('status', tab)
        .order('created_at', { ascending: false })
      if (error) throw error
      setDrivers(data ?? [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load drivers'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { fetchDrivers() }, [fetchDrivers])

  const handleApprove = async (driverId: string, driverName: string) => {
    setActionLoading(driverId)
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', driverId)
      if (error) throw error
      toast.success(`${driverName} approved!`)
      setDrivers(prev => prev.filter(d => d.id !== driverId))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectConfirm = async () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) { toast.error('Enter a reason for rejection'); return }
    setActionLoading(rejectModal.driverId)
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
        .eq('id', rejectModal.driverId)
      if (error) throw error
      toast.success(`${rejectModal.name} rejected`)
      setDrivers(prev => prev.filter(d => d.id !== rejectModal!.driverId))
      setRejectModal(null)
      setRejectReason('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Rejection failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSuspend = async (driverId: string, driverName: string) => {
    setActionLoading(driverId)
    try {
      const { error } = await supabase.from('drivers').update({ status: 'suspended' }).eq('id', driverId)
      if (error) throw error
      toast.success(`${driverName} suspended`)
      setDrivers(prev => prev.filter(d => d.id !== driverId))
    } catch {
      toast.error('Failed to suspend')
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = drivers.filter(d =>
    !search || d.full_name.toLowerCase().includes(search.toLowerCase()) ||
    d.phone.includes(search) || (d.home_city ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const tabs: Tab[] = ['pending', 'approved', 'rejected', 'suspended']

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary-500" /> Driver Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">Approve or reject driver registrations</p>
        </div>
        <button onClick={fetchDrivers} disabled={loading}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = TAB_ICONS[t]
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-colors ${
                tab === t
                  ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}>
              <Icon className="w-4 h-4" />
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, city..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No {tab} drivers</p>
          <p className="text-xs text-slate-400 mt-1">
            {tab === 'pending' ? 'New applications will appear here' : `No drivers with ${tab} status`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(driver => (
            <div key={driver.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4">
              <div className="flex items-start justify-between gap-3">
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-primary-700 dark:text-primary-400 text-base">
                    {driver.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white">{driver.full_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[driver.status]}`}>
                      {driver.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {driver.phone}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Truck className="w-3 h-3" /> {vehicleLabel(driver.vehicle_type)}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {formatDate(driver.created_at)}
                    </span>
                  </div>
                  {driver.home_city && (
                    <p className="text-xs text-slate-400 mt-0.5">📍 {driver.home_city}</p>
                  )}
                  {driver.rc_number && (
                    <p className="text-xs text-slate-400">RC: {driver.rc_number}</p>
                  )}
                  {driver.rejection_reason && (
                    <p className="text-xs text-red-500 mt-1 italic">Reason: {driver.rejection_reason}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              {(tab === 'pending' || tab === 'approved') && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  {tab === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(driver.id, driver.full_name)}
                        disabled={actionLoading === driver.id}
                        className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                        {actionLoading === driver.id
                          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <><CheckCircle2 className="w-4 h-4" /> Approve</>
                        }
                      </button>
                      <button
                        onClick={() => { setRejectModal({ driverId: driver.id, name: driver.full_name }); setRejectReason('') }}
                        disabled={actionLoading === driver.id}
                        className="flex-1 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </>
                  )}
                  {tab === 'approved' && (
                    <button
                      onClick={() => handleSuspend(driver.id, driver.full_name)}
                      disabled={actionLoading === driver.id}
                      className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Suspend
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Reject Application</h3>
            <p className="text-sm text-slate-500 mb-4">Provide a reason for rejecting <strong>{rejectModal.name}</strong></p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Invalid documents, duplicate application..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-red-400 outline-none text-sm resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectModal(null)}
                className="flex-1 py-3 border border-slate-200 dark:border-slate-600 rounded-2xl font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleRejectConfirm} disabled={!!actionLoading}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {actionLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><XCircle className="w-4 h-4" /> Reject</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
