import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Truck, Briefcase,
  LogOut, Building2, ChevronRight, Users, Bell, User, DollarSign, UserCog, Handshake, PackagePlus, FileText, Receipt, Wallet, MapPin, Banknote, Plug, ClipboardList, CreditCard, MoreHorizontal
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { toDisplayName } from '../utils/displayName'
import toast from 'react-hot-toast'
import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { BillingGateProvider } from '../components/billing/BillingGate'
import AgencyBillingBanner from '../components/billing/AgencyBillingBanner'
import PermissionDeniedState from '../components/PermissionDeniedState'
import { useAgencyAccess } from '../hooks/useAgencyAccess'
import { describeScopes } from '../lib/agencyAccess'

const NAV = [
  { to: '/agency/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/agency/fleet', icon: Truck, label: 'Fleet' },
  { to: '/agency/drivers', icon: Users, label: 'Drivers' },
  { to: '/agency/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/agency/billing', icon: DollarSign, label: 'Earnings' },
]

// Desktop sidebar only: the six-item bottom bar has no room for more tabs at 390px.
const MORE_NAV = [
  { to: '/agency/team', icon: UserCog, label: 'Team' },
  { to: '/agency/clients', icon: Handshake, label: 'Clients' },
  { to: '/agency/orders/import', icon: PackagePlus, label: 'Orders' },
  { to: '/agency/orders/plan', icon: ClipboardList, label: 'Load plan' },
  { to: '/agency/consignments', icon: FileText, label: 'Consignments' },
  { to: '/agency/invoices', icon: Receipt, label: 'Invoices' },
  { to: '/agency/expenses', icon: Wallet, label: 'Expenses' },
  { to: '/agency/tracking', icon: MapPin, label: 'Tracking' },
  { to: '/agency/payroll', icon: Banknote, label: 'Payroll' },
  { to: '/agency/erp', icon: Plug, label: 'ERP' },
  { to: '/subscription', icon: CreditCard, label: 'Subscription' },
]

const MORE_SHEET_ID = 'agency-more-sheet'

export default function AgencyLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const access = useAgencyAccess()
  // Staff only see what their scopes can read (the database enforces the same lists via RLS).
  const nav = NAV.filter((item) => access.canRead(item.to))
  const moreNav = MORE_NAV.filter((item) => access.canRead(item.to))
  const pageAllowed = access.canRead(location.pathname)
  const actionsAllowed = access.canAct(location.pathname)
  const [newJobCount, setNewJobCount] = useState(0)

  // Phone "More" sheet: the bottom bar cannot hold every MORE_NAV page.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreActive = moreNav.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))

  // Closing always returns focus to the More button, so keyboard users keep their place.
  const closeMore = () => {
    setMoreOpen(false)
    moreButtonRef.current?.focus()
  }

  useEffect(() => {
    if (moreOpen) sheetRef.current?.querySelector<HTMLElement>('a[href]')?.focus()
  }, [moreOpen])

  const onSheetKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMore()
      return
    }
    if (event.key !== 'Tab') return
    // Keep Tab inside the modal sheet while it is open.
    const links = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('a[href]') ?? [])
    if (links.length === 0) return
    const first = links[0]
    const last = links[links.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // `user_metadata.company` can be a string or `{ name }` (device-local
  // profile). Normalize before rendering — rendering the object directly
  // threw React error #31 and collapsed every agency route.
  const companyLabel = toDisplayName(user?.user_metadata?.company) || user?.email || 'Agency'

  // Subscribe to new jobs for this agency. Only meaningful against a
  // configured cloud backend: in local-first mode the placeholder client
  // would otherwise open a WebSocket to an unresolvable host on every page.
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return

    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const subscribeToJobs = async () => {
      // Get agency ID
      const { data: agency } = await supabase
        .from('transport_agencies')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled || !agency?.id) return

      // Subscribe to new jobs for this agency
      channel = supabase.channel('agency-new-jobs')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'agency_jobs',
          filter: `agency_id=eq.${agency.id}`
        }, () => {
          setNewJobCount(c => c + 1)
        })
        .subscribe()
    }

    void subscribeToJobs()

    return () => {
      cancelled = true
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [user?.id])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
    toast.success('Signed out')
  }

  const handleBellClick = () => {
    setNewJobCount(0)
    navigate('/agency/jobs')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col md:flex-row">

      {/* ── Desktop Sidebar (lg+) ────────────────────────────── */}
      <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 md:w-64 md:flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-30">
        {/* Brand */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 leading-none">Agency Portal</p>
              <p className="text-xs text-slate-400 mt-1 truncate max-w-[140px]">
                {companyLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Notification Bell row */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Notifications</span>
          <button
            onClick={handleBellClick}
            className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="New Jobs"
          >
            <Bell size={18} className="text-slate-500" />
            {newJobCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                {newJobCount > 9 ? '9+' : newJobCount}
              </span>
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">Menu</p>
          {[...nav, ...moreNav].map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`
              }
            >
              <Icon size={20} />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Profile + Logout */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-1">
          <NavLink
            to="/agency/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`
            }
          >
            <User size={20} />
            <span className="font-medium">Profile</span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Header (hidden on lg+) ───────────────── */}
      <header className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none">
              Agency Portal
            </p>
            <p className="text-xs text-slate-400 truncate max-w-[140px]">
              {companyLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBellClick}
            className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="New Jobs"
          >
            <Bell size={18} className="text-slate-500" />
            {newJobCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-scale-in">
                {newJobCount > 9 ? '9+' : newJobCount}
              </span>
            )}
          </button>
          <NavLink
            to="/agency/profile"
            className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1"
          >
            Profile <ChevronRight size={12} />
          </NavLink>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Sign out"
          >
            <LogOut size={18} className="text-slate-500" />
          </button>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 pb-24 md:pb-8 md:ml-64">
        <BillingGateProvider staffDeniedTitle={access.isStaff && pageAllowed && !actionsAllowed ? access.deniedTitle : null}>
          <AgencyBillingBanner />
          {access.isStaff && pageAllowed && !actionsAllowed && (
            <p
              role="note"
              data-testid="staff-read-only-note"
              className="mx-4 mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 md:mx-8"
            >
              Read-only for your staff role ({describeScopes(access.agencyScopes)}). Actions on this page are limited to other roles.
            </p>
          )}
          {pageAllowed ? (
            <Outlet />
          ) : (
            <PermissionDeniedState
              attemptedPath={location.pathname}
              allowedRoles={['agency owner or a staff role with access']}
              homePath="/agency/dashboard"
            />
          )}
        </BillingGateProvider>
      </main>

      {/* ── Mobile More sheet (hidden on lg+) ────────────────── */}
      {moreNav.length > 0 && (
        <>
          {moreOpen && (
            <div
              aria-hidden="true"
              data-testid="agency-more-backdrop"
              onClick={closeMore}
              className="md:hidden fixed inset-0 z-40 bg-slate-900/40"
            />
          )}
          <div
            id={MORE_SHEET_ID}
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More agency pages"
            hidden={!moreOpen}
            onKeyDown={onSheetKeyDown}
            className="md:hidden fixed inset-x-0 bottom-16 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
          >
            <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">More</p>
            <nav aria-label="More pages">
              {moreNav.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={closeMore}
                  className={({ isActive }) =>
                    `flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`
                  }
                >
                  <Icon size={20} aria-hidden="true" />
                  <span className="font-medium">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      )}

      {/* ── Mobile Bottom Navigation (hidden on lg+) ─────────── */}
      <nav aria-label="Agency main" className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-50 safe-area-bottom">
        <div className="flex items-stretch px-2 py-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`
              }
            >
              <Icon size={22} aria-hidden="true" />
              <span className="max-w-full truncate text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
          {moreNav.length > 0 && (
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => (moreOpen ? closeMore() : setMoreOpen(true))}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-controls={MORE_SHEET_ID}
              className={`flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${moreOpen || moreActive
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <MoreHorizontal size={22} aria-hidden="true" />
              <span className="max-w-full truncate text-[10px] font-medium">More</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
