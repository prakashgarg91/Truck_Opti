import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Clock, Wallet, User } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import OfflineBanner from '../components/OfflineBanner'

const driverNavItems = [
  { path: '/driver/dashboard', icon: LayoutDashboard, label: 'Home', labelHi: 'होम' },
  { path: '/driver/history', icon: Clock, label: 'Trips', labelHi: 'यात्राएं' },
  { path: '/driver/earnings', icon: Wallet, label: 'Earnings', labelHi: 'कमाई' },
  { path: '/profile', icon: User, label: 'Profile', labelHi: 'प्रोफाइल' },
]

export default function DriverLayout() {
  const { user } = useAuthStore()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <OfflineBanner />

      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
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

      {/* Main Content */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-40 safe-bottom">
        <div className="flex items-center justify-around h-16 max-w-md mx-auto">
          {driverNavItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${
                  isActive
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
