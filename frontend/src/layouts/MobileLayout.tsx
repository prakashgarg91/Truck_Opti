import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Package, 
  Route, 
  MapPin, 
  Menu,
  X,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  Moon,
  Sun,
  CreditCard,
  Check,
  Trash2,
  Loader2,
  FileText
} from 'lucide-react'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { useLanguageStore } from '../stores/languageStore'
import { useAuthStore } from '../stores/authStore'
import { notificationsSupabaseApi } from '../services/supabaseApi'
import toast from 'react-hot-toast'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home', labelHi: 'होम' },
  { path: '/sale-orders', icon: FileText, label: 'Orders', labelHi: 'ऑर्डर्स' },
  { path: '/packing', icon: Package, label: 'Pack', labelHi: 'पैकिंग' },
  { path: '/routes', icon: Route, label: 'Routes', labelHi: 'रूट' },
  { path: '/tracking', icon: MapPin, label: 'Track', labelHi: 'ट्रैक' },
]

interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  is_read: boolean
  created_at: string
  action_url?: string
}

export default function MobileLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { language, toggleLanguage } = useLanguageStore()
  const { logout, user } = useAuthStore()
  
  const currentPage = navItems.find(item => item.path === location.pathname)

  // Fetch notifications on mount and periodically
  useEffect(() => {
    fetchNotifications()
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user?.id) return
    
    const subscription = notificationsSupabaseApi.subscribeToNotifications(
      user.id,
      () => {
        fetchNotifications()
      }
    )
    
    return () => {
      notificationsSupabaseApi.unsubscribe(subscription)
    }
  }, [user?.id])

  const fetchNotifications = async () => {
    try {
      const count = await notificationsSupabaseApi.getUnreadCount()
      setNotificationCount(count)
      
      if (notificationsOpen) {
        const data = await notificationsSupabaseApi.getNotifications(20)
        setNotifications(data)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  const handleOpenNotifications = async () => {
    setNotificationsOpen(true)
    setLoadingNotifications(true)
    try {
      const data = await notificationsSupabaseApi.getNotifications(20)
      setNotifications(data)
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoadingNotifications(false)
    }
  }

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationsSupabaseApi.markAsRead(id)
      setNotifications(prev => prev.map(n => 
        n.id === id ? { ...n, is_read: true } : n
      ))
      setNotificationCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsSupabaseApi.markAllAsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setNotificationCount(0)
      toast.success(language === 'en' ? 'All notifications marked as read' : 'सभी सूचनाएं पढ़ी गई')
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const handleClearAll = async () => {
    try {
      await notificationsSupabaseApi.clearAll()
      setNotifications([])
      setNotificationCount(0)
      toast.success(language === 'en' ? 'All notifications cleared' : 'सभी सूचनाएं हटा दी गईं')
    } catch (error) {
      console.error('Failed to clear notifications:', error)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id)
    }
    if (notification.action_url) {
      navigate(notification.action_url)
      setNotificationsOpen(false)
    }
  }

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
            onClick={handleOpenNotifications}
            className="p-2 -mr-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl relative transition-colors active:scale-95"
            aria-label={`${notificationCount} notifications`}
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-scale-in">
                {notificationCount > 9 ? '9+' : notificationCount}
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

      {/* Notifications Drawer Overlay */}
      <div 
        className={clsx(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300",
          notificationsOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setNotificationsOpen(false)}
        aria-hidden="true"
      />

      {/* Notifications Drawer */}
      <aside className={clsx(
        "fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white dark:bg-slate-800 z-50 transform transition-transform duration-300 ease-out shadow-2xl",
        notificationsOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">
                  {language === 'en' ? 'Notifications' : 'सूचनाएं'}
                </h2>
                <p className="text-xs text-slate-500">
                  {notificationCount} {language === 'en' ? 'unread' : 'अपठित'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setNotificationsOpen(false)}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              aria-label="Close notifications"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Notifications Actions */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={handleMarkAllAsRead}
              disabled={notificationCount === 0}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              {language === 'en' ? 'Mark all read' : 'सभी पढ़ें'}
            </button>
            <button
              onClick={handleClearAll}
              disabled={notifications.length === 0}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {language === 'en' ? 'Clear all' : 'सभी हटाएं'}
            </button>
          </div>
          
          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto">
            {loadingNotifications ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
                  <Bell className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 dark:text-slate-400">
                  {language === 'en' ? 'No notifications yet' : 'कोई सूचना नहीं'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={clsx(
                      "p-4 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50",
                      !notification.is_read && "bg-primary-50/50 dark:bg-primary-900/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={clsx(
                        "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                        notification.type === 'success' && "bg-green-500",
                        notification.type === 'warning' && "bg-amber-500",
                        notification.type === 'error' && "bg-red-500",
                        notification.type === 'info' && "bg-blue-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {notification.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkAsRead(notification.id)
                          }}
                          className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
      
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
          
          {/* Desktop Notification Bell */}
          <div className="hidden lg:flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {language === 'en' ? 'Notifications' : 'सूचनाएं'}
            </span>
            <button
              onClick={handleOpenNotifications}
              className="relative p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
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
