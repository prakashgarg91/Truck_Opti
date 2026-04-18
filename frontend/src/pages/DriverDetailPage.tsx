import { useState, useEffect } from 'react'
import {
  ArrowLeft, User, Truck, CreditCard, CheckCircle2,
  XCircle, AlertTriangle, Phone, MapPin, Calendar,
  FileText, RefreshCw, ShieldCheck
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

interface DriverDetail {
  id: string
  user_id: string | null
  full_name: string
  phone: string
  aadhaar_last4: string | null
  pan_number: string | null
  date_of_birth: string | null
  vehicle_type: string
  rc_number: string | null
  license_number: string | null
  vehicle_capacity: number | null
  dl_url: string | null
  rc_url: string | null
  insurance_url: string | null
  selfie_url: string | null
  bank_account: string | null
  ifsc_code: string | null
  upi_id: string | null
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  rejection_reason: string | null
  approved_by: string | null
  approved_at: string | null
  home_city: string | null
  rating: number | null
  total_trips: number | null
  is_online: boolean
  created_at: string
  updated_at: string
}

const VEHICLE_LABELS: Record<string, string> = {
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <p className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</p>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 text-right break-all">
        {value || <span className="text-slate-300 dark:text-slate-600 italic">Not provided</span>}
      </p>
    </div>
  )
}

function DocBadge({ label, url }: { label: string; url: string | null }) {
  return (
    <a
      href={url || undefined}
      target={url ? '_blank' : undefined}
      rel="noopener noreferrer"
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${url
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40'
          : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'
        }`}
    >
      {url ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {label}
      {url && <span className="text-green-500">↗</span>}
    </a>
  )
}

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [driver, setDriver] = useState<DriverDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'admin') {
      toast.error('Admin access required')
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (!id) return
    async function fetch() {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', id)
        .single()
      if (error) {
        toast.error('Driver not found')
        navigate('/admin/drivers', { replace: true })
      } else {
        setDriver(data as DriverDetail)
      }
      setLoading(false)
    }
    fetch()
  }, [id, navigate])

  const handleApprove = async () => {
    if (!driver) return
    setActionLoading(true)
    const { error } = await supabase
      .from('drivers')
      .update({ status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() })
      .eq('id', driver.id)
    if (error) {
      toast.error('Failed to approve driver')
    } else {
      toast.success('Driver approved!')
      setDriver(d => d ? { ...d, status: 'approved' } : d)
    }
    setActionLoading(false)
  }

  const handleReject = async () => {
    if (!driver || !rejectReason.trim()) {
      toast.error('Please enter a rejection reason')
      return
    }
    setActionLoading(true)
    const { error } = await supabase
      .from('drivers')
      .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
      .eq('id', driver.id)
    if (error) {
      toast.error('Failed to reject driver')
    } else {
      toast.success('Driver rejected')
      setDriver(d => d ? { ...d, status: 'rejected', rejection_reason: rejectReason.trim() } : d)
      setShowRejectForm(false)
    }
    setActionLoading(false)
  }

  const handleSuspend = async () => {
    if (!driver) return
    setActionLoading(true)
    const { error } = await supabase
      .from('drivers')
      .update({ status: 'suspended' })
      .eq('id', driver.id)
    if (error) {
      toast.error('Failed to suspend driver')
    } else {
      toast.success('Driver suspended')
      setDriver(d => d ? { ...d, status: 'suspended' } : d)
    }
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw size={28} className="animate-spin text-blue-600" />
      </div>
    )
  }

  if (!driver) return null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/admin/drivers')} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-800 dark:text-slate-100 truncate">{driver.full_name}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Driver Details</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${STATUS_COLORS[driver.status]}`}>
          {driver.status}
        </span>
      </div>

      <div className="p-4 space-y-4 max-w-md mx-auto">
        {/* Hero Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              {driver.selfie_url ? (
                <img src={driver.selfie_url} alt={driver.full_name} className="w-14 h-14 rounded-2xl object-cover" />
              ) : (
                <User size={28} className="text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{driver.full_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Phone size={12} className="text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-400">{driver.phone}</span>
              </div>
              {driver.home_city && (
                <div className="flex items-center gap-2 mt-0.5">
                  <MapPin size={12} className="text-slate-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">{driver.home_city}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{driver.total_trips || 0}</p>
              <p className="text-xs text-slate-400">Trips</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{driver.rating?.toFixed(1) || '—'}</p>
              <p className="text-xs text-slate-400">Rating</p>
            </div>
            <div className="text-center">
              <p className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${driver.is_online ? 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' : 'text-slate-400 bg-slate-100 dark:bg-slate-700'}`}>
                {driver.is_online ? '🟢 Online' : '⚫ Offline'}
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {driver.status === 'pending' && (
          <div className="space-y-2">
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 text-white font-semibold disabled:opacity-60"
            >
              <CheckCircle2 size={18} />
              Approve Driver
            </button>
            {!showRejectForm ? (
              <button
                onClick={() => setShowRejectForm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold"
              >
                <XCircle size={18} />
                Reject Driver
              </button>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Rejection Reason</p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="e.g. License number is invalid..."
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowRejectForm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm">Cancel</button>
                  <button onClick={handleReject} disabled={actionLoading} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60">Confirm Reject</button>
                </div>
              </div>
            )}
          </div>
        )}

        {driver.status === 'approved' && (
          <button
            onClick={handleSuspend}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-600 text-white font-semibold disabled:opacity-60"
          >
            <AlertTriangle size={18} />
            Suspend Driver
          </button>
        )}

        {driver.status === 'suspended' && (
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 text-white font-semibold disabled:opacity-60"
          >
            <CheckCircle2 size={18} />
            Reinstate Driver
          </button>
        )}

        {driver.rejection_reason && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-2xl p-4">
            <p className="text-xs text-red-500 font-medium uppercase mb-1">Rejection Reason</p>
            <p className="text-sm text-red-700 dark:text-red-300">{driver.rejection_reason}</p>
          </div>
        )}

        {/* Personal Info */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <User size={16} className="text-blue-500" />
            Personal Information
          </h3>
          <InfoRow label="Full Name" value={driver.full_name} />
          <InfoRow label="Phone" value={driver.phone} />
          <InfoRow label="Aadhaar (last 4)" value={driver.aadhaar_last4 ? `****${driver.aadhaar_last4}` : null} />
          <InfoRow label="PAN" value={driver.pan_number} />
          <InfoRow label="Date of Birth" value={driver.date_of_birth ? new Date(driver.date_of_birth).toLocaleDateString('en-IN') : null} />
          <InfoRow label="Home City" value={driver.home_city} />
          <InfoRow label="Registered" value={<><Calendar size={12} className="inline mr-1" />{new Date(driver.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</>} />
        </div>

        {/* Vehicle Info */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <Truck size={16} className="text-blue-500" />
            Vehicle Information
          </h3>
          <InfoRow label="Vehicle Type" value={VEHICLE_LABELS[driver.vehicle_type] || driver.vehicle_type} />
          <InfoRow label="Capacity" value={driver.vehicle_capacity ? `${driver.vehicle_capacity} tonnes` : null} />
          <InfoRow label="RC Number" value={driver.rc_number} />
          <InfoRow label="License Number" value={driver.license_number} />
        </div>

        {/* Documents */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <FileText size={16} className="text-blue-500" />
            Documents
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <DocBadge label="Driving License" url={driver.dl_url} />
            <DocBadge label="RC Book" url={driver.rc_url} />
            <DocBadge label="Insurance" url={driver.insurance_url} />
            <DocBadge label="Selfie" url={driver.selfie_url} />
          </div>
          {!(driver.dl_url || driver.rc_url || driver.insurance_url) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Driver has not uploaded documents yet
            </p>
          )}
        </div>

        {/* Bank Info */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-blue-500" />
            Payment Details
          </h3>
          <InfoRow label="Bank Account" value={driver.bank_account} />
          <InfoRow label="IFSC Code" value={driver.ifsc_code} />
          <InfoRow label="UPI ID" value={driver.upi_id} />
        </div>

        {/* Admin info */}
        {driver.approved_at && (
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-purple-500" />
              Admin Actions
            </h3>
            <InfoRow label="Status" value={<span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[driver.status]}`}>{driver.status}</span>} />
            <InfoRow label="Approved At" value={driver.approved_at ? new Date(driver.approved_at).toLocaleDateString('en-IN') : null} />
          </div>
        )}
      </div>
    </div>
  )
}
