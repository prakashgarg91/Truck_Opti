import { useState } from 'react'
import { MapPin, Truck, Clock, RefreshCw, Navigation } from 'lucide-react'

const liveTracking = [
  {
    id: 'TRK-001',
    driver: 'Rajesh Kumar',
    vehicle: 'Tata Ace',
    location: 'Near Lonavala Toll Plaza',
    destination: 'Pune',
    eta: '45 min',
    speed: '62 km/h',
    status: 'in_transit',
    lat: 18.7558,
    lng: 73.4027
  },
  {
    id: 'TRK-002',
    driver: 'Amit Singh',
    vehicle: 'Eicher 14ft',
    location: 'Gurugram Sector 44',
    destination: 'Delhi',
    eta: '1h 20min',
    speed: '45 km/h',
    status: 'in_transit',
    lat: 28.4595,
    lng: 77.0266
  },
  {
    id: 'TRK-003',
    driver: 'Suresh Patil',
    vehicle: 'BharatBenz',
    location: 'Arrived at destination',
    destination: 'Chennai',
    eta: 'Delivered',
    speed: '0 km/h',
    status: 'delivered',
    lat: 13.0827,
    lng: 80.2707
  },
]

export default function TrackingPage() {
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Live Tracking
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Track shipments in real-time
          </p>
        </div>
        <button className="btn btn-secondary">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
      
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-green-600">2</p>
          <p className="text-xs text-slate-500">In Transit</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">1</p>
          <p className="text-xs text-slate-500">Delivered</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-orange-600">0</p>
          <p className="text-xs text-slate-500">Delayed</p>
        </div>
      </div>
      
      {/* Map Placeholder */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-blue-100 to-green-100 dark:from-blue-900/30 dark:to-green-900/30 h-48 relative">
          {/* Simulated truck markers */}
          <div className="absolute top-1/4 left-1/3 animate-pulse">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="absolute top-1/2 right-1/4 animate-pulse">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="absolute bottom-1/4 left-1/2">
            <div className="w-8 h-8 bg-slate-400 rounded-full flex items-center justify-center text-white shadow-lg">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="bg-white/80 dark:bg-slate-800/80 px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 backdrop-blur">
              Google Maps coming soon
            </p>
          </div>
        </div>
      </div>
      
      {/* Tracking List */}
      <div className="space-y-3">
        {liveTracking.map((item) => (
          <div 
            key={item.id}
            onClick={() => setSelectedTruck(item.id)}
            className={`card card-hover p-4 cursor-pointer transition-all ${
              selectedTruck === item.id ? 'ring-2 ring-primary-500' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  item.status === 'in_transit' ? 'bg-green-100 text-green-600' :
                  item.status === 'delivered' ? 'bg-blue-100 text-blue-600' :
                  'bg-orange-100 text-orange-600'
                }`}>
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {item.id}
                  </h3>
                  <p className="text-sm text-slate-500">{item.driver}</p>
                </div>
              </div>
              <span className={`badge ${
                item.status === 'in_transit' ? 'badge-success' :
                item.status === 'delivered' ? 'badge-info' :
                'badge-warning'
              }`}>
                {item.status === 'in_transit' ? 'Live' : 
                 item.status === 'delivered' ? 'Delivered' : 'Delayed'}
              </span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{item.location}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Navigation className="w-4 h-4 text-slate-400" />
                  <span>To: {item.destination}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {item.eta}
                  </span>
                </div>
              </div>
              {item.speed !== '0 km/h' && (
                <div className="text-xs text-slate-500">
                  Speed: {item.speed}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
