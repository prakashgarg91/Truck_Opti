import { useState, useEffect } from 'react'
import { MapPin, Navigation, Clock, IndianRupee, Plus, X, Search, ChevronRight, Map as MapIcon, TrendingUp, Zap } from 'lucide-react'
import { routesApi } from '../services/api'

interface Route {
  id: number
  name: string
  start_location: string
  destinations: string[]
  total_distance: number
  total_time: number
  total_cost: number
  status: string
  waypoints?: any[]
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  
  const [formData, setFormData] = useState({
    start_location: '',
    destinations: [''],
    optimization_goal: 'distance' as 'distance' | 'time' | 'cost',
    return_to_start: false
  })

  useEffect(() => {
    fetchRoutes()
  }, [])

  const fetchRoutes = async () => {
    try {
      setLoading(true)
      const data = await routesApi.getAll()
      setRoutes(data)
    } catch (error) {
      console.error('Failed to fetch routes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddDestination = () => {
    setFormData({ ...formData, destinations: [...formData.destinations, ''] })
  }

  const handleRemoveDestination = (index: number) => {
    const newDestinations = [...formData.destinations]
    newDestinations.splice(index, 1)
    setFormData({ ...formData, destinations: newDestinations })
  }

  const handleDestinationChange = (index: number, value: string) => {
    const newDestinations = [...formData.destinations]
    newDestinations[index] = value
    setFormData({ ...formData, destinations: newDestinations })
  }

  const handleOptimize = async () => {
    try {
      setOptimizing(true)
      await routesApi.optimize({
        ...formData,
        destinations: formData.destinations.filter(d => d.trim() !== '')
      })
      setIsModalOpen(false)
      fetchRoutes()
    } catch (error) {
      console.error('Optimization failed:', error)
    } finally {
      setOptimizing(false)
    }
  }

  const filteredRoutes = filter === 'all' 
    ? routes 
    : routes.filter(r => r.status === filter)
  
  return (
    <div className="p-4 space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Routes
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            AI-powered route optimization
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-primary-600/20 flex items-center gap-2 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>New Route</span>
        </button>
      </div>
      
      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {['all', 'active', 'pending', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
              filter === f
                ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      
      {/* Route Cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500">Fetching routes...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRoutes.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
              <MapIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No routes found. Create your first optimized route!</p>
            </div>
          ) : (
            filteredRoutes.map((route) => (
              <div key={route.id} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                        {route.name || `Route #${route.id}`}
                      </h3>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        route.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                        route.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                      }`}>
                        {route.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-sm text-slate-500 dark:text-slate-400">
                      <div className="w-2 h-2 rounded-full bg-primary-500" />
                      <span className="font-medium">{route.start_location}</span>
                      <ChevronRight className="w-4 h-4" />
                      <span className="font-medium">{route.destinations[route.destinations.length - 1]}</span>
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 transition-colors">
                    <Navigation className="w-5 h-5 text-primary-500" />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase text-slate-400 font-bold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Distance
                    </p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{route.total_distance} km</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase text-slate-400 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Duration
                    </p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{Math.floor(route.total_time / 60)}h {route.total_time % 60}m</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase text-slate-400 font-bold flex items-center gap-1">
                      <IndianRupee className="w-3 h-3" /> Est. Cost
                    </p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">₹{route.total_cost}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      
      {/* New Route Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Optimize New Route</h2>
                <p className="text-xs text-slate-500">Enter locations to find the best path</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Starting Point
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={formData.start_location}
                    onChange={(e) => setFormData({...formData, start_location: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="e.g. Mumbai Warehouse A"
                  />
                </div>
              </div>
              
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  Destinations
                </label>
                {formData.destinations.map((dest, index) => (
                  <div key={index} className="flex gap-2 animate-fade-in">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={dest}
                        onChange={(e) => handleDestinationChange(index, e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                        placeholder={`Destination ${index + 1}`}
                      />
                    </div>
                    {formData.destinations.length > 1 && (
                      <button 
                        onClick={() => handleRemoveDestination(index)}
                        className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
                <button 
                  onClick={handleAddDestination}
                  className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 text-sm font-medium hover:border-primary-500 hover:text-primary-500 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Another Stop
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Optimization Goal</label>
                  <select
                    value={formData.optimization_goal}
                    onChange={(e) => setFormData({...formData, optimization_goal: e.target.value as any})}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  >
                    <option value="distance">Shortest Distance</option>
                    <option value="time">Fastest Time</option>
                    <option value="cost">Lowest Cost</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="return_to_start"
                    checked={formData.return_to_start}
                    onChange={(e) => setFormData({...formData, return_to_start: e.target.checked})}
                    className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="return_to_start" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Return to start
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleOptimize}
                disabled={optimizing || !formData.start_location || formData.destinations.every(d => !d)}
                className="flex-[2] px-4 py-3 bg-primary-600 text-white rounded-2xl font-bold hover:bg-primary-700 shadow-lg shadow-primary-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {optimizing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-current" />
                    Generate Best Route
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
