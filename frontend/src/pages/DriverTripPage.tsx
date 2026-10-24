import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Navigation, MapPin, CheckCircle2, Truck, PhoneCall,
  KeyRound, Camera, AlertTriangle, RefreshCw, ArrowLeft,
  Package, Flag
} from 'lucide-react'
import { supabase, supabaseConfigResolution } from '../lib/supabase'
import { driverSupabaseApi, driverTripsApi } from '../services/supabaseApi'
import {
  buildJobProgressStatePatch,
  isJobProgressOk,
  resolveJobProgressFailureMessage,
  JOB_PROGRESS_RESULT_OTP_INCORRECT,
  JOB_PROGRESS_RESULT_OTP_LOCKED,
  persistDriverJobProgressRpc,
  type JobProgressResult,
} from '../services/driverTripProgress'
import { useAuthStore } from '../stores/authStore'
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL } from '../config/support'
import { useParams, useNavigate } from 'react-router-dom'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { resolveTripPhotoUrl } from '../services/tripPhotoUrl'

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

/** Shared keyboard-focus styling so every interactive control shows a visible ring (591699f3 refresh). */
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

/** GPS status chips pair an icon with the label so status is never color alone (591699f3 refresh). */
const GPS_STATUS_CHIPS: Record<string, { icon: typeof Navigation; label: string; classes: string }> = {
  active: { icon: Navigation, label: 'Active tracking', classes: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  starting: { icon: RefreshCw, label: 'Starting', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  error: { icon: AlertTriangle, label: 'Attention needed', classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  idle: { icon: MapPin, label: 'Idle', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
}

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
  const [verifiedPickupOtp, setVerifiedPickupOtp] = useState('')
  const [verifiedDeliveryOtp, setVerifiedDeliveryOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // 180752ea refresh: the last photo field whose upload failed — renders a
  // retryable alert on its card instead of leaving only a vanishing toast.
  const [uploadFailure, setUploadFailure] = useState<'photo_loading_url' | 'photo_delivery_url' | null>(null)
  // TO-142: persisted photo references are tokenless private-bucket URLs;
  // renders use freshly signed URLs resolved from the object path.
  const [resolvedLoadingPhoto, setResolvedLoadingPhoto] = useState<string | null>(null)
  const [resolvedDeliveryPhoto, setResolvedDeliveryPhoto] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle')
  const [gpsMessage, setGpsMessage] = useState('GPS tracking will start when the journey begins.')
  const [lastLocationUpdateAt, setLastLocationUpdateAt] = useState<string | null>(null)

  // GPS tracking refs
  const watchIdRef = useRef<number | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const fetchTrip = useCallback(async () => {
    if (!jobId || !user?.id) return
    const driverData = await driverSupabaseApi.getByUserId(user.id)
    if (!driverData) return // no driver profile yet
    setDriver({
      id: driverData.id,
      full_name: driverData.full_name,
      active_job_id: null,
      total_trips: driverData.total_trips,
    })

    const jobData = await driverTripsApi.getTripByIdForDriver(jobId, driverData.id)
    if (jobData) {
      const safeJob = {
        ...jobData,
        shipments: Array.isArray(jobData.shipments)
          ? (jobData.shipments[0] as ShipmentInfo) || null
          : (jobData.shipments as unknown as ShipmentInfo) || null,
      }
      setJob(safeJob as TripJob)
      setStep(statusToStep(String((jobData as Record<string, unknown>).status ?? 'accepted')))
    }
    setLoading(false)
  }, [jobId, user?.id])

  useEffect(() => {
    fetchTrip()
  }, [fetchTrip])

  // TO-142: mint fresh signed URLs for the persisted photo references so the
  // driver sees previously uploaded proof photos even after a reload (the
  // stored URLs are tokenless and the bucket is private).
  useEffect(() => {
    let active = true
    void resolveTripPhotoUrl(job?.photo_loading_url).then((signed) => {
      if (active) setResolvedLoadingPhoto(signed)
    })
    void resolveTripPhotoUrl(job?.photo_delivery_url).then((signed) => {
      if (active) setResolvedDeliveryPhoto(signed)
    })
    return () => {
      active = false
    }
  }, [job?.photo_loading_url, job?.photo_delivery_url])

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

    try {
      await driverSupabaseApi.upsertLocation(payload)
    } catch (error) {
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
    if (!job?.id) return null
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
      return null
    }

    if (!result || !isJobProgressOk(result)) {
      // The server rejected the call (e.g. wrong OTP or a locked code) and
      // returned the unchanged authoritative row; never patch local state.
      return result ?? null
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

  /** Shows the bounded server rejection and returns the user to the OTP step. */
  const handleProgressRejection = (result: JobProgressResult | null, otpStep: TripStep) => {
    toast.error(resolveJobProgressFailureMessage(result))
    if (
      result?.result_code === JOB_PROGRESS_RESULT_OTP_INCORRECT ||
      result?.result_code === JOB_PROGRESS_RESULT_OTP_LOCKED
    ) {
      setStep(otpStep)
      setOtpInput('')
      // Surface the bounded server rejection inline so it persists and is
      // announced by the OTP error live region (591699f3 refresh) — a toast
      // alone disappears before the driver can read it.
      setOtpError(resolveJobProgressFailureMessage(result))
      if (otpStep === 'pickup_otp') {
        setVerifiedPickupOtp('')
      } else {
        setVerifiedDeliveryOtp('')
      }
    }
  }

  const handleArrivedAtPickup = async () => {
    const result = await persistJobProgress('pickup_arrived')
    if (isJobProgressOk(result)) {
      setStep('pickup_otp')
      toast.success('Arrived at pickup — enter customer OTP')
    } else {
      handleProgressRejection(result, 'pickup_otp')
    }
  }

  const handlePickupOTP = async () => {
    setOtpError('')
    if (otpInput.trim().length !== 4) {
      setOtpError('Enter the 4-digit OTP from the customer.')
      return
    }
    setVerifiedPickupOtp(otpInput.trim())
    setStep('loading_photo')
    setOtpInput('')
    toast.success('OTP entered — continue with loading photo')
  }

  const handleStartJourney = async () => {
    if (!verifiedPickupOtp) {
      toast.error('Pickup OTP is required before starting the journey.')
      setStep('pickup_otp')
      return
    }
    const result = await persistJobProgress('in_transit', {
      pickup_otp: verifiedPickupOtp,
    })
    if (isJobProgressOk(result)) {
      setStep('in_transit')
      toast.success('Journey started — GPS tracking active')
    } else {
      handleProgressRejection(result, 'pickup_otp')
    }
  }

  const handleArrivedAtDestination = async () => {
    const result = await persistJobProgress('delivery_arrived')
    if (isJobProgressOk(result)) {
      // Stop GPS
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setStep('destination_otp')
      toast.success('Arrived at destination — enter recipient OTP')
    } else {
      handleProgressRejection(result, 'destination_otp')
    }
  }

  const handleDeliveryOTP = async () => {
    setOtpError('')
    if (otpInput.trim().length !== 4) {
      setOtpError('Enter the 4-digit OTP from the recipient.')
      return
    }
    setVerifiedDeliveryOtp(otpInput.trim())
    setStep('delivery_photo')
    setOtpInput('')
    toast.success('OTP entered — capture delivery photo')
  }

  const uploadPhoto = async (file: File, field: 'photo_loading_url' | 'photo_delivery_url'): Promise<string | null> => {
    if (!job?.id || !driver?.id || !user?.id) return null
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      // Storage RLS authorizes <auth user>/... (20260418002000); the server
      // additionally validates the reference against this job (TO-130).
      const path = `${user.id}/${job.id}/${field}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('trip-photos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) {
        logger.error('[DriverTripPage] trip photo upload failed', uploadError)
        return null
      }
      // TO-142: the trip-photos bucket is private — persist the canonical
      // tokenless object URL (same shape is_job_trip_photo_url accepts) and
      // let readers mint fresh expiring signed URLs from the object path.
      const supabaseUrl = supabaseConfigResolution.clientUrl.replace(/\/+$/, '')
      const objectUrl = `${supabaseUrl}/storage/v1/object/sign/trip-photos/${path}`
      const saved = await persistJobProgress(null, { [field]: objectUrl })
      if (!isJobProgressOk(saved)) {
        toast.error(resolveJobProgressFailureMessage(saved))
        return null
      }
      return objectUrl
    } finally {
      setUploading(false)
    }
  }

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>, field: 'photo_loading_url' | 'photo_delivery_url') => {
    const file = e.target.files?.[0]
    if (!file) return
    // A fresh attempt clears any previous failure banner.
    setUploadFailure(null)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    const uploadedPhotoUrl = await uploadPhoto(file, field)
    if (!uploadedPhotoUrl) {
      setUploadFailure(field)
      toast.error('Photo upload failed. Please retry before continuing.')
      return
    }
    toast.success('Photo captured!')
  }

  const handleCompleteDelivery = async () => {
    if (!verifiedDeliveryOtp) {
      toast.error('Delivery OTP is required before completing the trip.')
      setStep('destination_otp')
      return
    }
    const result = await persistJobProgress('delivered', {
      delivery_otp: verifiedDeliveryOtp,
    })
    if (isJobProgressOk(result)) {
      setStep('complete')
      toast.success('🎉 Delivery complete! Great job.')
      navigate('/driver/dashboard')
    } else {
      handleProgressRejection(result, 'destination_otp')
    }
  }

  const openMaps = (address: string) => {
    const encoded = encodeURIComponent(address)
    const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`
    window.open(directionsUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <RefreshCw className="animate-spin text-blue-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading trip…</span>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-900">
        <AlertTriangle size={48} className="text-amber-400 mb-4" aria-hidden="true" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Trip Not Found</h2>
        <p role="alert" className="text-slate-500 dark:text-slate-400 mb-6 text-sm">This job may have been cancelled or expired.</p>
        <button
          onClick={() => navigate('/driver/dashboard')}
          className={`min-h-[44px] bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold ${FOCUS_RING}`}
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
          aria-label="Back to dashboard"
          className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 ${FOCUS_RING}`}
        >
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" aria-hidden="true" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Active Trip</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {shipment?.shipment_id || job.id.slice(-8)}
          </p>
        </div>
        <a
          href={`tel:${SUPPORT_PHONE_TEL}`}
          aria-label={`Call support ${SUPPORT_PHONE_DISPLAY}`}
          className={`flex items-center gap-1.5 min-h-[44px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-xl text-xs font-semibold ${FOCUS_RING}`}
        >
          <PhoneCall size={14} aria-hidden="true" />
          Support
        </a>
      </div>

      {/* Progress Steps */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 py-3 overflow-x-auto">
        {/* Announces every step change to assistive tech (591699f3 refresh). */}
        <p aria-live="polite" className="sr-only">
          {`Step ${currentStepIdx + 1} of ${STEPS.length}: ${STEPS[currentStepIdx]?.label ?? ''}`}
        </p>
        <div className="flex items-center gap-1 min-w-max">
          {STEPS.map((s, idx) => (
            <div
              key={s.key}
              aria-current={idx === currentStepIdx ? 'step' : undefined}
              className="flex items-center gap-1"
            >
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
                <div className={`w-4 h-0.5 rounded ${idx < currentStepIdx ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700'}`} aria-hidden="true" />
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
                  className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm ${FOCUS_RING}`}
                >
                  <Navigation size={16} aria-hidden="true" />
                  Open in Google Maps
                </button>
              )}
            </div>
            <button
              disabled={submitting}
              onClick={handleArrivedAtPickup}
              className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-4 bg-green-600 text-white rounded-2xl font-bold text-base disabled:opacity-60 ${FOCUS_RING}`}
            >
              <MapPin size={20} aria-hidden="true" />
              {submitting ? 'Updating...' : 'Arrived at Pickup'}
            </button>
          </div>
        )}

        {/* ====== STEP: Pickup OTP ====== */}
        {step === 'pickup_otp' && (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/40">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={18} className="text-amber-600" aria-hidden="true" />
                <span className="font-semibold text-amber-800 dark:text-amber-300">Enter Pickup OTP</span>
              </div>
              <p id="pickup-otp-hint" className="text-sm text-amber-700 dark:text-amber-400">
                Ask the sender for the 4-digit OTP shown in their TruckOpti app.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
              <label htmlFor="pickup-otp-input" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                4-Digit OTP from Sender
              </label>
              <input
                id="pickup-otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="0000"
                value={otpInput}
                aria-describedby="pickup-otp-hint pickup-otp-error"
                aria-invalid={otpError ? true : undefined}
                onChange={e => {
                  setOtpError('')
                  const digits = e.target.value.replace(/\D/g, '')
                  if (digits.length <= 4) setOtpInput(digits)
                }}
                className={`w-full text-center text-3xl font-bold tracking-widest border-2 rounded-2xl py-4 focus:outline-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors ${otpError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-slate-200 dark:border-slate-600 focus:border-blue-500'
                  } ${FOCUS_RING}`}
              />
              <div id="pickup-otp-error" aria-live="assertive">
                {otpError && (
                  <p className="text-red-600 text-xs mt-2 flex items-center gap-1">
                    <AlertTriangle size={12} aria-hidden="true" />
                    {otpError}
                  </p>
                )}
              </div>
              <button
                disabled={otpInput.length !== 4}
                onClick={handlePickupOTP}
                className={`w-full mt-4 min-h-[44px] py-3.5 bg-green-600 text-white rounded-2xl font-bold disabled:opacity-40 ${FOCUS_RING}`}
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
              {photoPreview || resolvedLoadingPhoto ? (
                <img
                  src={photoPreview || resolvedLoadingPhoto!}
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
                aria-label="Take loading photo"
                onChange={e => handlePhotoCapture(e, 'photo_loading_url')}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-3 bg-violet-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 ${FOCUS_RING}`}
              >
                <Camera size={16} aria-hidden="true" />
                {uploading ? 'Uploading...' : (photoPreview || resolvedLoadingPhoto) ? 'Retake Photo' : 'Take Photo'}
              </button>
              {(photoPreview || resolvedLoadingPhoto) && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Stored in the secure private trip-photos bucket; the preview uses a fresh signed URL.
                </p>
              )}
              {!job.photo_loading_url && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Upload a loading photo before you can start the journey.
                </p>
              )}
            </div>
            <button
              disabled={submitting || !job.photo_loading_url}
              onClick={() => { setPhotoPreview(null); handleStartJourney() }}
              className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-4 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Truck size={20} aria-hidden="true" />
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
                {(() => {
                  const chip = GPS_STATUS_CHIPS[gpsStatus] ?? GPS_STATUS_CHIPS.idle
                  const ChipIcon = chip.icon
                  return (
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${chip.classes}`}>
                      <ChipIcon size={12} aria-hidden="true" />
                      {chip.label}
                    </span>
                  )
                })()}
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
                className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm shadow-sm ${FOCUS_RING}`}
              >
                <Navigation size={16} aria-hidden="true" />
                Navigate to Destination
              </button>
            )}
            <button
              disabled={submitting}
              onClick={handleArrivedAtDestination}
              className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-4 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Flag size={20} aria-hidden="true" />
              {submitting ? 'Updating...' : 'Arrived at Destination'}
            </button>
          </div>
        )}

        {/* ====== STEP: Destination OTP ====== */}
        {step === 'destination_otp' && (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/40">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={18} className="text-amber-600" aria-hidden="true" />
                <span className="font-semibold text-amber-800 dark:text-amber-300">Enter Delivery OTP</span>
              </div>
              <p id="delivery-otp-hint" className="text-sm text-amber-700 dark:text-amber-400">
                Ask the recipient for the 4-digit OTP shown in their TruckOpti app to confirm delivery.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
              <label htmlFor="delivery-otp-input" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                4-Digit OTP from Recipient
              </label>
              <input
                id="delivery-otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="0000"
                value={otpInput}
                aria-describedby="delivery-otp-hint delivery-otp-error"
                aria-invalid={otpError ? true : undefined}
                onChange={e => {
                  setOtpError('')
                  const digits = e.target.value.replace(/\D/g, '')
                  if (digits.length <= 4) setOtpInput(digits)
                }}
                className={`w-full text-center text-3xl font-bold tracking-widest border-2 rounded-2xl py-4 focus:outline-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors ${otpError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-slate-200 dark:border-slate-600 focus:border-blue-500'
                  } ${FOCUS_RING}`}
              />
              <div id="delivery-otp-error" aria-live="assertive">
                {otpError && (
                  <p className="text-red-600 text-xs mt-2 flex items-center gap-1">
                    <AlertTriangle size={12} aria-hidden="true" />
                    {otpError}
                  </p>
                )}
              </div>
              <button
                disabled={otpInput.length !== 4}
                onClick={handleDeliveryOTP}
                className={`w-full mt-4 min-h-[44px] py-3.5 bg-green-600 text-white rounded-2xl font-bold disabled:opacity-40 ${FOCUS_RING}`}
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
              {photoPreview || resolvedDeliveryPhoto ? (
                <img
                  src={photoPreview || resolvedDeliveryPhoto!}
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
                aria-label="Take delivery proof photo"
                onChange={e => handlePhotoCapture(e, 'photo_delivery_url')}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                aria-label={uploading
                  ? 'Uploading proof of delivery photo'
                  : (photoPreview || job.photo_delivery_url)
                    ? 'Retake proof of delivery photo'
                    : 'Capture proof of delivery photo'}
                className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-3 bg-violet-600 text-white rounded-xl font-semibold text-sm disabled:opacity-60 ${FOCUS_RING}`}
              >
                <Camera size={16} aria-hidden="true" />
                {uploading ? 'Uploading...' : (photoPreview || job.photo_delivery_url) ? 'Retake Photo' : 'Take Photo'}
              </button>
              {(photoPreview || resolvedDeliveryPhoto) && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Stored in the secure private trip-photos bucket; the preview uses a fresh signed URL.
                </p>
              )}
              {uploadFailure === 'photo_delivery_url' && (
                <div role="alert" className="mt-3 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/20 p-3">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle size={12} aria-hidden="true" />
                    Photo upload failed. Please retry before continuing.
                  </p>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className={`self-start min-h-[44px] px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold ${FOCUS_RING}`}
                  >
                    Retry Upload
                  </button>
                </div>
              )}
              {!job.photo_delivery_url && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Upload proof of delivery before you can complete the trip.
                </p>
              )}
            </div>
            <button
              disabled={submitting || !job.photo_delivery_url}
              onClick={() => { setPhotoPreview(null); handleCompleteDelivery() }}
              aria-label="Complete delivery"
              className={`w-full flex items-center justify-center gap-2 min-h-[44px] py-4 bg-green-600 text-white rounded-2xl font-bold text-base disabled:opacity-60 ${FOCUS_RING}`}
            >
              <CheckCircle2 size={20} aria-hidden="true" />
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
              className={`min-h-[44px] bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold ${FOCUS_RING}`}
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
