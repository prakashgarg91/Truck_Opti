import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Truck, Briefcase,
  LogOut, Building2, ChevronRight, Users, Tag
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const NAV = [
  { to: '/agency/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/agency/fleet',     icon: Truck,           label: 'Fleet' },
  { to: '/agency/drivers',   icon: Users,           label: 'Drivers' },
  { to: '/agency/jobs',      icon: Briefcase,       label: 'Jobs' },
  { to: '/agency/rates',     icon: Tag,             label: 'Rates' },
]

export default function AgencyLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
    toast.success('Signed out')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
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

      {/* Main content */}
      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-50 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${
                  isActive
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
