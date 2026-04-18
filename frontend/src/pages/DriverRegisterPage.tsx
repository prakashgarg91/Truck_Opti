import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Truck, CreditCard, CheckCircle2,
  ChevronRight, ChevronLeft, FileText, ArrowLeft, Upload, X
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'
import { storeAuthReturnTo } from '../utils/authReturnTo'

// Vehicle type options (must match trucks in DB)
const VEHICLE_TYPES = [
  { value: 'tata_407', label: 'Tata 407 (1 ton)', capacity: 1 },
  { value: 'eicher_14ft', label: 'Eicher 14ft (3 ton)', capacity: 3 },
  { value: 'eicher_17ft', label: 'Eicher 17ft (5 ton)', capacity: 5 },
  { value: 'ashok_19ft', label: 'Ashok Leyland 19ft (7 ton)', capacity: 7 },
  { value: 'bharatbenz_24ft', label: 'BharatBenz 24ft (10 ton)', capacity: 10 },
  { value: 'bharatbenz_32ft', label: 'BharatBenz 32ft (15 ton)', capacity: 15 },
]

interface FormData {
  // Step 1
  full_name: string
  phone: string
  aadhaar_last4: string
  pan_number: string
  home_city: string
  // Step 2
  vehicle_type: string
  rc_number: string
  license_number: string
  // Documents
  dl_url: string
  rc_url: string
  // Step 3
  bank_account: string
  ifsc_code: string
  upi_id: string
}

const STEPS = [
  { id: 1, label: 'Personal', icon: User },
  { id: 2, label: 'Vehicle', icon: Truck },
  { id: 3, label: 'Payment', icon: CreditCard },
  { id: 4, label: 'Done', icon: CheckCircle2 },
]

const INITIAL: FormData = {
  full_name: '', phone: '', aadhaar_last4: '', pan_number: '', home_city: '',
  vehicle_type: '', rc_number: '', license_number: '',
  dl_url: '', rc_url: '', bank_account: '', ifsc_code: '', upi_id: '',
}

export default function DriverRegisterPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState<{ licence?: boolean; rc?: boolean }>({})
  const licenceInputRef = useRef<HTMLInputElement>(null)
  const rcInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (field: 'dl_url' | 'rc_url', file: File) => {
    const isLicence = field === 'dl_url'
    setUploading(prev => ({ ...prev, [isLicence ? 'licence' : 'rc']: true }))

    try {
      if (!user?.id) {
        toast.error('Please login to upload documents')
        return
      }

      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${isLicence ? 'licence' : 'rc'}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('driver-docs')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('driver-docs')
        .getPublicUrl(path)

      setForm(prev => ({ ...prev, [field]: publicUrl }))
      toast.success(isLicence ? 'Driving licence uploaded' : 'RC uploaded')
    } catch (err) {
      logger.error('Upload error:', err)
      toast.error('Failed to upload document')
    } finally {
      setUploading(prev => ({ ...prev, [isLicence ? 'licence' : 'rc']: false }))
    }
  }

  const removeFile = (field: 'dl_url' | 'rc_url') => {
    setForm(prev => ({ ...prev, [field]: '' }))
  }

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!form.full_name.trim()) { toast.error('Enter your full name'); return false }
      if (!/^\d{10}$/.test(form.phone)) { toast.error('Enter a valid 10-digit mobile number'); return false }
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan_number.toUpperCase().trim())) { toast.error('Enter a valid PAN number (e.g. ABCDE1234F)'); return false }
      if (!form.home_city.trim()) { toast.error('Enter your home city'); return false }
    }
    if (step === 2) {
      if (!form.vehicle_type) { toast.error('Select your vehicle type'); return false }
    }
    if (step === 3) {
      if (!form.bank_account.trim()) { toast.error('Enter bank account number'); return false }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc_code.toUpperCase())) {
        toast.error('Enter a valid IFSC code (e.g. SBIN0001234)'); return false
      }
    }
    return true
  }

  const handleNext = () => {
    if (!validateStep()) return
    if (step < 3) setStep(s => s + 1)
    else handleSubmit()
  }

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error('Please log in before submitting your driver application')
      storeAuthReturnTo('/driver/register')
      navigate('/login?mode=driver')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('drivers').insert({
        user_id: user.id,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        aadhaar_last4: form.aadhaar_last4.trim() || null,
        pan_number: form.pan_number.toUpperCase().trim(),
        home_city: form.home_city.trim(),
        vehicle_type: form.vehicle_type,
        rc_number: form.rc_number.trim() || null,
        license_number: form.license_number.trim() || null,
        bank_account: form.bank_account.trim(),
        ifsc_code: form.ifsc_code.toUpperCase().trim(),
        upi_id: form.upi_id.trim() || null,
        dl_url: form.dl_url.trim() || null,
        rc_url: form.rc_url.trim() || null,
        status: 'pending',
      })
      if (error) throw error
      updateUser({ role: 'driver' })
      setStep(4)
    } catch (err: unknown) {
      logger.error('[DriverRegisterPage]', err)
      toast.error('Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user?.id) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
            <User className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Log In To Start Driver Registration</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
            Driver applications must be linked to your authenticated account so documents, approvals, and trips stay attached to the right profile.
          </p>
          <button
            onClick={() => {
              storeAuthReturnTo('/driver/register')
              navigate('/login?mode=driver')
            }}
            className="w-full py-3 bg-primary-600 text-white rounded-2xl font-semibold hover:bg-primary-700 transition-colors"
          >
            Continue To Driver Login
          </button>
        </div>
      </div>
    )
  }

  if (step === 4) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Application Submitted!</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-2">
            Thank you, <strong>{form.full_name}</strong>! Your driver application is under review.
          </p>
          <p className="text-sm text-slate-400 mb-8">
            Our team will verify your details within 24–48 hours. You'll receive an SMS on <strong>{form.phone}</strong> once approved.
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-2">What happens next?</p>
            <ol className="text-xs text-amber-700 dark:text-amber-500 space-y-1.5 list-decimal list-inside">
              <li>Admin reviews your details & documents</li>
              <li>Account activated via SMS</li>
              <li>Start receiving job offers on this app</li>
            </ol>
          </div>
          <button
            onClick={() => navigate('/driver/dashboard')}
            className="w-full py-3 bg-primary-600 text-white rounded-2xl font-semibold hover:bg-primary-700 transition-colors"
          >
            Open Driver Portal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 pt-4">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : navigate('/login?mode=driver')}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm">
            {step > 1 ? <ChevronLeft className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Driver Registration</h1>
            <p className="text-xs text-slate-500">Step {step} of 3 — {STEPS[step - 1].label}</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8 bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          {STEPS.slice(0, 3).map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className={`flex flex-col items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step > s.id ? 'bg-emerald-500 text-white'
                  : step === s.id ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                  }`}>
                  {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                </div>
                <span className={`text-[10px] font-medium mt-1 ${step === s.id ? 'text-primary-600' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 rounded-full ${step > s.id ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-lg p-6">
          {/* Step 1: Personal Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-primary-500" /> Personal Details
                </h2>
                <p className="text-xs text-slate-500 mt-1">Your basic info as on your Aadhaar card</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                  <input value={form.full_name} onChange={set('full_name')} placeholder="As on Aadhaar card"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mobile Number *</label>
                  <div className="flex">
                    <span className="px-3 py-3 bg-slate-100 dark:bg-slate-700 border border-r-0 border-slate-200 dark:border-slate-600 rounded-l-xl text-sm text-slate-500">+91</span>
                    <input value={form.phone} onChange={set('phone')} placeholder="10-digit number" maxLength={10}
                      className="flex-1 px-4 py-3 rounded-r-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Aadhaar Last 4 Digits</label>
                  <input value={form.aadhaar_last4} onChange={set('aadhaar_last4')} placeholder="XXXX" maxLength={4}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PAN Number *</label>
                  <input value={form.pan_number} onChange={set('pan_number')} placeholder="ABCDE1234F" maxLength={10}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm uppercase" />
                  <p className="text-xs text-slate-500 mt-1">Required for payout verification and driver approval.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Home City *</label>
                  <input value={form.home_city} onChange={set('home_city')} placeholder="e.g. Mumbai"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Vehicle Details */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Truck className="w-5 h-5 text-primary-500" /> Vehicle Details
                </h2>
                <p className="text-xs text-slate-500 mt-1">Information about your truck</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Vehicle Type *</label>
                  <select value={form.vehicle_type} onChange={set('vehicle_type')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm">
                    <option value="">-- Select vehicle type --</option>
                    {VEHICLE_TYPES.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">RC Number</label>
                  <input value={form.rc_number} onChange={set('rc_number')} placeholder="MH01AB1234"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm uppercase" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Driving License Number</label>
                  <input value={form.license_number} onChange={set('license_number')} placeholder="MH0120220001234"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm uppercase" />
                </div>

                {/* Document Uploads */}
                <div className="pt-2 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Driving Licence Photo
                    </label>
                    {form.dl_url ? (
                      <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                        <img src={form.dl_url} alt="Licence" className="w-12 h-12 object-cover rounded-lg" />
                        <span className="text-xs text-green-700 dark:text-green-400 flex-1">Uploaded</span>
                        <button type="button" onClick={() => removeFile('dl_url')} className="p-1 text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        ref={licenceInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload('dl_url', file)
                        }}
                        className="hidden"
                      />
                    )}
                    {!form.dl_url && (
                      <button
                        type="button"
                        onClick={() => licenceInputRef.current?.click()}
                        disabled={uploading.licence}
                        className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-500 hover:border-primary-500 hover:text-primary-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {uploading.licence ? (
                          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {uploading.licence ? 'Uploading...' : 'Upload Driving Licence'}
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle RC Photo
                    </label>
                    {form.rc_url ? (
                      <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                        <img src={form.rc_url} alt="RC" className="w-12 h-12 object-cover rounded-lg" />
                        <span className="text-xs text-green-700 dark:text-green-400 flex-1">Uploaded</span>
                        <button type="button" onClick={() => removeFile('rc_url')} className="p-1 text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        ref={rcInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload('rc_url', file)
                        }}
                        className="hidden"
                      />
                    )}
                    {!form.rc_url && (
                      <button
                        type="button"
                        onClick={() => rcInputRef.current?.click()}
                        disabled={uploading.rc}
                        className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-sm text-slate-500 hover:border-primary-500 hover:text-primary-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {uploading.rc ? (
                          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {uploading.rc ? 'Uploading...' : 'Upload Vehicle RC'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Payment Details */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary-500" /> Payment Details
                </h2>
                <p className="text-xs text-slate-500 mt-1">Payments will be sent to this account</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bank Account Number *</label>
                  <input value={form.bank_account} onChange={set('bank_account')} placeholder="Account number"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">IFSC Code *</label>
                  <input value={form.ifsc_code} onChange={set('ifsc_code')} placeholder="SBIN0001234"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm uppercase" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">UPI ID (optional)</label>
                  <input value={form.upi_id} onChange={set('upi_id')} placeholder="name@upi"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3">
                <p className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
                  <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Your bank details are encrypted and stored securely. Payments are processed via Razorpay after each successful delivery.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)}
                className="flex-1 py-3 border border-slate-200 dark:border-slate-600 rounded-2xl font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button onClick={handleNext} disabled={submitting}
              className="flex-1 py-3 bg-primary-600 text-white rounded-2xl font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {step === 3 ? 'Submit Application' : 'Continue'}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Already registered? <button onClick={() => navigate('/login?mode=driver')} className="text-primary-600 underline">Sign In</button>
        </p>
      </div>
    </div>
  )
}
