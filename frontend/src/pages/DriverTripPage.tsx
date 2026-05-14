import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Navigation, MapPin, CheckCircle2, Truck, PhoneCall,
  KeyRound, Camera, AlertTriangle, RefreshCw, ArrowLeft,
  Package, Flag
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  buildJobProgressStatePatch,
  persistDriverJobProgressRpc,
  type JobProgressResult,
} from '../services/driverTripProgress'
import { useAuthStore } from '../stores/authStore'
import { useParams, useNavigate } from 'react-router-dom'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface ShipmentInfo {
  shipment_id: string
  origin: string
  destination: string
  total_weight: number
  estimated_cost: number
  customer_id: string | null
}

interface TripJob {
  id: string
  shipment_id: string
  status: string
  pickup_otp: string | null
  delivery_otp: string | null
  photo_loading_url: string | null
  photo_delivery_url: string | null
  pickup_arrived_at: string | null
  journey_started_at: string | null
  delivery_arrived_at: string | null
  delivered_at: string | null
  shipments: ShipmentInfo | null
}

interface DriverRecord {
  id: string
  full_name: string
  active_job_id: string | null
  total_trips: number | null
}

type TripStep = 'navigate' | 'pickup_otp' | 'loading_photo' | 'in_transit' | 'destination_otp' | 'delivery_photo' | 'complete'

const STEPS: { key: TripStep; label: string }[] = [
  { key: 'navigate', label: 'Navigate' },
  { key: 'pickup_otp', label: 'Pickup OTP' },
  { key: 'loading_photo', label: 'Load Photo' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'destination_otp', label: 'Delivery OTP' },
  { key: 'delivery_photo', label: 'Proof Photo' },
  { key: 'complete', label: 'Done' },
]

function statusToStep(status: string): TripStep {
  switch (status) {
    case 'accepted': return 'navigate'
    case 'pickup_arrived': return 'pickup_otp'
    case 'in_transit': return 'in_transit'
    case 'delivery_arrived': return 'destination_otp'
    case 'delivered': return 'complete'
    default: return 'navigate'
  }
}

export default function DriverTripPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [job, setJob] = useState<TripJob | null>(null)
  const [driver, setDriver] = useState<DriverRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<TripStep>('navigate')
  const [otpInput, setOtpInput] = useState('')
  const [otpError, setOtpError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle')
  const [gpsMessage, setGpsMessage] = useState('GPS tracking will start when the journey begins.')
  const [lastLocationUpdateAt, setLastLocationUpdateAt] = useState<string | null>(null)

  // GPS tracking refs
  const watchIdRef = useRef<number | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const fetchTrip = useCallback(async () => {
    if (!jobId || !user?.id) return
    const { data: driverData } = await supabase
      .from('drivers')
      .select('id, full_name, active_job_id, total_trips')
      .eq('user_id', user.id)
      .maybeSingle()
    setDriver(driverData)
    if (!driverData) return // no driver profile yet

    const { data: jobData, error } = await supabase
      .from('job_offers')
      .select(`
        id, shipment_id, status, pickup_otp, delivery_otp,
        photo_loading_url, photo_delivery_url,
        pickup_arrived_at, journey_started_at, delivery_arrived_at, delivered_at,
        shipments(shipment_id, origin, destination, total_weight, estimated_cost, customer_id)
      `)
      .eq('id', jobId)
      .eq('driver_id', driverData.id) // ownership check: prevent IDOR
      .maybeSingle()

    if (error) {
      toast.error('Failed to load trip details')
      setLoading(false)
      return
    }
    if (jobData) {
      const safeJob = {
        ...jobData,
        shipments: Array.isArray(jobData.shipments)
          ? (jobData.shipments[0] as ShipmentInfo) || null
          : (jobData.shipments as unknown as ShipmentInfo) || null,
      }
      setJob(safeJob as TripJob)
      setStep(statusToStep(jobData.status))
    }
    setLoading(false)
  }, [jobId, user?.id])

  useEffect(() => {
    fetchTrip()
  }, [fetchTrip])

  const upsertDriverLocation = useCallback(async (position: GeolocationPosition) => {
    if (!driver?.id) {
      return
    }

    const payload = {
      driver_id: driver.id,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      heading: position.coords.heading ?? null,
      speed_kmh: position.coords.speed != null ? position.coords.speed * 3.6 : null,
      accuracy_m: position.coords.accuracy,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('driver_locations').upsert(payload)

    if (error) {
      logger.error('[DriverTripPage] driver location upsert failed', error)
      setGpsStatus('error')
      setGpsMessage('Location sharing could not be saved. Please retry with GPS enabled.')
      return
    }

    setGpsStatus('active')
    setGpsMessage('Live location is being shared with the customer and agency.')
    setLastLocationUpdateAt(payload.updated_at)
  }, [driver?.id])

  const handleGeolocationError = useCallback((error: GeolocationPositionError) => {
    logger.error('[DriverTripPage] geolocation failed', error)
    setGpsStatus('error')

    switch (error.code) {
      case error.PERMISSION_DENIED:
        setGpsMessage('Location permission is blocked. Enable GPS permission for live tracking.')
        break
      case error.POSITION_UNAVAILABLE:
        setGpsMessage('Current location is unavailable. Move to a better-signal area and retry.')
        break
      case error.TIMEOUT:
        setGpsMessage('Location lookup timed out. Keep GPS on and try again.')
        break
      default:
        setGpsMessage('Live location could not start. Check GPS and internet, then retry.')
        break
    }
  }, [])

  // GPS tracking when in_transit
  useEffect(() => {
    if (step !== 'in_transit' || !driver?.id) {
      if (step !== 'in_transit') {
        setGpsStatus('idle')
        setGpsMessage('GPS tracking will start when the journey begins.')
      }
      return
    }

    if (!navigator.geolocation) {
      setGpsStatus('error')
      setGpsMessage('This device does not support browser geolocation for live tracking.')
      return
    }

    setGpsStatus('starting')
    setGpsMessage('Starting live GPS tracking...')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void upsertDriverLocation(position)
      },
      handleGeolocationError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    )

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void upsertDriverLocation(position)
      },
      handleGeolocationError,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [driver?.id, handleGeolocationError, step, upsertDriverLocation])

  const persistJobProgress = async (newStatus?: string | null, extra: Record<string, unknown> = {}) => {
    if (!job?.id) return false
    setSubmitting(true)
    let result: JobProgressResult | null = null
    let error: unknown
    try {
      const rpcResult = await persistDriverJobProgressRpc({
        jobOfferId: job.id,
        newStatus,
        extra,
      })
      result = rpcResult.data
      error = rpcResult.error
    } finally {
      setSubmitting(false)
    }
    if (error) {
      logger.error('[DriverTripPage]', error)
      toast.error('Failed to update trip status.')
      return false
    }

    if (!result) {
      return false
    }

    const { jobPatch, driverPatch } = buildJobProgressStatePatch(result)

    setJob(current => current ? {
      ...current,
      ...jobPatch,
    } : current)

    setDriver(current => current ? {
      ...current,
      ...driverPatch,
    } : current)

    return result
  }

  const handleArrivedAtPickup = async () => {
    const result = await persistJobProgress('pickup_arrived', {
      pickup_arrived_at: new Date().toISOString(),
    })
    if (result) {
      setStep('pickup_otp')
      toast.success('Arrived at pickup — enter customer OTP')
    }
  }

  const handlePickupOTP = async () => {
    setOtpError('')
    if (!job?.pickup_otp) {
      toast.error('OTP not available — contact support')
      return
    }
    if (otpInput.trim() !== job.pickup_otp.trim()) {
      setOtpError('Incorrect OTP. Ask the customer for the correct code.')
      return
    }
    setStep('loading_photo')
    setOtpInput('')
    toast.success('OTP verified ✓')
  }

  const handleStartJourney = async () => {
    const result = await persistJobProgress('in_transit', {
      journey_started_at: new Date().toISOString(),
    })
    if (result) {
      setStep('in_transit')
      toast.success('Journey started — GPS tracking active')
    }
  }

  const handleArrivedAtDestination = async () => {
    const result = await persistJobProgress('delivery_arrived', {
      delivery_arrived_at: new Date().toISOString(),
    })
    if (result) {
      // Stop GPS
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setStep('destination_otp')
      toast.success('Arrived at destination — enter recipient OTP')
    }
  }

  const handleDeliveryOTP = async () => {
    setOtpError('')
    if (!job?.delivery_otp) {
      toast.error('Delivery OTP not available — contact support')
      return
    }
    if (otpInput.trim() !== job.delivery_otp.trim()) {
      setOtpError('Incorrect OTP. Ask the recipient for the correct code.')
      return
    }
    setStep('delivery_photo')
    setOtpInput('')
    toast.success('Delivery OTP verified ✓')
  }

  const uploadPhoto = async (file: File, field: 'photo_loading_url' | 'photo_delivery_url'): Promise<string | null> => {
    if (!job?.id || !driver?.id) return null
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${driver.id}/${job.id}/${field}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('trip-photos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) {
        logger.error('[DriverTripPage] trip photo upload failed', uploadError)
        return null
      }
      const { data: urlData } = supabase.storage.from('trip-photos').getPublicUrl(path)
      const publicUrl = urlData?.publicUrl || null
      if (publicUrl) {
        const saved = await persistJobProgress(null, { [field]: publicUrl })
        if (!saved) {
          return null
        }
      }
      return publicUrl
    } finally {
      setUploading(false)
    }
  }

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>, field: 'photo_loading_url' | 'photo_delivery_url') => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    const uploadedPhotoUrl = await uploadPhoto(file, field)
    if (!uploadedPhotoUrl) {
      toast.error('Photo upload failed. Please retry before continuing.')
      return
    }
    toast.success('Photo captured!')
  }

  const handleCompleteDelivery = async () => {
    const result = await persistJobProgress('delivered', {
      delivered_at: new Date().toISOString(),
    })
    if (result) {
      setStep('complete')
      toast.success('🎉 Delivery complete! Great job.')
      navigate('/driver/dashboard')
    }
  }

  const openMaps = (address: string) => {
    const encoded = encodeURIComponent(address)
    const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`
    window.open(directionsUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <RefreshCw className="animate-spin text-blue-600" size={32} />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-900">
        <AlertTriangle size={48} className="text-amber-400 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Trip Not Found</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">This job may have been cancelled or expired.</p>
        <button
          onClick={() => navigate('/driver/dashboard')}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const currentStepIdx = STEPS.findIndex(s => s.key === step)
  const shipment = job.shipments

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/driver/dashboard')}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Active Trip</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {shipment?.shipment_id || job.id.slice(-8)}
          </p>
        </div>
        <a
          href="tel:18001234567"
          className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-xs font-semibold"
        >
          <PhoneCall size={14} />
          Support
        </a>
      </div>

      {/* Progress Steps */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 py-3 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {STEPS.map((s, idx) => (
            <div key={s.key} className="flex items-center gap-1">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${idx < currentStepIdx
                ? 'bg-green-500 text-white'
                : idx === currentStepIdx
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                }`}>
                {idx < currentStepIdx ? '✓' : idx + 1}
              </div>
              <span className={`text-xs ${idx === currentStepIdx
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-400'
                }`}>
                {s.label}
              </span>
              {idx < STEPS.length - 1 && (
                <div className={`w-4 h-0.5 rounded ${idx < currentStepIdx ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-4 max-w-md md:max-w-5xl mx-auto">
        {/* Shipment Info Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Package size={16} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Shipment Details</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Pickup</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {shipment?.origin || 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Destination</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {shipment?.destination || 'N/A'}
                </p>
              </div>
            </div>
            {shipment?.total_weight != null && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">
                <Truck size={12} />
                <span>{shipment.total_weight} kg</span>
                {shipment.estimated_cost > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-green-600 font-semibold">{formatCurrency(shipment.estimated_cost)}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ====== STEP: Navigate to Pickup ====== */}
        {step === 'navigate' && (
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-800/40">
              <div className="flex items-center gap-2 mb-3">
                <Navigation size={18} className="text-blue-600" />
                <span className="font-semibold text-blue-800 dark:text-blue-300">Navigate to Pickup</span>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
                Drive to the pickup location and tap "Arrived at Pickup" when you reach there.
              </p>
              {shipment?.origin && (
                <button
                  onClick={() => openMaps(shipment.origin)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm"
                >
                  <Navigation size={16} />
                  Open in Google Maps
                </button>
              )}
            </div>
            <button
              disabled={submitting}
              onClick={handleArrivedAtPickup}
              className="w-full flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl font-bold text-base disabled:opacity-60"
            >
              <MapPin size={20} />
              {submitting ? 'Updating...' : 'Arrived at Pickup'}
            </button>
          </div>
        )}

        {/* ====== STEP: Pickup OTP ====== */}
        {step === 'pickup_otp' && (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/40">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={18} className="text-amber-600" />
                <span className="font-semibold text-amber-800 dark:text-amber-300">Enter Pickup OTP</span>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Ask the sender for the 4-digit OTP shown in their TruckOpti app.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                4-Digit OTP from Sender
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="0000"
                value={otpInput}
                onChange={e => {
                  setOtpError('')
                  const digits = e.target.value.replace(/\D/g, '')
                  if (digits.length <= 4) setOtpInput(digits)
                }}
                className={`w-full text-center text-3xl font-bold tracking-widest border-2 rounded-2xl py-4 focus:outline-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors ${otpError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-slate-200 dark:border-slate-600 focus:border-blue-500'
                  }`}
              />
              {otpError && (
                <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {otpError}
                </p>
              )}
              <button
                disabled={otpInput.length !== 4}
                onClick={handlePickupOTP}
                className="w-full mt-4 py-3.5 bg-green-600 text-white rounded-2xl font-bold disabled:opacity-40"
              >
                Verify OTP
              </button>
            </div>
          </div>
        )}

        {/* ====== STEP: Loading Photo ====== */}
        {step === 'loading_photo' && (
          <div className="space-y-3">
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-4 border border-violet-200 dark:border-violet-800/40">
              <div className="flex items-center gap-2 mb-2">
                <Camera size={18} className="text-violet-600" />
                <span className="font-semibold text-violet-800 dark:text-violet-300">Capture Loading Photo</span>
              </div>
              <p className="text-sm text-violet-700 dark:text-violet-400">
                Take a clear photo of the goods being loaded. This protects you in case of disputes.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm text-center">
              {photoPreview || job.photo_loading_url ? (
                <img
                  src={photoPreview || job.photo_loading_url!}
                  alt="Loading photo"
                  className="w-full h-48 object-cover rounded-xl mb-3"
                />
              ) : (
                <div className="w-full h-40 rounded-xl bg-slate-100 dark:bg-slate-700 flex flex-col items-center justify-center mb-3">
                  <Camera size={32} className="text-slate-400 mb-2" />
                  <p className="text-xs text-slate-400">No photo taken yet</p>
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handlePhotoCapture(e, 'photo_loading_url')}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
              >
                <Camera size={16} />
                {uploading ? 'Uploading...' : (photoPreview || job.photo_loading_url) ? 'Retake Photo' : 'Take Photo'}
              </button>
              {!job.photo_loading_url && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Upload a loading photo before you can start the journey.
                </p>
              )}
            </div>
            <button
              disabled={submitting || !job.photo_loading_url}
              onClick={() => { setPhotoPreview(null); handleStartJourney() }}
              className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-60"
            >
              <Truck size={20} />
              {submitting ? 'Starting...' : 'Start Journey 🚛'}
            </button>
          </div>
        )}

        {/* ====== STEP: In Transit ====== */}
        {step === 'in_transit' && (
          <div className="space-y-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-5 border border-green-200 dark:border-green-800/40 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-3">
                <Truck size={32} className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-green-800 dark:text-green-300 mb-1">Journey in Progress</h3>
              <p className="text-sm text-green-700 dark:text-green-400">
                GPS location is being shared with the customer in real-time.
              </p>
            </div>
            <div className={`rounded-2xl border p-4 ${gpsStatus === 'error'
              ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20'
              : gpsStatus === 'active'
                ? 'border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/20'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
              }`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">GPS status</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{gpsMessage}</p>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${gpsStatus === 'error'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : gpsStatus === 'active'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                  {gpsStatus === 'active' ? 'Active' : gpsStatus === 'starting' ? 'Starting' : gpsStatus === 'error' ? 'Attention needed' : 'Idle'}
                </span>
              </div>
              {lastLocationUpdateAt && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Last location sync: {new Date(lastLocationUpdateAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
            </div>
            {shipment?.destination && (
              <button
                onClick={() => openMaps(shipment.destination)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm shadow-sm"
              >
                <Navigation size={16} />
                Navigate to Destination
              </button>
            )}
            <button
              disabled={submitting}
              onClick={handleArrivedAtDestination}
              className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-60"
            >
              <Flag size={20} />
              {submitting ? 'Updating...' : 'Arrived at Destination'}
            </button>
          </div>
        )}

        {/* ====== STEP: Destination OTP ====== */}
        {step === 'destination_otp' && (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/40">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={18} className="text-amber-600" />
                <span className="font-semibold text-amber-800 dark:text-amber-300">Enter Delivery OTP</span>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Ask the recipient for the 4-digit OTP shown in their TruckOpti app to confirm delivery.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                4-Digit OTP from Recipient
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="0000"
                value={otpInput}
                onChange={e => {
                  setOtpError('')
                  const digits = e.target.value.replace(/\D/g, '')
                  if (digits.length <= 4) setOtpInput(digits)
                }}
                className={`w-full text-center text-3xl font-bold tracking-widest border-2 rounded-2xl py-4 focus:outline-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors ${otpError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-slate-200 dark:border-slate-600 focus:border-blue-500'
                  }`}
              />
              {otpError && (
                <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {otpError}
                </p>
              )}
              <button
                disabled={otpInput.length !== 4}
                onClick={handleDeliveryOTP}
                className="w-full mt-4 py-3.5 bg-green-600 text-white rounded-2xl font-bold disabled:opacity-40"
              >
                Verify OTP
              </button>
            </div>
          </div>
        )}

        {/* ====== STEP: Delivery Photo ====== */}
        {step === 'delivery_photo' && (
          <div className="space-y-3">
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-4 border border-violet-200 dark:border-violet-800/40">
              <div className="flex items-center gap-2 mb-2">
                <Camera size={18} className="text-violet-600" />
                <span className="font-semibold text-violet-800 dark:text-violet-300">Proof of Delivery</span>
              </div>
              <p className="text-sm text-violet-700 dark:text-violet-400">
                Take a photo of the delivered goods at the destination. This is your proof of delivery.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm text-center">
              {photoPreview || job.photo_delivery_url ? (
                <img
                  src={photoPreview || job.photo_delivery_url!}
                  alt="Delivery photo"
                  className="w-full h-48 object-cover rounded-xl mb-3"
                />
              ) : (
                <div className="w-full h-40 rounded-xl bg-slate-100 dark:bg-slate-700 flex flex-col items-center justify-center mb-3">
                  <Camera size={32} className="text-slate-400 mb-2" />
                  <p className="text-xs text-slate-400">No photo taken yet</p>
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handlePhotoCapture(e, 'photo_delivery_url')}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
              >
                <Camera size={16} />
                {uploading ? 'Uploading...' : (photoPreview || job.photo_delivery_url) ? 'Retake Photo' : 'Take Photo'}
              </button>
              {!job.photo_delivery_url && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Upload proof of delivery before you can complete the trip.
                </p>
              )}
            </div>
            <button
              disabled={submitting || !job.photo_delivery_url}
              onClick={() => { setPhotoPreview(null); handleCompleteDelivery() }}
              className="w-full flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl font-bold text-base disabled:opacity-60"
            >
              <CheckCircle2 size={20} />
              {submitting ? 'Completing...' : 'Complete Delivery ✓'}
            </button>
          </div>
        )}

        {/* ====== STEP: Complete ====== */}
        {step === 'complete' && (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={44} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Delivery Complete!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
              Great work! Your earnings will be credited within 24 hours.
            </p>
            <button
              onClick={() => navigate('/driver/dashboard')}
              className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold"
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
