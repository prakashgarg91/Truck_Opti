import { useState, useEffect } from 'react'
import {
  Building2, Save, Phone, MapPin, FileText,
  CheckCircle2, AlertCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useLanguageStore } from '../stores/languageStore'
import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'

interface CompanyData {
  name: string
  gstin: string
  pan: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  pincode: string
  phone: string
  email: string
}

const EMPTY: CompanyData = {
  name: '', gstin: '', pan: '',
  address_line1: '', address_line2: '',
  city: '', state: '', pincode: '',
  phone: '', email: '',
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry',
]

export default function CompanyProfilePage() {
  const [form, setForm] = useState<CompanyData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { language } = useLanguageStore()
  const { user } = useAuthStore()

  useEffect(() => {
    loadProfile()
    // loadProfile reads user metadata; intentionally runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    try {
      if (user?.user_metadata?.company) {
        setForm({ ...EMPTY, ...user.user_metadata.company })
      }
    } catch {
      toast.error('Failed to load company profile')
    } finally {
      setLoading(false)
    }
  }

  const set = (field: keyof CompanyData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  const validateGSTIN = (v: string) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)
  const validatePAN = (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v)

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return }
    if (form.gstin && !validateGSTIN(form.gstin.toUpperCase())) {
      toast.error('Invalid GSTIN format'); return
    }
    if (!form.pan.trim()) {
      toast.error('PAN is required'); return
    }
    if (!validatePAN(form.pan.toUpperCase())) {
      toast.error('Invalid PAN format (e.g. AAAPZ1234C)'); return
    }

    setSaving(true)
    setSaved(false)
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          company: {
            ...form,
            gstin: form.gstin.toUpperCase().trim(),
            pan: form.pan.toUpperCase().trim(),
          }
        }
      })
      if (error) throw error
      setSaved(true)
      toast.success('Company profile saved!')
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      logger.error('[CompanyProfilePage]', err)
      toast.error(language === 'en' ? 'Profile update failed.' : 'प्रोफ़ाइल अपडेट करने में विफल।')
    } finally {
      setSaving(false)
    }
  }

  const completionFields: (keyof CompanyData)[] = ['name', 'pan', 'gstin', 'address_line1', 'city', 'state', 'pincode', 'phone']
  const filledCount = completionFields.filter(f => form[f]?.trim()).length
  const completionPct = Math.round((filledCount / completionFields.length) * 100)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto p-4 lg:p-8 pb-24 lg:pb-12 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-500" /> Company Profile
          </h1>
          <p className="text-sm text-slate-500 mt-1">Used on invoices, delivery notes, and reports</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-sm transition-all ${saved
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50'
            }`}>
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : saved ? (
            <><CheckCircle2 className="w-4 h-4" /> Saved</>
          ) : (
            <><Save className="w-4 h-4" /> Save</>
          )}
        </button>
      </div>

      {/* Completion Banner */}
      {completionPct < 100 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Profile {completionPct}% complete</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Complete your company profile for accurate GST invoices</p>
            <div className="mt-2 h-1.5 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">Basic Information</h2>
        <div className="grid gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Company / Business Name *</label>
            <input value={form.name} onChange={set('name')} placeholder="e.g. Garg Logistics Pvt Ltd"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> GSTIN</span>
              </label>
              <input value={form.gstin} onChange={set('gstin')} placeholder="22AAAAA0000A1Z5" maxLength={15}
                className={`w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm uppercase ${form.gstin && !validateGSTIN(form.gstin.toUpperCase())
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-slate-200 dark:border-slate-600'
                  }`} />
              {form.gstin && !validateGSTIN(form.gstin.toUpperCase()) && (
                <p className="text-xs text-red-500 mt-1">Invalid GSTIN format</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PAN Number *</label>
              <input value={form.pan} onChange={set('pan')} placeholder="AAAPZ1234C" maxLength={10}
                className={`w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm uppercase ${form.pan && !validatePAN(form.pan.toUpperCase())
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-slate-200 dark:border-slate-600'
                  }`} />
              {!form.pan.trim() ? (
                <p className="text-xs text-red-500 mt-1">PAN is required for billing and KYC.</p>
              ) : form.pan && !validatePAN(form.pan.toUpperCase()) ? (
                <p className="text-xs text-red-500 mt-1">Invalid PAN format</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Address
        </h2>
        <div className="grid gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address Line 1 *</label>
            <input value={form.address_line1} onChange={set('address_line1')} placeholder="Building, street"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address Line 2</label>
            <input value={form.address_line2} onChange={set('address_line2')} placeholder="Area, landmark"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">City *</label>
              <input value={form.city} onChange={set('city')} placeholder="Mumbai"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pincode *</label>
              <input value={form.pincode} onChange={set('pincode')} placeholder="400001" maxLength={6}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">State *</label>
            <select value={form.state} onChange={set('state')}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm">
              <option value="">-- Select State --</option>
              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <Phone className="w-4 h-4" /> Contact
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone *</label>
            <input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input value={form.email} onChange={set('email')} placeholder="billing@company.com" type="email"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
        </div>
      </div>

      {/* Invoice Preview */}
      {form.name && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Invoice Header Preview</p>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <p className="font-bold text-slate-900 dark:text-white text-base">{form.name}</p>
            {(form.address_line1 || form.city) && (
              <p className="text-xs text-slate-500 mt-0.5">
                {[form.address_line1, form.address_line2, form.city, form.state, form.pincode].filter(Boolean).join(', ')}
              </p>
            )}
            {form.phone && <p className="text-xs text-slate-500">Tel: {form.phone}</p>}
            {form.gstin && <p className="text-xs text-slate-500">GSTIN: {form.gstin.toUpperCase()}</p>}
            {form.pan && <p className="text-xs text-slate-500">PAN: {form.pan.toUpperCase()}</p>}
          </div>
        </div>
      )}

      {/* Save Bottom Button */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        {saving ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <><Save className="w-5 h-5" /> Save Company Profile</>
        )}
      </button>
    </div>
  )
}
