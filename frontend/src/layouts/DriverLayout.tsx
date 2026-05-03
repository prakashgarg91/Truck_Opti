import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Clock, Wallet, User, Truck, LogOut } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import OfflineBanner from '../components/OfflineBanner'

const driverNavItems = [
  { path: '/driver/dashboard', icon: LayoutDashboard, label: 'Home', labelHi: 'होम' },
  { path: '/driver/history', icon: Clock, label: 'Trips', labelHi: 'यात्राएं' },
  { path: '/driver/earnings', icon: Wallet, label: 'Earnings', labelHi: 'कमाई' },
  { path: '/driver/profile', icon: User, label: 'Profile', labelHi: 'प्रोफाइल' },
]

export default function DriverLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
    toast.success('Signed out')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col md:flex-row">
      <OfflineBanner />

      {/* ── Desktop Sidebar (lg+) ────────────────────────────── */}
      <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 md:w-64 md:flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-30">
        {/* Brand */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Truck size={20} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 leading-none">Driver Portal</p>
              <p className="text-xs text-slate-400 mt-1 truncate max-w-[140px]">
                {user?.name || user?.email || 'Driver'}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">Menu</p>
          {driverNavItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/driver/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`
              }
            >
              <Icon size={20} />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
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
      <header className="md:hidden sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            {(user?.name || user?.email || 'D')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-tight">
              {user?.name || 'Driver'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">TruckOpti Driver</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">
          🚛 Driver Portal
        </span>
      </header>

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="flex-1 pb-20 md:pb-8 md:ml-64 overflow-y-auto">
        <Outlet />
      </main>

      {/* ── Mobile Bottom Nav (hidden on lg+) ────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-40 safe-bottom">
        <div className="flex items-center justify-around h-16 max-w-md mx-auto">
          {driverNavItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={isActive ? 'text-blue-600 dark:text-blue-400' : ''} />
                  <span className="text-xs font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
