import { useState, useEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Truck, Route, MapPin, TrendingUp, Clock, ChevronRight, Zap, Bell, FileText, Calculator, AlertCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { packingJobsSupabaseApi, analyticsSupabaseApi, saleOrdersSupabaseApi, type PackingJob, type SaleOrder } from '../services/supabaseApi'
import { calculateShipmentCost, formatCost } from '../utils/costEngine'

// Skeleton loader for stats cards
const StatsSkeleton = memo(() => (
  <div className="grid grid-cols-2 gap-3">
    {Array.from({ length: 4 }).map((_, index) => (
      <div
        key={index}
        className="card p-4 animate-pulse"
        style={{ animationDelay: `${index * 100}ms` }}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-8 w-12 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    ))}
  </div>
))

StatsSkeleton.displayName = 'StatsSkeleton'

// Skeleton loader for recent activity
const ActivitySkeleton = memo(() => (
  <div className="card overflow-hidden animate-pulse">
    {Array.from({ length: 3 }).map((_, index) => (
      <div key={index} className="p-4 flex items-start gap-4">
        <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-1/4 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>
    ))}
  </div>
))

ActivitySkeleton.displayName = 'ActivitySkeleton'

interface DashboardStats {
  activeShipments: number
  trucksCount: number
  routesToday: number
  deliveriesDone: number
}

interface DashboardData {
  stats: DashboardStats
  weeklyData: number[]
  recentActivity: Array<{
    id: string
    type: string
    message: string
    time: string
    status: string
  }>
  recentSaleOrders: SaleOrder[]
  pendingOptimizations: number
}

const TRUCK_TYPES = [
  'Tata Ace',
  'Eicher 14ft',
  'Eicher 19ft',
  'BharatBenz 32ft'
]

const fetchDashboardData = async (): Promise<DashboardData> => {
  // Fetch counts from Supabase
  const [trucksRes, shipmentsRes, routesRes, pendingJobsRes] = await Promise.all([
    supabase.from('trucks').select('id', { count: 'exact' }),
    supabase.from('shipments').select('id, status', { count: 'exact' }),
    supabase.from('routes').select('id', { count: 'exact' }),
    supabase.from('packing_jobs').select('id', { count: 'exact' }).eq('status', 'draft')
  ])

  // Surface any query-level errors before computing stats
  const firstError = trucksRes.error || shipmentsRes.error || routesRes.error || pendingJobsRes.error
  if (firstError) throw firstError

  const activeShipments = shipmentsRes.data?.filter(s => s.status === 'in_transit').length || 0
  const deliveriesDone = shipmentsRes.data?.filter(s => s.status === 'delivered').length || 0

  const stats = {
    activeShipments,
    trucksCount: trucksRes.count || 0,
    routesToday: routesRes.count || 0,
    deliveriesDone
  }

  // Fetch weekly packing data
  const weeklyCounts = await analyticsSupabaseApi.getWeeklyPackingCounts()
  const data = weeklyCounts.map(d => d.count)
  // Normalize to percentages for the chart (max 100)
  const maxCount = Math.max(...data, 1)
  const normalizedData = data.map(count => Math.round((count / maxCount) * 100))
  const weeklyData = normalizedData.length > 0 ? normalizedData : [0, 0, 0, 0, 0, 0, 0]

  // Fetch recent packing jobs for activity
  const recentJobs = await packingJobsSupabaseApi.getUserJobs(5)
  const activities = recentJobs.map((job: PackingJob) => ({
    id: job.id || '',
    type: 'packing',
    message: `Packing job completed - ${job.volume_utilization}% volume utilized`,
    time: getRelativeTime(new Date(job.created_at || Date.now())),
    status: job.status === 'completed' ? 'success' : 'info'
  }))

  // Add default activities if no packing jobs
  if (activities.length === 0) {
    activities.push(
      { id: '1', type: 'packing', message: 'System ready for packing', time: 'Just now', status: 'success' },
      { id: '2', type: 'info', message: `${trucksRes.count || 0} trucks loaded in database`, time: '1 min ago', status: 'info' },
      { id: '3', type: 'route', message: 'Route optimization ready', time: '5 min ago', status: 'info' }
    )
  }

  // Fetch recent sale orders
  const recentSaleOrders = await saleOrdersSupabaseApi.getRecent(3)

  return {
    stats,
    weeklyData,
    recentActivity: activities,
    recentSaleOrders,
    pendingOptimizations: pendingJobsRes.count || 0
  }
}

const getRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour ago`
  return `${diffDays} day ago`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [greeting, setGreeting] = useState('')
  const [costEstimate, setCostEstimate] = useState({
    distance: 500,
    truckType: TRUCK_TYPES[1],
    weight: 1000,
    result: calculateShipmentCost({ distanceKm: 500, truckType: 'Eicher 14ft', weightKg: 1000, volumeM3: 10 })
  })

  useEffect(() => {
    document.title = 'Dashboard - TruckOpti'
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good Morning')
    else if (hour < 17) setGreeting('Good Afternoon')
    else setGreeting('Good Evening')
  }, [])

  // React Query: Fetch dashboard data
  const {
    data: dashboardData,
    isLoading: loading,
    isError: loadError
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => fetchDashboardData(),
  })

  const stats = dashboardData?.stats || {
    activeShipments: 0,
    trucksCount: 0,
    routesToday: 0,
    deliveriesDone: 0
  }
  const weeklyData = dashboardData?.weeklyData || [0, 0, 0, 0, 0, 0, 0]
  const recentActivity = dashboardData?.recentActivity || []
  const recentSaleOrders = dashboardData?.recentSaleOrders || []
  const pendingOptimizations = dashboardData?.pendingOptimizations || 0

  const statsConfig = [
    {
      label: 'Active Shipments',
      value: stats.activeShipments.toString(),
      icon: Package,
      color: 'from-blue-500 to-blue-600',
      change: '+0'
    },
    {
      label: 'Trucks Available',
      value: stats.trucksCount.toString(),
      icon: Truck,
      color: 'from-green-500 to-green-600',
      change: `+${stats.trucksCount}`
    },
    {
      label: 'Routes Today',
      value: stats.routesToday.toString(),
      icon: Route,
      color: 'from-orange-500 to-orange-600',
      change: '+0'
    },
    {
      label: 'Deliveries Done',
      value: stats.deliveriesDone.toString(),
      icon: MapPin,
      color: 'from-purple-500 to-purple-600',
      change: '+0'
    },
  ]

  const quickActions = [
    { icon: Package, label: '3D Pack', path: '/packing', color: 'bg-blue-500', description: 'Optimize loading' },
    { icon: Route, label: 'Routes', path: '/routes', color: 'bg-green-500', description: 'Plan delivery' },
    { icon: MapPin, label: 'Track', path: '/tracking', color: 'bg-orange-500', description: 'Live GPS' },
    { icon: Truck, label: 'Book Truck', path: '/booking/new', color: 'bg-indigo-500', description: 'New booking' },
  ]

  const updateCostEstimate = () => {
    const result = calculateShipmentCost({
      distanceKm: costEstimate.distance,
      truckType: costEstimate.truckType,
      weightKg: costEstimate.weight,
      volumeM3: costEstimate.weight / 100
    })
    setCostEstimate(prev => ({ ...prev, result }))
  }

  if (loading && !loadError) {
    return (
      <div className="p-4 space-y-6 pb-8">
        {/* Welcome Section Skeleton */}
        <div className="bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700 rounded-3xl p-6 h-40 animate-pulse" />

        {/* Stats Skeleton */}
        <StatsSkeleton />

        {/* Quick Actions Skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="card p-4 text-center animate-pulse">
              <div className="w-14 h-14 bg-slate-200 dark:bg-slate-700 rounded-2xl mx-auto mb-3" />
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded mx-auto" />
            </div>
          ))}
        </div>

        {/* Recent Activity Skeleton */}
        <div>
          <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
          <ActivitySkeleton />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          {'Failed to load dashboard'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {'Please check your connection and try again'}
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 lg:pb-10 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-6 text-white animate-fade-in">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-saffron/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />

        <div className="relative">
          <p className="text-primary-200 text-sm font-medium">{greeting} 👋</p>
          <h1 className="text-2xl font-bold mt-1">
            {user?.name || user?.email?.split('@')[0] || 'User'}
          </h1>

          {/* Notification Badge */}
          {pendingOptimizations > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur rounded-full text-sm">
              <Bell className="w-4 h-4 text-saffron animate-pulse" />
              <span>{pendingOptimizations} pending {pendingOptimizations === 1 ? 'optimization' : 'optimizations'}</span>
            </div>
          )}

          <div className="mt-5 flex gap-3 flex-wrap">
            <button
              onClick={() => navigate('/booking/new')}
              className="btn bg-white text-primary-700 hover:bg-primary-50 shadow-lg shadow-primary-900/30"
            >
              <Truck className="w-4 h-4" />
              Book a Truck
            </button>
            <button
              onClick={() => navigate('/packing')}
              className="btn bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/20 shadow-lg"
            >
              <Package className="w-4 h-4" />
              New Packing
            </button>
            <button
              onClick={() => navigate('/routes')}
              className="btn bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/20 shadow-lg"
            >
              <Route className="w-4 h-4" />
              Plan Route
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 stagger-children">
          {statsConfig.map((stat, index) => (
            <div
              key={stat.label}
              className="card card-hover p-4 group cursor-pointer"
              style={{ animationDelay: `${index * 100}ms` }}
              role="status"
              aria-label={stat.label}
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
      )}

      {/* Quick Actions */}
      <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {'Quick Actions'}
          </h3>
          <Zap className="w-5 h-5 text-saffron" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
          {quickActions.map((action, index) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              aria-label={action.label}
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

      {/* Desktop 2-col grid: Cost Estimate + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Cost Estimate */}
        <div className="card p-5 animate-slide-up" style={{ animationDelay: '250ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {'Quick Cost Estimate'}
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">{'Distance (km)'}</label>
              <input
                type="number"
                value={costEstimate.distance}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  setCostEstimate(prev => ({ ...prev, distance: val }))
                }}
                onBlur={updateCostEstimate}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{'Truck Type'}</label>
              <select
                value={costEstimate.truckType}
                onChange={(e) => {
                  setCostEstimate(prev => ({ ...prev, truckType: e.target.value }))
                  setTimeout(updateCostEstimate, 0)
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm"
              >
                {TRUCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{'Weight (kg)'}</label>
              <input
                type="number"
                value={costEstimate.weight}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  setCostEstimate(prev => ({ ...prev, weight: val }))
                }}
                onBlur={updateCostEstimate}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">{'Total Estimate'}</span>
              <span className="text-2xl font-bold text-primary-600">{formatCost(costEstimate.result.totalCost)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <p className="text-slate-500">{'Fuel'}</p>
                <p className="font-medium">{formatCost(costEstimate.result.fuelCost)}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-500">{'Toll'}</p>
                <p className="font-medium">{formatCost(costEstimate.result.tollCost)}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-500">{'Driver'}</p>
                <p className="font-medium">{formatCost(costEstimate.result.driverCost)}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-500">{'Loading'}</p>
                <p className="font-medium">{formatCost(costEstimate.result.loadingCost)}</p>
              </div>
            </div>
          </div>
        </div>

      </div>{/* end desktop 2-col */}

      {/* Desktop 2-col grid: Recent Orders + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sale Orders */}
        <div className="animate-slide-up" style={{ animationDelay: '275ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {'Recent Sale Orders'}
            </h3>
            <button
              onClick={() => navigate('/sale-orders')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              {'View all'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {recentSaleOrders.length === 0 ? (
            <div className="card p-6 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {'No sale orders yet'}
              </p>
              <button
                onClick={() => navigate('/sale-orders')}
                className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {'Import orders →'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSaleOrders.map(order => (
                <div
                  key={order.id}
                  onClick={() => navigate('/sale-orders')}
                  className="card p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{order.order_number}</p>
                      <p className="text-xs text-slate-500">{order.total_items} items • {order.delivery_city}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${order.status === 'completed' ? 'bg-green-100 text-green-700' :
                    order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                    {order.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="animate-slide-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {'Recent Activity'}
            </h3>
            <button onClick={() => navigate('/packing')} className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              {'View all'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="card overflow-hidden">
            {recentActivity.map((activity, index) => (
              <div
                key={activity.id}
                className={`p-4 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${index !== recentActivity.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${activity.status === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
                  activity.status === 'warning' ? 'bg-orange-100 dark:bg-orange-900/30' :
                    'bg-blue-100 dark:bg-blue-900/30'
                  }`}>
                  {activity.type === 'delivery' && <Package className={`w-5 h-5 ${activity.status === 'success' ? 'text-green-600' : 'text-blue-600'}`} />}
                  {activity.type === 'packing' && <Truck className="w-5 h-5 text-blue-600" />}
                  {activity.type === 'route' && <Route className="w-5 h-5 text-blue-600" />}
                  {activity.type === 'alert' && <MapPin className="w-5 h-5 text-orange-600" />}
                  {activity.type === 'info' && <Bell className="w-5 h-5 text-blue-600" />}
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

      </div>{/* end recent orders */}
      {/* Performance Chart */}
      <div className="card p-5 animate-slide-up" style={{ animationDelay: '400ms' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {'Weekly Performance'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{'Packing jobs per day'}</p>
          </div>
          <span className="badge badge-success flex items-center gap-1.5 px-3 py-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="font-semibold">Live</span>
          </span>
        </div>
        <div className="h-44 bg-gradient-to-t from-primary-50/80 to-transparent dark:from-primary-900/20 rounded-2xl flex items-end justify-around px-3 pb-4 pt-2 relative">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-[10px] text-slate-400 -ml-1">
            <span>100</span>
            <span>50</span>
            <span>0</span>
          </div>
          {weeklyData.map((height, i) => (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-full max-w-[32px] bg-gradient-to-t from-primary-600 to-primary-400 rounded-t-lg transition-all duration-500 hover:from-primary-500 hover:to-primary-300 cursor-pointer relative group"
                style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {height}%
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-around mt-3 text-xs text-slate-500 font-medium">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
            <span key={day} className={i === new Date().getDay() ? 'text-primary-600 font-bold' : ''}>
              {day}
            </span>
          ))}
        </div>
      </div>

      {/* Pro Tip Card */}
      <div className="card p-4 bg-gradient-to-r from-saffron/10 to-orange-50 dark:from-saffron/20 dark:to-orange-900/20 border-saffron/30 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-saffron/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-xl">💡</span>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white text-sm">{'Pro Tip'}</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {'Keep trucks, cartons, and customer records current so packing, routing, and booking suggestions stay accurate.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
