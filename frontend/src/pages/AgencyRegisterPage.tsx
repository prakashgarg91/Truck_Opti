import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, User, CreditCard, CheckCircle2,
  ChevronRight, ChevronLeft, ArrowLeft
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useLanguageStore } from '../stores/languageStore'
import { logger } from '../utils/logger'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir',
  'Ladakh','Lakshadweep','Puducherry',
]

interface FormData {
  // Step 1 — Business
  company_name: string
  gstin: string
  transport_license: string
  pan_number: string
  // Step 2 — Contact & Address
  contact_name: string
  contact_phone: string
  contact_email: string
  address: string
  city: string
  state: string
  pincode: string
  fleet_size: string
  operating_routes: string
  // Step 3 — Bank
  bank_account: string
  ifsc_code: string
}

const STEPS = [
  { id: 1, label: 'Business', icon: Building2 },
  { id: 2, label: 'Contact', icon: User },
  { id: 3, label: 'Bank', icon: CreditCard },
  { id: 4, label: 'Done', icon: CheckCircle2 },
]

const INITIAL: FormData = {
  company_name: '', gstin: '', transport_license: '', pan_number: '',
  contact_name: '', contact_phone: '', contact_email: '', address: '',
  city: '', state: '', pincode: '', fleet_size: '', operating_routes: '',
  bank_account: '', ifsc_code: '',
}

export default function AgencyRegisterPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL)
  const [submitting, setSubmitting] = useState(false)

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!form.company_name.trim()) { toast.error('Enter company name'); return false }
      if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin)) {
        toast.error('Enter a valid 15-digit GSTIN'); return false
      }
      if (!form.transport_license.trim()) { toast.error('Enter transport license number'); return false }
    }
    if (step === 2) {
      if (!form.contact_name.trim()) { toast.error('Enter contact person name'); return false }
      if (!/^\d{10}$/.test(form.contact_phone)) { toast.error('Enter a valid 10-digit phone'); return false }
      if (!form.city.trim()) { toast.error('Enter city'); return false }
      if (!form.state) { toast.error('Select state'); return false }
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
    setSubmitting(true)
    try {
      const { error } = await supabase.from('transport_agencies').insert({
        company_name: form.company_name.trim(),
        gstin: form.gstin.toUpperCase().trim() || null,
        transport_license: form.transport_license.trim(),
        pan_number: form.pan_number.toUpperCase().trim() || null,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        contact_email: form.contact_email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim(),
        state: form.state,
        pincode: form.pincode.trim() || null,
        fleet_size: form.fleet_size ? parseInt(form.fleet_size) : 0,
        operating_routes: form.operating_routes.trim() || null,
        bank_account: form.bank_account.trim(),
        ifsc_code: form.ifsc_code.toUpperCase().trim(),
        status: 'pending',
      })
      if (error) throw error
      setStep(4)
    } catch (err: unknown) {
      logger.error('[AgencyRegisterPage]', err)
      toast.error(language === 'en' ? 'Registration failed. Please try again.' : 'पंजीकरण विफल। कृपया पुनः प्रयास करें।')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400'
  const labelCls = 'text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 block'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => step > 1 && step < 4 ? setStep(s => s - 1) : navigate('/login')} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Agency Registration</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Join TruckOpti as a transport agency</p>
        </div>
      </header>

      <div className="flex-1 p-4 max-w-md mx-auto w-full">
        {/* Step Indicators */}
        {step < 4 && (
          <div className="flex items-center mb-6">
            {STEPS.map(({ id, label, icon: Icon }, idx) => (
              <div key={id} className="flex items-center flex-1">
                <div className={`flex flex-col items-center flex-shrink-0 ${id <= step ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    id < step ? 'bg-blue-600 text-white' :
                    id === step ? 'bg-blue-600 text-white ring-4 ring-blue-200 dark:ring-blue-900/40' :
                    'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}>
                    {id < step ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                  </div>
                  <span className="text-xs mt-1 text-slate-500 dark:text-slate-400 hidden sm:block">{label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded ${id < step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Business Details */}
        {step === 1 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Building2 size={18} className="text-blue-600" />
              Business Details
            </h2>
            <div>
              <label className={labelCls}>Company Name *</label>
              <input value={form.company_name} onChange={set('company_name')} className={inputCls} placeholder="Sharma Transport Co." />
            </div>
            <div>
              <label className={labelCls}>GSTIN <span className="text-slate-400 font-normal">(optional)</span></label>
              <input value={form.gstin} onChange={set('gstin')} className={inputCls} placeholder="22AAAAA0000A1Z5" maxLength={15} style={{ textTransform: 'uppercase' }} />
            </div>
            <div>
              <label className={labelCls}>Transport License Number *</label>
              <input value={form.transport_license} onChange={set('transport_license')} className={inputCls} placeholder="TR/2024/12345" />
            </div>
            <div>
              <label className={labelCls}>PAN Number <span className="text-slate-400 font-normal">(optional)</span></label>
              <input value={form.pan_number} onChange={set('pan_number')} className={inputCls} placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }} />
            </div>
          </div>
        )}

        {/* Step 2: Contact & Address */}
        {step === 2 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <User size={18} className="text-blue-600" />
              Contact & Address
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Contact Person *</label>
                <input value={form.contact_name} onChange={set('contact_name')} className={inputCls} placeholder="Ramesh Sharma" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Phone *</label>
                <input value={form.contact_phone} onChange={set('contact_phone')} className={inputCls} placeholder="9876543210" maxLength={10} inputMode="numeric" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Email <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="email" value={form.contact_email} onChange={set('contact_email')} className={inputCls} placeholder="agency@example.com" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Address</label>
                <input value={form.address} onChange={set('address')} className={inputCls} placeholder="123 Transport Nagar" />
              </div>
              <div>
                <label className={labelCls}>City *</label>
                <input value={form.city} onChange={set('city')} className={inputCls} placeholder="Mumbai" />
              </div>
              <div>
                <label className={labelCls}>Pincode</label>
                <input value={form.pincode} onChange={set('pincode')} className={inputCls} placeholder="400001" maxLength={6} inputMode="numeric" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>State *</label>
                <select value={form.state} onChange={set('state')} className={inputCls}>
                  <option value="">Select state</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Fleet Size</label>
                <input type="number" min="0" value={form.fleet_size} onChange={set('fleet_size')} className={inputCls} placeholder="10" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Operating Routes <span className="text-slate-400 font-normal">(optional)</span></label>
                <input value={form.operating_routes} onChange={set('operating_routes')} className={inputCls} placeholder="Mumbai–Pune, Delhi–Agra" />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Bank Details */}
        {step === 3 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <CreditCard size={18} className="text-blue-600" />
              Bank Details
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Payments will be credited to this account after each completed job.
            </p>
            <div>
              <label className={labelCls}>Bank Account Number *</label>
              <input value={form.bank_account} onChange={set('bank_account')} className={inputCls} placeholder="123456789012" inputMode="numeric" />
            </div>
            <div>
              <label className={labelCls}>IFSC Code *</label>
              <input value={form.ifsc_code} onChange={set('ifsc_code')} className={inputCls} placeholder="SBIN0001234" maxLength={11} style={{ textTransform: 'uppercase' }} />
              <p className="text-xs text-slate-400 mt-1">11-character code (e.g. SBIN0001234)</p>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Registration Submitted!</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Your agency registration is under review. You'll be notified within 2-3 business days once approved.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300 mb-6">
              📧 Check your email for confirmation and next steps.
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold"
            >
              Back to Home
            </button>
          </div>
        )}

        {/* Nav Buttons */}
        {step < 4 && (
          <div className="flex gap-3 mt-4">
            {step > 1 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium"
              >
                <ChevronLeft size={18} />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : step === 3 ? 'Submit Application' : 'Continue'}
              {!submitting && <ChevronRight size={18} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
