import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Truck, Route, MapPin, TrendingUp, Clock, ChevronRight, Zap, Bell, Loader2 } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import { supabase } from '../lib/supabase'

interface DashboardStats {
  activeShipments: number
  trucksCount: number
  routesToday: number
  deliveriesDone: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { language } = useLanguageStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    activeShipments: 0,
    trucksCount: 0,
    routesToday: 0,
    deliveriesDone: 0
  })
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting(language === 'en' ? 'Good Morning' : 'सुप्रभात')
    else if (hour < 17) setGreeting(language === 'en' ? 'Good Afternoon' : 'नमस्कार')
    else setGreeting(language === 'en' ? 'Good Evening' : 'शुभ संध्या')
  }, [language])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      // Fetch counts from Supabase
      const [trucksRes, shipmentsRes, routesRes] = await Promise.all([
        supabase.from('trucks').select('id', { count: 'exact' }),
        supabase.from('shipments').select('id, status', { count: 'exact' }),
        supabase.from('routes').select('id', { count: 'exact' })
      ])

      const activeShipments = shipmentsRes.data?.filter(s => s.status === 'in_transit').length || 0
      const deliveriesDone = shipmentsRes.data?.filter(s => s.status === 'delivered').length || 0

      setStats({
        activeShipments,
        trucksCount: trucksRes.count || 0,
        routesToday: routesRes.count || 0,
        deliveriesDone
      })
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const statsConfig = [
    { 
      label: language === 'en' ? 'Active Shipments' : 'सक्रिय शिपमेंट', 
      value: stats.activeShipments.toString(), 
      icon: Package, 
      color: 'from-blue-500 to-blue-600', 
      change: '+0' 
    },
    { 
      label: language === 'en' ? 'Trucks Available' : 'उपलब्ध ट्रक', 
      value: stats.trucksCount.toString(), 
      icon: Truck, 
      color: 'from-green-500 to-green-600', 
      change: `+${stats.trucksCount}` 
    },
    { 
      label: language === 'en' ? 'Routes Today' : 'आज के रूट', 
      value: stats.routesToday.toString(), 
      icon: Route, 
      color: 'from-orange-500 to-orange-600', 
      change: '+0' 
    },
    { 
      label: language === 'en' ? 'Deliveries Done' : 'डिलीवरी पूर्ण', 
      value: stats.deliveriesDone.toString(), 
      icon: MapPin, 
      color: 'from-purple-500 to-purple-600', 
      change: '+0' 
    },
  ]

  const recentActivity = [
    { id: 1, type: 'delivery', message: language === 'en' ? 'System ready for packing' : 'पैकिंग के लिए सिस्टम तैयार', time: language === 'en' ? 'Just now' : 'अभी', status: 'success' },
    { id: 2, type: 'packing', message: language === 'en' ? `${stats.trucksCount} trucks loaded in database` : `${stats.trucksCount} ट्रक डेटाबेस में लोड`, time: language === 'en' ? '1 min ago' : '1 मिनट पहले', status: 'info' },
    { id: 3, type: 'route', message: language === 'en' ? 'Route optimization ready' : 'रूट अनुकूलन तैयार', time: language === 'en' ? '5 min ago' : '5 मिनट पहले', status: 'info' },
  ]

  const quickActions = [
    { icon: Package, label: language === 'en' ? '3D Pack' : 'पैकिंग', path: '/packing', color: 'bg-blue-500', description: language === 'en' ? 'Optimize loading' : 'लोडिंग अनुकूलित करें' },
    { icon: Route, label: language === 'en' ? 'Routes' : 'रूट', path: '/routes', color: 'bg-green-500', description: language === 'en' ? 'Plan delivery' : 'डिलीवरी प्लान' },
    { icon: MapPin, label: language === 'en' ? 'Track' : 'ट्रैक', path: '/tracking', color: 'bg-orange-500', description: language === 'en' ? 'Live GPS' : 'लाइव जीपीएस' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }
  
  return (
    <div className="p-4 space-y-6 pb-8">
      {/* Welcome Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-6 text-white animate-fade-in">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-saffron/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
        
        <div className="relative">
          <p className="text-primary-200 text-sm font-medium">{greeting} 👋</p>
          <h1 className="text-2xl font-bold mt-1">
            {user?.name || 'User'}
          </h1>
          
          {/* Notification Badge */}
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur rounded-full text-sm">
            <Bell className="w-4 h-4 text-saffron animate-pulse" />
            <span>3 pending optimizations</span>
          </div>
          
          <div className="mt-5 flex gap-3">
            <button 
              onClick={() => navigate('/packing')}
              className="btn bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/20 shadow-lg"
            >
              <Package className="w-4 h-4" />
              New Packing
            </button>
            <button 
              onClick={() => navigate('/routes')}
              className="btn bg-white text-primary-700 hover:bg-primary-50 shadow-lg shadow-primary-900/30"
            >
              <Route className="w-4 h-4" />
              Plan Route
            </button>
          </div>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 stagger-children">
        {statsConfig.map((stat, index) => (
          <div 
            key={stat.label} 
            className="card card-hover p-4 group cursor-pointer"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {stat.label}
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">
                    {stat.value}
                  </p>
                  <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                    {stat.change}
                  </span>
                </div>
              </div>
              <div className={`bg-gradient-to-br ${stat.color} p-2.5 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Quick Actions */}
      <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {language === 'en' ? 'Quick Actions' : 'त्वरित कार्रवाई'}
          </h3>
          <Zap className="w-5 h-5 text-saffron" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action, index) => (
            <button 
              key={action.label}
              onClick={() => navigate(action.path)}
              className="card card-hover p-4 text-center group active:scale-95 transition-all duration-200"
              style={{ animationDelay: `${(index + 4) * 50}ms` }}
            >
              <div className={`w-14 h-14 ${action.color} rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                <action.icon className="w-7 h-7 text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                {action.label}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                {action.description}
              </span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Recent Activity */}
      <div className="animate-slide-up" style={{ animationDelay: '300ms' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {language === 'en' ? 'Recent Activity' : 'हाल की गतिविधि'}
          </h3>
          <button className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
            {language === 'en' ? 'View all' : 'सभी देखें'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="card overflow-hidden">
          {recentActivity.map((activity, index) => (
            <div 
              key={activity.id} 
              className={`p-4 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${
                index !== recentActivity.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                activity.status === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
                activity.status === 'warning' ? 'bg-orange-100 dark:bg-orange-900/30' :
                'bg-blue-100 dark:bg-blue-900/30'
              }`}>
                {activity.type === 'delivery' && <Package className={`w-5 h-5 ${activity.status === 'success' ? 'text-green-600' : 'text-blue-600'}`} />}
                {activity.type === 'packing' && <Truck className="w-5 h-5 text-blue-600" />}
                {activity.type === 'route' && <Route className="w-5 h-5 text-blue-600" />}
                {activity.type === 'alert' && <MapPin className="w-5 h-5 text-orange-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1 font-medium">
                  {activity.message}
                </p>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {activity.time}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Performance Chart */}
      <div className="card p-5 animate-slide-up" style={{ animationDelay: '400ms' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Weekly Performance
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Delivery efficiency</p>
          </div>
          <span className="badge badge-success flex items-center gap-1.5 px-3 py-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="font-semibold">+12%</span>
          </span>
        </div>
        <div className="h-44 bg-gradient-to-t from-primary-50/80 to-transparent dark:from-primary-900/20 rounded-2xl flex items-end justify-around px-3 pb-4 pt-2 relative">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-[10px] text-slate-400 -ml-1">
            <span>100</span>
            <span>50</span>
            <span>0</span>
          </div>
          {[40, 65, 55, 80, 72, 90, 85].map((height, i) => (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-full max-w-[32px] bg-gradient-to-t from-primary-600 to-primary-400 rounded-t-lg transition-all duration-500 hover:from-primary-500 hover:to-primary-300 cursor-pointer relative group"
                style={{ height: `${height}%` }}
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {height}%
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-around mt-3 text-xs text-slate-500 font-medium">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span className="text-primary-600 font-semibold">Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>
      </div>
      
      {/* Pro Tip Card */}
      <div className="card p-4 bg-gradient-to-r from-saffron/10 to-orange-50 dark:from-saffron/20 dark:to-orange-900/20 border-saffron/30 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-saffron/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-xl">💡</span>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Pro Tip</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Use 3D bin packing to maximize truck utilization by up to 40% and reduce shipping costs.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
