import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  ExternalLink,
  MapPin,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Star,
  Truck,
  UserCircle2,
  Wallet,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { driverSupabaseApi, type DriverProfile } from '../services/supabaseApi'
import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'

const VEHICLE_LABELS: Record<string, string> = {
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
}

const STATUS_STYLES: Record<DriverProfile['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  suspended: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

function InfoCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle: string
  icon: typeof Wallet
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
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

function DocumentLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 dark:text-primary-300"
        >
          View <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="text-slate-400">Missing</span>
      )}
    </div>
  )
}

export default function DriverProfilePage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Driver Profile - TruckOpti'
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const data = await driverSupabaseApi.getByUserId(user.id)
        setProfile(data)
      } catch (error) {
        logger.error('[DriverProfilePage] loadProfile', error)
        toast.error('Failed to load driver profile')
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()
  }, [user?.id])

  const completionFields = [
    profile?.full_name,
    profile?.phone,
    profile?.home_city,
    profile?.vehicle_type,
    profile?.license_number,
    profile?.rc_number,
    profile?.bank_account || profile?.upi_id,
  ]
  const completion = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100)

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <div className="rounded-[2rem] border border-amber-200 bg-white p-8 shadow-sm dark:border-amber-900/40 dark:bg-slate-800">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Driver profile not found</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                This route now has dedicated driver ownership. Your account does not have a linked driver record yet.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/driver/dashboard')}
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  Back To Driver Dashboard
                </button>
                <button
                  onClick={() => navigate('/profile')}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Open Account Center
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
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(30,41,59,0.92))] px-6 py-8 text-white md:px-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 backdrop-blur">
                  <UserCircle2 className="h-9 w-9" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">Driver Profile Hub</p>
                  <h1 className="mt-2 text-3xl font-bold">{profile.full_name}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-200">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                      <Truck className="h-4 w-4" />
                      {VEHICLE_LABELS[profile.vehicle_type] || profile.vehicle_type}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                      <MapPin className="h-4 w-4" />
                      {profile.home_city || 'City not added'}
                    </span>
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${STATUS_STYLES[profile.status]}`}>
                      <ShieldCheck className="h-4 w-4" />
                      {profile.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">Profile Health</p>
                <p className="mt-2 text-3xl font-bold">{completion}%</p>
                <p className="mt-1 text-sm text-slate-200">Identity, vehicle and payout details on file.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 px-6 py-6 md:grid-cols-3 md:px-8">
            <InfoCard
              title="Trips Completed"
              value={String(profile.total_trips ?? 0)}
              subtitle="Delivered jobs credited to this driver profile"
              icon={Route}
            />
            <InfoCard
              title="Rating"
              value={profile.rating ? profile.rating.toFixed(1) : 'New'}
              subtitle="Live service score from completed work"
              icon={Star}
            />
            <InfoCard
              title="Payment Setup"
              value={profile.upi_id || (profile.bank_account ? 'Bank linked' : 'Pending')}
              subtitle="Withdrawals use your linked payout method"
              icon={Wallet}
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Quick Actions</p>
                  <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Owned driver settings</h2>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <button
                  onClick={() => navigate('/profile')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-primary-500/40"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">Account Center</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Identity, avatar and notifications</p>
                  <ChevronRight className="mt-4 h-4 w-4 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/driver/earnings')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-primary-500/40"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">Earnings</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Wallet balance and withdrawal flow</p>
                  <ChevronRight className="mt-4 h-4 w-4 text-slate-400" />
                </button>
                <button
                  onClick={() => navigate('/driver/history')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-primary-500/40"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">Trip History</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Delivered work and recent route activity</p>
                  <ChevronRight className="mt-4 h-4 w-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Driver Record</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Contact</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                    <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> {profile.phone}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /> {profile.home_city || 'Home city missing'}</p>
                    <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" /> Joined {new Date(profile.created_at).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Vehicle & Payout</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                    <p>{VEHICLE_LABELS[profile.vehicle_type] || profile.vehicle_type}</p>
                    <p>RC: {profile.rc_number || 'Missing'}</p>
                    <p>UPI: {profile.upi_id || 'Missing'}</p>
                    <p>Bank: {profile.bank_account || 'Missing'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Compliance</p>
                  <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Document readiness</h2>
                </div>
                <button
                  onClick={() => navigate('/profile')}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300"
                >
                  Refresh Settings <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 space-y-3">
                <DocumentLink label="Driving License" url={profile.dl_url} />
                <DocumentLink label="RC Book" url={profile.rc_url} />
                <DocumentLink label="Insurance" url={profile.insurance_url} />
                <DocumentLink label="Selfie Verification" url={profile.selfie_url} />
              </div>
              {profile.rejection_reason && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                  Latest review note: {profile.rejection_reason}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}