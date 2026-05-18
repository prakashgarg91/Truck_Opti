import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BadgePercent,
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { agencyDashboardApi, type AgencyPortalProfile, type AgencyPortalSummary } from '../services/agencyPortalApi'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/formatters'
import { logger } from '../utils/logger'

const STATUS_STYLES: Record<AgencyPortalProfile['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  suspended: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle: string
  icon: typeof Truck
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

export default function AgencyProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [agency, setAgency] = useState<AgencyPortalProfile | null>(null)
  const [summary, setSummary] = useState<AgencyPortalSummary>({
    active: 0,
    today: 0,
    pending: 0,
    thirtyDayRevenue: 0,
    thirtyDayJobs: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Agency Profile - TruckOpti'
  }, [])

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)
      try {
        const snapshot = await agencyDashboardApi.getSnapshot()
        setAgency(snapshot.agency)
        setSummary(snapshot.summary)
      } catch (error) {
        logger.error('[AgencyProfilePage] loadProfile', error)
        toast.error('Failed to load agency profile')
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()
  }, [])

  const completionFields = [
    agency?.company_name,
    agency?.city,
    agency?.gstin,
    agency?.fleet_size?.toString(),
    user?.email,
  ]
  const completion = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100)

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (!agency) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <div className="rounded-[2rem] border border-amber-200 bg-white p-8 shadow-sm dark:border-amber-900/40 dark:bg-slate-800">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Agency profile not found</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                This route now has dedicated agency ownership. Your account does not have a linked transport agency record yet.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/agency/dashboard')}
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  Back To Agency Dashboard
                </button>
                <button
                  onClick={() => navigate('/settings/company')}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Open Company Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-10 pt-4 md:px-8 md:pt-8">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_42%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(22,101,52,0.88))] px-6 py-8 text-white md:px-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">Agency Profile Hub</p>
                <h1 className="mt-2 text-3xl font-bold">{agency.company_name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-100">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                    <MapPin className="h-4 w-4" />
                    {agency.city || 'City not added'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                    <FileText className="h-4 w-4" />
                    {agency.gstin || 'GSTIN pending'}
                  </span>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${STATUS_STYLES[agency.status]}`}>
                    <ShieldCheck className="h-4 w-4" />
                    {agency.status}
                  </span>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">Record Health</p>
                <p className="mt-2 text-3xl font-bold">{completion}%</p>
                <p className="mt-1 text-sm text-slate-100">Company metadata, tax identity and owner contact coverage.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 px-6 py-6 md:grid-cols-4 md:px-8">
            <MetricCard title="Fleet Size" value={String(agency.fleet_size ?? 0)} subtitle="Registered trucks under this agency" icon={Truck} />
            <MetricCard title="Active Jobs" value={String(summary.active)} subtitle="Loads currently in motion" icon={Users} />
            <MetricCard title="Pending Jobs" value={String(summary.pending)} subtitle="Loads awaiting agency response" icon={BadgePercent} />
            <MetricCard title="30 Day Revenue" value={formatCurrency(summary.thirtyDayRevenue)} subtitle={`${summary.thirtyDayJobs} delivered jobs`} icon={CircleDollarSign} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Quick Actions</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Owned agency settings</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => navigate('/settings/company')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-primary-500/40"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">Company Settings</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Invoice, GST and business identity details</p>
                  <ChevronRight className="mt-4 h-4 w-4 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/agency/fleet')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-primary-500/40"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">Fleet</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Truck registry and assignment inventory</p>
                  <ChevronRight className="mt-4 h-4 w-4 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/agency/billing')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-primary-500/40"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">Billing</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Collections, invoices and earnings visibility</p>
                  <ChevronRight className="mt-4 h-4 w-4 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/agency/rates')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-primary-500/40"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">Rates</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Route pricing owned by this agency</p>
                  <ChevronRight className="mt-4 h-4 w-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Agency Record</p>
                  <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Business metadata</h2>
                </div>
                <button
                  onClick={() => navigate('/agency/dashboard')}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300"
                >
                  Refresh Snapshot <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Company</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                    <p>{agency.company_name}</p>
                    <p>City: {agency.city || 'Missing'}</p>
                    <p>GSTIN: {agency.gstin || 'Missing'}</p>
                    <p>Status: {agency.status}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Owner Contact</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                    <p>Email: {user?.email || 'Missing'}</p>
                    <p>Phone: {user?.phone || 'Missing'}</p>
                    <p>Rating: {agency.rating ? agency.rating.toFixed(1) : 'New'}</p>
                    <p>Total jobs: {agency.total_jobs ?? 0}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Operations Snapshot</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Loads created today</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{summary.today}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Last 30 days</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{summary.thirtyDayJobs} jobs</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Revenue: {formatCurrency(summary.thirtyDayRevenue)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}