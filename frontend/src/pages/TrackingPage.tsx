import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Truck, RefreshCw, Navigation, Search, Activity, Shield, Phone, ChevronRight, Package, Clock, X } from 'lucide-react'
import { shipmentsSupabaseApi } from '../services/supabaseApi'
import { supabase } from '../lib/supabase'
import MapView from '../components/MapView'
import toast from 'react-hot-toast'

interface ShipmentLocation {
  id: string
  shipment_id: string
  latitude: number | null
  longitude: number | null
  driver_name: string | null
  driver_phone?: string | null
  vehicle_number: string | null
  origin: string
  destination: string
  status: string
  updated_at: string
  customer_id?: string
  total_weight?: number
  total_volume?: number
}

export default function TrackingPage() {
  const navigate = useNavigate()
  const [shipments, setShipments] = useState<ShipmentLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<ShipmentLocation | null>(null)

  useEffect(() => {
    fetchActiveShipments()
    
    // Subscribe to realtime updates
    const subscription = supabase
      .channel('shipments-tracking')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'shipments' },
        (payload) => {
          console.log('Realtime update:', payload)
          fetchActiveShipments()
        }
      )
      .subscribe()
    
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const fetchActiveShipments = async () => {
    try {
      setLoading(true)
      const data = await shipmentsSupabaseApi.getAll({ status: 'in_transit' })
      
      // Map data to our interface format
      const mappedData: ShipmentLocation[] = data.map((s: any) => ({
        id: s.id,
        shipment_id: s.shipment_id || s.id.slice(0, 8).toUpperCase(),
        latitude: s.latitude,
        longitude: s.longitude,
        driver_name: s.driver_name,
        driver_phone: s.driver_phone,
        vehicle_number: s.vehicle_number,
        origin: s.origin,
        destination: s.destination,
        status: s.status,
        updated_at: s.updated_at,
        customer_id: s.customer_id,
        total_weight: s.total_weight,
        total_volume: s.total_volume
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
            driver_phone: '+919876543210',
            vehicle_number: 'MH-01-AX-1234',
            origin: 'Mumbai',
            destination: 'Pune',
            status: 'in_transit',
            updated_at: new Date().toISOString(),
            total_weight: 1500,
            total_volume: 12.5
          },
          {
            id: 'mock-2',
            shipment_id: 'SHP-1002',
            latitude: 28.6139,
            longitude: 77.2090,
            driver_name: 'Amit Singh',
            driver_phone: '+919876543211',
            vehicle_number: 'DL-01-CZ-5678',
            origin: 'Delhi',
            destination: 'Jaipur',
            status: 'in_transit',
            updated_at: new Date().toISOString(),
            total_weight: 2200,
            total_volume: 18.3
          },
          {
            id: 'mock-3',
            shipment_id: 'SHP-1003',
            latitude: 12.9716,
            longitude: 77.5946,
            driver_name: 'Kumar Reddy',
            driver_phone: '+919876543212',
            vehicle_number: 'KA-01-AB-9876',
            origin: 'Bangalore',
            destination: 'Chennai',
            status: 'in_transit',
            updated_at: new Date().toISOString(),
            total_weight: 1800,
            total_volume: 15.2
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

  const handleContactDriver = (phone?: string) => {
    if (phone) {
      window.open(`tel:${phone}`, '_self')
    } else {
      toast.error('Driver phone number not available')
    }
  }

  const handleViewDetails = (shipment: ShipmentLocation) => {
    setSelectedShipment(shipment)
    setShowDetailModal(true)
  }

  const filteredShipments = shipments.filter(s => 
    s.shipment_id.toLowerCase().includes(search.toLowerCase()) ||
    (s.driver_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (s.vehicle_number?.toLowerCase() || '').includes(search.toLowerCase())
  )

  // Prepare markers for the map
  const mapMarkers = shipments
    .filter(s => s.latitude && s.longitude)
    .map(s => ({
      id: s.id,
      position: [s.latitude!, s.longitude!] as [number, number],
      label: s.shipment_id,
      type: 'truck' as const,
      popupContent: (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            <span className="font-medium">Driver:</span> {s.driver_name || 'Unknown'}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium">Vehicle:</span> {s.vehicle_number || 'Unknown'}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium">Route:</span> {s.origin} → {s.destination}
          </p>
          <div className="flex gap-2 mt-3">
            <button 
              onClick={() => handleViewDetails(s)}
              className="flex-1 px-3 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700"
            >
              View Details
            </button>
            {s.driver_phone && (
              <button 
                onClick={() => handleContactDriver(s.driver_phone || undefined)}
                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
              >
                <Phone className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )
    }))

  // Calculate map center based on markers
  const mapCenter = mapMarkers.length > 0 
    ? mapMarkers[0].position 
    : [20.5937, 78.9629] as [number, number]

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
      
      {/* Real Map View */}
      <MapView
        markers={mapMarkers}
        center={mapCenter}
        zoom={mapMarkers.length > 0 ? 6 : 5}
        height="350px"
        showFullscreen={true}
        onMarkerClick={(marker) => {
          const shipment = shipments.find(s => s.id === marker.id)
          if (shipment) {
            setSelectedId(shipment.id)
          }
        }}
      />
      
      {/* Shipment List */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-900 dark:text-white">Active Shipments</h3>
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
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewDetails(s)
                  }}
                  className="flex-1 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl text-xs font-bold hover:bg-primary-100 transition-all"
                >
                  View Details
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleContactDriver(s.driver_phone || undefined)
                  }}
                  disabled={!s.driver_phone}
                  className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Phone className="w-3 h-3" />
                  Contact Driver
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Shipment Detail Modal */}
      {showDetailModal && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedShipment.shipment_id}</h2>
                <p className="text-xs text-slate-500">Shipment Details</p>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Route Info */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">From</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedShipment.origin}</p>
                  </div>
                  <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-full">
                    <ChevronRight className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">To</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedShipment.destination}</p>
                  </div>
                </div>
              </div>

              {/* Driver Info */}
              <div className="flex items-center gap-4 p-4 border border-slate-200 dark:border-slate-700 rounded-2xl">
                <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
                  <Shield className="w-6 h-6 text-slate-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900 dark:text-white">{selectedShipment.driver_name || 'Unknown Driver'}</p>
                  <p className="text-sm text-slate-500">{selectedShipment.vehicle_number}</p>
                </div>
                {selectedShipment.driver_phone && (
                  <button
                    onClick={() => handleContactDriver(selectedShipment.driver_phone || undefined)}
                    className="p-3 bg-green-600 text-white rounded-xl hover:bg-green-700"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Cargo Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                  <Package className="w-5 h-5 text-slate-400 mb-2" />
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Weight</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedShipment.total_weight ? `${selectedShipment.total_weight} kg` : 'N/A'}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                  <Clock className="w-5 h-5 text-slate-400 mb-2" />
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Volume</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedShipment.total_volume ? `${selectedShipment.total_volume} m³` : 'N/A'}</p>
                </div>
              </div>

              {/* Current Location */}
              {selectedShipment.latitude && selectedShipment.longitude && (
                <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl">
                  <p className="text-[10px] uppercase text-slate-400 font-bold mb-2">Current Location</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Lat: {selectedShipment.latitude.toFixed(6)}, Lng: {selectedShipment.longitude.toFixed(6)}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex gap-3">
              <button 
                onClick={() => setShowDetailModal(false)}
                className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  setShowDetailModal(false)
                  navigate(`/tracking`)
                }}
                className="flex-[2] px-4 py-3 bg-primary-600 text-white rounded-2xl font-medium hover:bg-primary-700 shadow-lg shadow-primary-600/20 transition-all"
              >
                Track on Map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
