import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Package, 
  Route, 
  MapPin, 
  User,
  Menu,
  X,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  Moon,
  Sun,
  CreditCard
} from 'lucide-react'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { useLanguageStore } from '../stores/languageStore'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home', labelHi: 'होम' },
  { path: '/packing', icon: Package, label: 'Pack', labelHi: 'पैकिंग' },
  { path: '/routes', icon: Route, label: 'Routes', labelHi: 'रूट' },
  { path: '/tracking', icon: MapPin, label: 'Track', labelHi: 'ट्रैक' },
  { path: '/management', icon: Settings, label: 'Manage', labelHi: 'मैनेज' },
  { path: '/profile', icon: User, label: 'Profile', labelHi: 'प्रोफाइल' },
]

export default function MobileLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [notificationCount] = useState(3)
  const location = useLocation()
  const navigate = useNavigate()
  const { language, toggleLanguage } = useLanguageStore()
  const { logout } = useAuthStore()
  
  const currentPage = navItems.find(item => item.path === location.pathname)
  
  // Handle theme toggle
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])
  
  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])
  
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile Header - Hidden on desktop */}
      <header className="glass border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 z-40 safe-area-inset-top lg:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors active:scale-95"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-bold text-slate-900 dark:text-slate-100">
              {currentPage?.label || 'TruckOpti'}
            </h1>
          </div>
          
          <button 
            className="p-2 -mr-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl relative transition-colors active:scale-95"
            aria-label={`${notificationCount} notifications`}
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-scale-in">
                {notificationCount}
              </span>
            )}
          </button>
        </div>
      </header>
      
      {/* Sidebar Overlay */}
      <div 
        className={clsx(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden transition-opacity duration-300",
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      
      {/* Sidebar */}
      <aside className={clsx(
        "fixed top-0 left-0 bottom-0 w-80 bg-white dark:bg-slate-800 z-50 transform transition-transform duration-300 ease-out shadow-2xl",
        "lg:fixed lg:translate-x-0 lg:w-64 lg:shadow-lg lg:border-r lg:border-slate-200 dark:lg:border-slate-700",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-lg">TruckOpti</h2>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  v2.0.0
                </p>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl lg:hidden transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 mb-3">
              Menu
            </p>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => clsx(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                )}
              >
                <item.icon className={clsx(
                  "w-5 h-5 transition-transform duration-200",
                  "group-hover:scale-110"
                )} />
                <span className="font-medium">{language === 'en' ? item.label : item.labelHi}</span>
              </NavLink>
            ))}
            
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 mb-3">
                {language === 'en' ? 'Settings' : 'सेटिंग्स'}
              </p>
              <button 
                onClick={() => {
                  navigate('/pricing')
                  setSidebarOpen(false)
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
              >
                <CreditCard className="w-5 h-5" />
                <span className="font-medium">{language === 'en' ? 'Subscription' : 'सदस्यता'}</span>
              </button>
              <button 
                onClick={() => {
                  navigate('/profile')
                  setSidebarOpen(false)
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
              >
                <Settings className="w-5 h-5" />
                <span className="font-medium">{language === 'en' ? 'Settings' : 'सेटिंग्स'}</span>
              </button>
              <button 
                onClick={() => {
                  toast.success(language === 'en' ? 'Support: support@truckopti.in' : 'सहायता: support@truckopti.in')
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
              >
                <HelpCircle className="w-5 h-5" />
                <span className="font-medium">{language === 'en' ? 'Help & Support' : 'सहायता'}</span>
              </button>
            </div>
          </nav>
          
          {/* Theme Toggle & Language */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
            {/* Theme Toggle */}
            <div className="flex items-center justify-between px-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Dark Mode</span>
              <button 
                onClick={() => setIsDark(!isDark)}
                className={clsx(
                  "w-12 h-7 rounded-full transition-colors duration-300 relative",
                  isDark ? "bg-primary-600" : "bg-slate-300"
                )}
                aria-label="Toggle dark mode"
              >
                <span className={clsx(
                  "absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 flex items-center justify-center",
                  isDark ? "translate-x-6" : "translate-x-1"
                )}>
                  {isDark ? <Moon className="w-3 h-3 text-primary-600" /> : <Sun className="w-3 h-3 text-amber-500" />}
                </span>
              </button>
            </div>
            
            {/* Language Toggle */}
            <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-1.5 flex gap-1.5">
              <button 
                onClick={() => language !== 'en' && toggleLanguage()}
                className={clsx(
                  "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
                  language === 'en' 
                    ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm" 
                    : "text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-600/50"
                )}
              >
                English
              </button>
              <button 
                onClick={() => language !== 'hi' && toggleLanguage()}
                className={clsx(
                  "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
                  language === 'hi' 
                    ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm" 
                    : "text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-600/50"
                )}
              >
                हिंदी
              </button>
            </div>
          </div>
          
          {/* Logout */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <button 
              onClick={() => {
                logout()
                toast.success(language === 'en' ? 'Logged out successfully' : 'सफलतापूर्वक लॉगआउट')
                navigate('/login')
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium"
            >
              <LogOut className="w-5 h-5" />
              <span>{language === 'en' ? 'Sign Out' : 'लॉगआउट'}</span>
            </button>
          </div>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 pb-24 lg:pb-6 lg:ml-64 overflow-x-hidden min-h-screen">
        <Outlet />
      </main>
      
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 glass border-t border-slate-200/50 dark:border-slate-700/50 px-2 py-2 lg:hidden safe-area-inset-bottom z-40">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-300 min-w-[60px]",
                  isActive 
                    ? "text-primary-600 dark:text-primary-400" 
                    : "text-slate-500 dark:text-slate-400"
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className={clsx(
                  "p-1.5 rounded-xl transition-all duration-300",
                  isActive && "bg-primary-100 dark:bg-primary-900/40"
                )}>
                  <item.icon className={clsx(
                    "w-5 h-5 transition-transform duration-300",
                    isActive && "scale-110"
                  )} />
                </div>
                <span className={clsx(
                  "text-[10px] font-medium transition-all duration-300",
                  isActive && "font-semibold"
                )}>
                  {language === 'en' ? item.label : item.labelHi}
                </span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
