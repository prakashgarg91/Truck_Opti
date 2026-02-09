import { useState, useEffect } from 'react'
import { MapPin, Truck, RefreshCw, Navigation, Search, Activity, Shield, Map as MapIcon } from 'lucide-react'
import { shipmentsSupabaseApi } from '../services/supabaseApi'

interface ShipmentLocation {
  id: string
  shipment_id: string
  latitude: number | null
  longitude: number | null
  driver_name: string | null
  vehicle_number: string | null
  origin: string
  destination: string
  status: string
  updated_at: string
}

export default function TrackingPage() {
  const [shipments, setShipments] = useState<ShipmentLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchActiveShipments()
    
    // Simulate location updates every 10 seconds
    const interval = setInterval(() => {
      updateShipmentLocations()
    }, 10000)
    
    return () => clearInterval(interval)
  }, [])

  const fetchActiveShipments = async () => {
    try {
      setLoading(true)
      const data = await shipmentsSupabaseApi.getAll({ status: 'in_transit' })
      
      // Map data to our interface format
      const mappedData: ShipmentLocation[] = data.map((s: any) => ({
        id: s.id,
        shipment_id: s.shipment_id,
        latitude: s.latitude,
        longitude: s.longitude,
        driver_name: s.driver_name,
        vehicle_number: s.vehicle_number,
        origin: s.origin,
        destination: s.destination,
        status: s.status,
        updated_at: s.updated_at
      }))
      
      // For demo, if no real data, use mock data
      if (mappedData.length === 0) {
        setShipments([
          {
            id: 'mock-1',
            shipment_id: 'SHP-1001',
            latitude: 19.0760,
            longitude: 72.8777,
            driver_name: 'Rajesh Kumar',
            vehicle_number: 'MH-01-AX-1234',
            origin: 'Mumbai',
            destination: 'Pune',
            status: 'in_transit',
            updated_at: new Date().toISOString()
          },
          {
            id: 'mock-2',
            shipment_id: 'SHP-1002',
            latitude: 28.6139,
            longitude: 77.2090,
            driver_name: 'Amit Singh',
            vehicle_number: 'DL-01-CZ-5678',
            origin: 'Delhi',
            destination: 'Jaipur',
            status: 'in_transit',
            updated_at: new Date().toISOString()
          }
        ])
      } else {
        setShipments(mappedData)
      }
    } catch (error) {
      console.error('Failed to fetch shipments:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateShipmentLocations = () => {
    // Simulate location updates
    setShipments(prev => prev.map(s => {
      if (s.latitude && s.longitude) {
        return {
          ...s,
          latitude: s.latitude + (Math.random() - 0.5) * 0.01,
          longitude: s.longitude + (Math.random() - 0.5) * 0.01,
          updated_at: new Date().toISOString()
        }
      }
      return s
    }))
  }

  const filteredShipments = shipments.filter(s => 
    s.shipment_id.toLowerCase().includes(search.toLowerCase()) ||
    (s.driver_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (s.vehicle_number?.toLowerCase() || '').includes(search.toLowerCase())
  )

  return (
    <div className="p-4 space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Live Tracking
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Real-time GPS fleet monitoring
          </p>
        </div>
        <button 
          onClick={fetchActiveShipments}
          className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-all"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {/* Search & Stats */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search shipment, driver or vehicle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 px-4 py-2 rounded-2xl flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{shipments.length} Active</span>
          </div>
        </div>
      </div>
      
      {/* Map View Placeholder */}
      <div className="relative h-64 bg-slate-200 dark:bg-slate-800 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner">
        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        
        {/* Simulated Markers */}
        {shipments.map((s) => (
          s.latitude && s.longitude && (
            <div 
              key={s.id}
              className="absolute transition-all duration-1000 ease-linear cursor-pointer group"
              style={{ 
                left: `${((s.longitude - 70) * 5) % 100}%`, 
                top: `${((30 - s.latitude) * 5) % 100}%` 
              }}
              onClick={() => setSelectedId(s.id)}
            >
              <div className={`p-2 rounded-full shadow-lg transition-transform group-hover:scale-125 ${selectedId === s.id ? 'bg-primary-600 scale-110 z-10' : 'bg-white dark:bg-slate-700'}`}>
                <Truck className={`w-4 h-4 ${selectedId === s.id ? 'text-white' : 'text-primary-600'}`} />
              </div>
              {selectedId === s.id && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-xl">
                  {s.shipment_id}
                </div>
              )}
            </div>
          )
        ))}

        <div className="absolute bottom-4 right-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-bold text-slate-500 flex items-center gap-2 border border-white/20">
          <MapIcon className="w-3 h-3" />
          LIVE MAP PREVIEW
        </div>
      </div>
      
      {/* Shipment List */}
      <div className="space-y-4">
        {filteredShipments.map((s) => (
          <div 
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            className={`bg-white dark:bg-slate-800 rounded-2xl p-4 border transition-all cursor-pointer ${
              selectedId === s.id 
                ? 'border-primary-500 ring-1 ring-primary-500 shadow-md' 
                : 'border-slate-200 dark:border-slate-700 shadow-sm hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${selectedId === s.id ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{s.shipment_id}</h3>
                  <p className="text-xs text-slate-500">{s.vehicle_number} • {s.driver_name}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-emerald-600 font-bold text-sm">
                  <Activity className="w-3 h-3" />
                  {s.latitude ? '65' : '0'} km/h
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Updated {new Date(s.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
            
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary-500" />
                <div className="overflow-hidden">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Origin</p>
                  <p className="text-xs font-medium truncate">{s.origin || 'Unknown'}</p>
                </div>
              </div>
              <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-500" />
                <div className="overflow-hidden">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Destination</p>
                  <p className="text-xs font-medium truncate">{s.destination || 'Unknown'}</p>
                </div>
              </div>
            </div>

            {selectedId === s.id && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex gap-2 animate-fade-in">
                <button className="flex-1 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl text-xs font-bold hover:bg-primary-100 transition-all">
                  View Details
                </button>
                <button className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  <Shield className="w-3 h-3" />
                  Contact Driver
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
