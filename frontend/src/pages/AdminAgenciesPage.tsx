import { useState, useEffect, useCallback } from 'react'
import {
  Building2, CheckCircle2, XCircle, Clock, Search,
  Phone, MapPin, Briefcase, AlertTriangle, RefreshCw,
  ShieldCheck, Users
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import toast from 'react-hot-toast'

interface Agency {
  id: string
  company_name: string
  gstin: string | null
  transport_license: string
  contact_name: string | null
  contact_phone: string | null
  city: string | null
  state: string | null
  fleet_size: number | null
  operating_routes: string | null
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  rating: number | null
  total_jobs: number | null
  created_at: string
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

export default function AdminAgenciesPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { language } = useLanguageStore()
  const [tab, setTab] = useState<Tab>('pending')
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [rejectModal, setRejectModal] = useState<{ agencyId: string; name: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<Tab, number>>({ pending: 0, approved: 0, rejected: 0, suspended: 0 })

  useEffect(() => {
    if (user && user.role !== 'admin') {
      toast.error(language === 'en' ? 'Admin access required' : 'एडमिन एक्सेस आवश्यक है')
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  const fetchAgencies = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transport_agencies')
      .select('*')
      .eq('status', tab)
      .order('created_at', { ascending: false })
    if (error) {
      toast.error('Failed to load agencies')
    } else {
      setAgencies((data as Agency[]) || [])
    }
    setLoading(false)
  }, [tab])

  const fetchCounts = useCallback(async () => {
    const tabs: Tab[] = ['pending', 'approved', 'rejected', 'suspended']
    const results = await Promise.all(
      tabs.map(t =>
        supabase.from('transport_agencies').select('id', { count: 'exact', head: true }).eq('status', t)
      )
    )
    const newCounts = {} as Record<Tab, number>
    tabs.forEach((t, i) => { newCounts[t] = results[i].count || 0 })
    setCounts(newCounts)
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAgencies()
      fetchCounts()
    }
  }, [fetchAgencies, fetchCounts, user?.role])

  const handleApprove = async (agencyId: string) => {
    setActionLoading(agencyId)
    const { error } = await supabase
      .from('transport_agencies')
      .update({ status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() })
      .eq('id', agencyId)
    if (error) {
      toast.error(language === 'en' ? 'Failed to approve agency' : 'एजेंसी को स्वीकृत करने में विफल')
    } else {
      toast.success(language === 'en' ? 'Agency approved successfully' : 'एजेंसी सफलतापूर्वक स्वीकृत')
      fetchAgencies()
      fetchCounts()
    }
    setActionLoading(null)
  }

  const handleReject = async () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) { toast.error(language === 'en' ? 'Please enter a rejection reason' : 'कृपया अस्वीकृति का कारण दर्ज करें'); return }
    setActionLoading(rejectModal.agencyId)
    const { error } = await supabase
      .from('transport_agencies')
      .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
      .eq('id', rejectModal.agencyId)
    if (error) {
      toast.error(language === 'en' ? 'Failed to reject agency' : 'एजेंसी को अस्वीकृत करने में विफल')
    } else {
      toast.success(language === 'en' ? 'Agency rejected' : 'एजेंसी अस्वीकृत')
      setRejectModal(null)
      setRejectReason('')
      fetchAgencies()
      fetchCounts()
    }
    setActionLoading(null)
  }

  const handleSuspend = async (agencyId: string) => {
    setActionLoading(agencyId)
    const { error } = await supabase
      .from('transport_agencies')
      .update({ status: 'suspended' })
      .eq('id', agencyId)
    if (error) {
      toast.error(language === 'en' ? 'Failed to suspend agency' : 'एजेंसी को निलंबित करने में विफल')
    } else {
      toast.success(language === 'en' ? 'Agency suspended' : 'एजेंसी निलंबित')
      fetchAgencies()
      fetchCounts()
    }
    setActionLoading(null)
  }

  const filtered = agencies.filter(a =>
    search.trim() === '' ||
    a.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.contact_phone?.includes(search)) ||
    (a.city?.toLowerCase().includes(search.toLowerCase()))
  )

  const tabs: Tab[] = ['pending', 'approved', 'rejected', 'suspended']

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Reject Agency</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Rejecting <strong>{rejectModal.name}</strong>. Provide a reason:
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
              placeholder="e.g. Invalid transport license number"
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!!actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-20">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-800 dark:text-slate-100">Agency Approvals</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Manage transport agency registrations</p>
          </div>
          <button onClick={() => { fetchAgencies(); fetchCounts() }} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
            <RefreshCw size={16} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-2">
          {tabs.map(t => {
            const Icon = TAB_ICONS[t]
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                  tab === t
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                {t}
                {counts[t] > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[t]}`}>
                    {counts[t]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/50 rounded-xl px-3 py-2">
            <Search size={16} className="text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by company, phone, city..."
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users size={40} className="text-slate-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">No {tab} agencies</p>
          </div>
        ) : (
          filtered.map(agency => (
            <div key={agency.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 size={16} className="text-indigo-500 flex-shrink-0" />
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{agency.company_name}</p>
                  </div>
                  {agency.contact_name && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate ml-6">{agency.contact_name}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[tab]}`}>
                  {tab}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                {agency.contact_phone && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Phone size={12} className="flex-shrink-0" />
                    <span className="truncate">{agency.contact_phone}</span>
                  </div>
                )}
                {(agency.city || agency.state) && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin size={12} className="flex-shrink-0" />
                    <span className="truncate">{[agency.city, agency.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {agency.transport_license && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Briefcase size={12} className="flex-shrink-0" />
                    <span className="truncate font-mono">{agency.transport_license}</span>
                  </div>
                )}
                {agency.fleet_size != null && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ShieldCheck size={12} className="flex-shrink-0" />
                    <span>{agency.fleet_size} vehicles</span>
                  </div>
                )}
              </div>

              {agency.gstin && (
                <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl px-3 py-2 mb-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">GSTIN</p>
                  <p className="text-sm font-mono text-slate-700 dark:text-slate-300">{agency.gstin}</p>
                </div>
              )}

              {agency.rejection_reason && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 mb-3">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">Rejection reason:</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{agency.rejection_reason}</p>
                </div>
              )}

              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Registered: {formatDate(agency.created_at)}
                {agency.approved_at && ` • Approved: ${formatDate(agency.approved_at)}`}
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {tab === 'pending' && (
                  <>
                    <button
                      onClick={() => handleApprove(agency.id)}
                      disabled={actionLoading === agency.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} />
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectModal({ agencyId: agency.id, name: agency.company_name })}
                      disabled={actionLoading === agency.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold disabled:opacity-60"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </>
                )}
                {tab === 'approved' && (
                  <button
                    onClick={() => handleSuspend(agency.id)}
                    disabled={actionLoading === agency.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold disabled:opacity-60"
                  >
                    <AlertTriangle size={14} />
                    Suspend
                  </button>
                )}
                {tab === 'suspended' && (
                  <button
                    onClick={() => handleApprove(agency.id)}
                    disabled={actionLoading === agency.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
                  >
                    <CheckCircle2 size={14} />
                    Reinstate
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
