import { useState, useEffect } from 'react'
import { useLanguageStore } from '../stores/languageStore'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin, Truck, RefreshCw, Navigation, Search, Shield, Phone, ChevronRight, Package, Clock, X, MessageCircle, FileText, MapPinOff, CheckCircle2, Trash2, Loader2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { shipmentsSupabaseApi, notificationsSupabaseApi, saleOrdersSupabaseApi } from '../services/supabaseApi'
import { supabase } from '../lib/supabase'
import MapViewWrapper from '../components/MapViewWrapper'
import EmptyState from '../components/EmptyState'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { shareTrackingLink } from '../utils/whatsappShare'

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
  speed?: number
  sale_order_id?: string | null
}

interface JobOffer {
  pickup_otp: string | null
  delivery_otp: string | null
  status: string
  drivers?: { full_name: string }
  photo_loading_url?: string | null
  photo_delivery_url?: string | null
}

const fetchActiveShipments = async (): Promise<ShipmentLocation[]> => {
  const data = await shipmentsSupabaseApi.getAll()

  const mappedData: ShipmentLocation[] = data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shipmentsApi returns untyped DB rows
    .map((s: any) => ({
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
      total_volume: s.total_volume,
      sale_order_id: s.sale_order_id || null
    }))

  if (mappedData.length === 0) {
    return []
  }

  return mappedData
}

export default function TrackingPage() {
  const { language } = useLanguageStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_transit' | 'delivered' | 'cancelled'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<ShipmentLocation | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [jobOffer, setJobOffer] = useState<JobOffer | null>(null)
  const [loadingOTP, setLoadingOTP] = useState(false)
  const [jobPhotos, setJobPhotos] = useState<{ loading_url?: string; delivery_url?: string } | null>(null)
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null)

  const {
    data: shipments = [],
    isLoading: loading,
    isError: loadError,
    refetch
  } = useQuery({
    queryKey: ['shipments'],
    queryFn: fetchActiveShipments,
  })

  useEffect(() => {
    document.title = language === 'en' ? 'Live Tracking - TruckOpti' : 'लाइव ट्रैकिंग - TruckOpti'
  }, [language])

  useEffect(() => {
    const shipmentId = searchParams.get('shipment')
    if (!shipmentId || shipments.length === 0) return

    const matchedShipment = shipments.find((shipment) => shipment.id === shipmentId)
    if (matchedShipment) {
      setSelectedId(matchedShipment.id)
    }
  }, [searchParams, shipments])

  // Subscribe to realtime updates
  useEffect(() => {
    const subscription = supabase
      .channel('shipments-tracking')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shipments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['shipments'] })
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [queryClient])

  // Fetch job offer OTP and photos when modal opens
  useEffect(() => {
    if (!showDetailModal || !selectedShipment) {
      setJobOffer(null)
      setJobPhotos(null)
      setLoadingOTP(false)
      return
    }

    let isActive = true

    const loadJobOffer = async () => {
      setLoadingOTP(true)

      try {
        const { data, error } = await supabase
          .from('job_offers')
          .select('pickup_otp, delivery_otp, status, drivers(full_name), photo_loading_url, photo_delivery_url')
          .eq('shipment_id', selectedShipment.id)
          .in('status', ['pending', 'accepted', 'pickup_arrived', 'in_transit', 'delivery_arrived', 'delivered'])
          .limit(1)
          .maybeSingle()

        if (!isActive) return

        if (error) {
          logger.error('Error loading job offer details:', error)
          setJobOffer(null)
          setJobPhotos(null)
          toast.error(language === 'en' ? 'Failed to load shipment details' : 'शिपमेंट विवरण लोड करने में विफल')
          return
        }

        setJobOffer(data as JobOffer | null)
        setJobPhotos(data
          ? { loading_url: data.photo_loading_url, delivery_url: data.photo_delivery_url }
          : null)
      } catch (error) {
        if (!isActive) return
        logger.error('Unexpected error loading job offer details:', error)
        setJobOffer(null)
        setJobPhotos(null)
        toast.error(language === 'en' ? 'Failed to load shipment details' : 'शिपमेंट विवरण लोड करने में विफल')
      } finally {
        if (isActive) {
          setLoadingOTP(false)
        }
      }
    }

    void loadJobOffer()

    return () => {
      isActive = false
    }
  }, [showDetailModal, selectedShipment])

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

  const handleShareWhatsApp = (shipment: ShipmentLocation) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shareTrackingLink expects a superset of ShipmentLocation
    shareTrackingLink(shipment as any)
  }

  const handleGenerateInvoice = (shipmentId: string) => {
    navigate(`/invoice/${shipmentId}`)
  }

  const handleCancelShipment = async (shipment: ShipmentLocation) => {
    if (!confirm(`Cancel shipment ${shipment.shipment_id}? This cannot be undone.`)) return
    setUpdatingStatus(shipment.id)
    try {
      await shipmentsSupabaseApi.updateStatus(shipment.id, 'cancelled')
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      setSelectedId(null)
      toast.success('Shipment cancelled')
    } catch (err: unknown) {
      void err
      toast.error(language === 'en' ? 'Failed to cancel shipment' : 'शिपमेंट रद्द करने में विफल')
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleUpdateStatus = async (shipment: ShipmentLocation, newStatus: 'in_transit' | 'delivered') => {
    setUpdatingStatus(shipment.id)
    try {
      await shipmentsSupabaseApi.updateStatus(shipment.id, newStatus)
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      toast.success(newStatus === 'in_transit' ? 'Delivery started!' : 'Marked as delivered!')
      const notifTitle = newStatus === 'in_transit' ? 'Delivery Started' : 'Delivery Completed'
      const notifMsg = newStatus === 'in_transit'
        ? `Shipment ${shipment.shipment_id} is now in transit to ${shipment.destination}`
        : `Shipment ${shipment.shipment_id} delivered to ${shipment.destination} ✓`
      await notificationsSupabaseApi.create({
        title: notifTitle,
        message: notifMsg,
        type: newStatus === 'delivered' ? 'success' : 'info',
        action_url: `/tracking`,
        action_label: 'View Tracking'
      })
      if (newStatus === 'delivered' && shipment.sale_order_id) {
        try {
          await saleOrdersSupabaseApi.updateStatus(shipment.sale_order_id, 'completed')
        } catch { /* non-critical */ }
      }
    } catch (err: unknown) {
      void err
      toast.error(language === 'en' ? 'Failed to update status' : 'स्टेटस अपडेट करने में विफल')
    } finally {
      setUpdatingStatus(null)
    }
  }

  const filteredShipments = shipments.filter(s => {
    const matchesSearch = s.shipment_id.toLowerCase().includes(search.toLowerCase()) ||
      (s.driver_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (s.vehicle_number?.toLowerCase() || '').includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const activeShipmentCount = shipments.filter(s => s.status === 'pending' || s.status === 'in_transit').length

  const mapMarkers = shipments
    .filter(s => s.latitude && s.longitude && s.status === 'in_transit')
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
        </div>
      )
    }))

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
          onClick={() => refetch()}
          disabled={loading}
          className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-all"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {(['all', 'pending', 'in_transit', 'delivered', 'cancelled'] as const).map((s) => {
          const count = s === 'all' ? shipments.length : shipments.filter(sh => sh.status === s).length
          const labels: Record<string, string> = { all: 'All', pending: 'Pending', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }
          const colors: Record<string, string> = { all: 'bg-primary-600', pending: 'bg-amber-500', in_transit: 'bg-emerald-500', delivered: 'bg-blue-500', cancelled: 'bg-red-500' }
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${statusFilter === s
                ? `${colors[s]} text-white shadow-md`
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
            >
              {labels[s]}
              {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${statusFilter === s ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>{count}</span>}
            </button>
          )
        })}
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
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{activeShipmentCount} Active</span>
          </div>
        </div>
      </div>

      {/* Real Map View - only for in_transit shipments */}
      <MapViewWrapper
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
        <h3 className="font-semibold text-slate-900 dark:text-white">Shipments ({filteredShipments.length})</h3>
        {loadError ? (
          <EmptyState
            icon={MapPinOff}
            title="Failed to load shipments"
            description="Please check your connection and try again"
          />
        ) : filteredShipments.length === 0 ? (
          <EmptyState
            icon={MapPinOff}
            title="No active shipments"
            description={search ? 'Try adjusting your search filters' : 'Create a shipment from the Packing or Routes page to start tracking'}
          />
        ) : (
          filteredShipments.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`bg-white dark:bg-slate-800 rounded-2xl p-4 border transition-all cursor-pointer ${selectedId === s.id
                ? 'border-primary-500 ring-1 ring-primary-500 shadow-md'
                : 'border-slate-200 dark:border-slate-700 shadow-sm hover:border-slate-300'
                }`}
            >
              {/* Pending Status Card - Special UI */}
              {s.status === 'pending' && (
                <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      {language === 'en' ? 'Searching for drivers...' : 'ड्राइवर खोज रहे हैं...'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {language === 'en'
                      ? 'We are looking for available drivers for your shipment.'
                      : 'आपकी शिपमेंट के लिए उपलब्ध ड्राइवर खोज रहे हैं।'}
                  </p>
                </div>
              )}

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${s.status === 'in_transit' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' :
                    s.status === 'pending' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' :
                      s.status === 'cancelled' ? 'bg-red-100 text-red-600 dark:bg-red-900/30' :
                        'bg-blue-100 text-blue-600 dark:bg-blue-900/30'
                    }`}>
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{s.shipment_id}</h3>
                    <p className="text-xs text-slate-500">{s.vehicle_number} • {s.driver_name || (s.status === 'pending' ? (language === 'en' ? 'Searching...' : 'खोज रहे हैं...') : (language === 'en' ? 'No driver' : 'कोई ड्राइवर नहीं'))}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${s.status === 'in_transit' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                    s.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' :
                      s.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                    }`}>{s.status.replace('_', ' ')}</span>
                  {s.status === 'in_transit' && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {s.latitude ? (s.speed ? `${s.speed}` : '—') : '0'} km/h
                    </p>
                  )}
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
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-2 animate-fade-in">
                  {s.status === 'in_transit' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUpdateStatus(s, 'delivered') }}
                      disabled={updatingStatus === s.id}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {updatingStatus === s.id ? (language === 'en' ? 'Updating...' : 'अपडेट हो रहा है...') : (language === 'en' ? 'Mark Delivered' : 'डिलीवर हो गया')}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleViewDetails(s)
                      }}
                      className="flex-1 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl text-xs font-bold hover:bg-primary-100 transition-all"
                    >
                      {language === 'en' ? 'View Details' : 'विवरण देखें'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleContactDriver(s.driver_phone || undefined)
                      }}
                      disabled={!s.driver_phone || s.status === 'pending'}
                      className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Phone className="w-3 h-3" />
                      {language === 'en' ? 'Contact' : 'संपर्क'}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleShareWhatsApp(s)
                      }}
                      className="flex-1 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl text-xs font-bold hover:bg-green-100 transition-all flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="w-3 h-3" />
                      {language === 'en' ? 'Share' : 'शेयर'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleGenerateInvoice(s.id)
                      }}
                      className="flex-1 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl text-xs font-bold hover:bg-purple-100 transition-all flex items-center justify-center gap-2"
                    >
                      <FileText className="w-3 h-3" />
                      {language === 'en' ? 'Invoice' : 'चालान'}
                    </button>
                  </div>
                  {(s.status === 'pending' || s.status === 'in_transit') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancelShipment(s) }}
                      disabled={updatingStatus === s.id}
                      className="w-full py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2 border border-red-200 dark:border-red-800/50 disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      {language === 'en' ? 'Cancel Shipment' : 'शिपमेंट रद्द करें'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Shipment Detail Modal */}
      {showDetailModal && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedShipment.shipment_id}</h2>
                <p className="text-xs text-slate-500">{language === 'en' ? 'Shipment Details' : 'शिपमेंट विवरण'}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Pickup OTP - Show for pending/accepted/in_transit */}
              {selectedShipment.status !== 'delivered' && selectedShipment.status !== 'cancelled' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 p-4 rounded-2xl">
                  <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-2">
                    {language === 'en' ? '📋 Pickup OTP' : '📋 पिकअप OTP'}
                  </p>
                  {loadingOTP ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">{language === 'en' ? 'Loading...' : 'लोड हो रहा है...'}</span>
                    </div>
                  ) : jobOffer?.pickup_otp ? (
                    <>
                      <p className="text-3xl font-bold text-green-700 dark:text-green-300 tracking-widest text-center">
                        {jobOffer.pickup_otp}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 text-center mt-2">
                        {language === 'en'
                          ? 'Share this with the driver when they arrive'
                          : 'जब ड्राइवर आए तो इसे उनके साथ शेयर करें'}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-green-600 dark:text-green-400 text-center">
                      {language === 'en'
                        ? 'OTP will be generated when a driver accepts'
                        : 'जब ड्राइवर स्वीकार करेगा तब OTP बनाया जाएगा'}
                    </p>
                  )}
                </div>
              )}

              {/* Route Info */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">{language === 'en' ? 'From' : 'से'}</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedShipment.origin}</p>
                  </div>
                  <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-full">
                    <ChevronRight className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">{language === 'en' ? 'To' : 'तक'}</p>
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
                  <p className="font-medium text-slate-900 dark:text-white">
                    {selectedShipment.status === 'pending'
                      ? (language === 'en' ? 'Searching for driver...' : 'ड्राइवर खोज रहे हैं...')
                      : (jobOffer?.drivers?.full_name || selectedShipment.driver_name || (language === 'en' ? 'Unknown Driver' : 'अज्ञात ड्राइवर'))}
                  </p>
                  <p className="text-sm text-slate-500">{selectedShipment.vehicle_number || '—'}</p>
                </div>
                {selectedShipment.driver_phone && selectedShipment.status !== 'pending' && (
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
                  <p className="text-[10px] uppercase text-slate-400 font-bold">{language === 'en' ? 'Weight' : 'वजन'}</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedShipment.total_weight ? `${selectedShipment.total_weight} kg` : 'N/A'}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                  <Clock className="w-5 h-5 text-slate-400 mb-2" />
                  <p className="text-[10px] uppercase text-slate-400 font-bold">{language === 'en' ? 'Volume' : 'वॉल्यूम'}</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedShipment.total_volume ? `${selectedShipment.total_volume} m³` : 'N/A'}</p>
                </div>
              </div>

              {/* Current Location */}
              {selectedShipment.latitude && selectedShipment.longitude && selectedShipment.status === 'in_transit' && (
                <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl">
                  <p className="text-[10px] uppercase text-slate-400 font-bold mb-2">{language === 'en' ? 'Current Location' : 'वर्तमान स्थान'}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Lat: {selectedShipment.latitude.toFixed(6)}, Lng: {selectedShipment.longitude.toFixed(6)}
                  </p>
                </div>
              )}

              {/* Trip Photos */}
              {jobPhotos && (jobPhotos.loading_url || jobPhotos.delivery_url) && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">{language === 'en' ? 'Trip Photos' : 'यात्रा फोटो'}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {jobPhotos.loading_url && (
                      <div
                        onClick={() => setLightboxPhoto(jobPhotos.loading_url!)}
                        className="relative aspect-video bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      >
                        <img src={jobPhotos.loading_url} alt="Loading" className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                          <p className="text-xs text-white">{language === 'en' ? 'Loading' : 'लोडिंग'}</p>
                        </div>
                      </div>
                    )}
                    {jobPhotos.delivery_url && (
                      <div
                        onClick={() => setLightboxPhoto(jobPhotos.delivery_url!)}
                        className="relative aspect-video bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      >
                        <img src={jobPhotos.delivery_url} alt="Delivery" className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                          <p className="text-xs text-white">{language === 'en' ? 'Delivery' : 'डिलीवरी'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Book Another Truck CTA for delivered shipments */}
            {selectedShipment.status === 'delivered' && (
              <button
                onClick={() => { setShowDetailModal(false); navigate('/booking/new') }}
                className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 mb-3"
              >
                <Truck className="w-4 h-4" />
                {language === 'en' ? 'Book Another Truck' : 'एक और ट्रक बुक करें'}
              </button>
            )}

            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex gap-3">
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                {language === 'en' ? 'Close' : 'बंद करें'}
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  navigate(`/tracking`)
                }}
                className="flex-[2] px-4 py-3 bg-primary-600 text-white rounded-2xl font-medium hover:bg-primary-700 shadow-lg shadow-primary-600/20 transition-all"
              >
                {language === 'en' ? 'Track on Map' : 'मैप पर ट्रैक करें'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Photos Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={lightboxPhoto}
            alt="Trip photo"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
