import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Truck, Briefcase,
  LogOut, Building2, ChevronRight, Users, Tag, Bell, User
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useState, useEffect } from 'react'

const NAV = [
  { to: '/agency/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/agency/fleet', icon: Truck, label: 'Fleet' },
  { to: '/agency/drivers', icon: Users, label: 'Drivers' },
  { to: '/agency/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/agency/rates', icon: Tag, label: 'Rates' },
]

export default function AgencyLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [newJobCount, setNewJobCount] = useState(0)

  // Subscribe to new jobs for this agency
  useEffect(() => {
    async function subscribeToJobs() {
      if (!user?.id) return

      // Get agency ID
      const { data: agency } = await supabase
        .from('transport_agencies')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!agency?.id) return

      // Subscribe to new jobs for this agency
      const channel = supabase.channel('agency-new-jobs')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'agency_jobs',
          filter: `agency_id=eq.${agency.id}`
        }, () => {
          setNewJobCount(c => c + 1)
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    subscribeToJobs()
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col lg:flex-row">

      {/* ── Desktop Sidebar (lg+) ────────────────────────────── */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-30">
        {/* Brand */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 leading-none">Agency Portal</p>
              <p className="text-xs text-slate-400 mt-1 truncate max-w-[140px]">
                {(user?.user_metadata as Record<string, unknown>)?.company as string || user?.email || 'Agency'}
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
          {NAV.map(({ to, icon: Icon, label }) => (
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
            to="/profile"
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
      <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none">
              Agency Portal
            </p>
            <p className="text-xs text-slate-400 truncate max-w-[140px]">
              {(user?.user_metadata as Record<string, unknown>)?.company as string || user?.email || 'Agency'}
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
            to="/profile"
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
      <main className="flex-1 pb-24 lg:pb-8 lg:ml-64">
        <Outlet />
      </main>

      {/* ── Mobile Bottom Navigation (hidden on lg+) ─────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-50 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`
              }
            >
              <Icon size={22} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
