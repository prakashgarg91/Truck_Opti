import { useState } from 'react'
import { MapPin, Navigation, Clock, IndianRupee, Plus } from 'lucide-react'

const sampleRoutes = [
  {
    id: 1,
    name: 'Mumbai → Pune Express',
    origin: 'Mumbai',
    destination: 'Pune',
    distance: '150 km',
    eta: '3h 15min',
    toll: '₹320',
    status: 'active'
  },
  {
    id: 2,
    name: 'Delhi NCR Circuit',
    origin: 'Delhi',
    destination: 'Gurgaon → Noida → Delhi',
    distance: '85 km',
    eta: '2h 45min',
    toll: '₹180',
    status: 'completed'
  },
  {
    id: 3,
    name: 'Bangalore Tech Park',
    origin: 'Whitefield',
    destination: 'Electronic City',
    distance: '35 km',
    eta: '1h 20min',
    toll: '₹0',
    status: 'pending'
  },
]

export default function RoutesPage() {
  const [filter, setFilter] = useState('all')
  
  const filteredRoutes = filter === 'all' 
    ? sampleRoutes 
    : sampleRoutes.filter(r => r.status === filter)
  
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Routes
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Optimize delivery routes
          </p>
        </div>
        <button className="btn btn-primary">
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">New Route</span>
        </button>
      </div>
      
      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'active', 'pending', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      
      {/* Route Cards */}
      <div className="space-y-4">
        {filteredRoutes.map((route) => (
          <div key={route.id} className="card card-hover p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {route.name}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <MapPin className="w-4 h-4" />
                  <span>{route.origin} → {route.destination}</span>
                </div>
              </div>
              <span className={`badge ${
                route.status === 'active' ? 'badge-success' :
                route.status === 'pending' ? 'badge-warning' :
                'badge-info'
              }`}>
                {route.status}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-300">{route.distance}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-300">{route.eta}</span>
              </div>
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-300">{route.toll}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Map Placeholder */}
      <div className="card overflow-hidden">
        <div className="bg-slate-100 dark:bg-slate-700 h-48 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              Google Maps integration coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
