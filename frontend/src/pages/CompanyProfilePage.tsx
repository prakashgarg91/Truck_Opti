import { useState, useEffect } from 'react'
import {
  Building2, Save, Phone, MapPin, FileText,
  CheckCircle2, AlertCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'
import BackupSection from '../components/BackupSection'
import { agencyIdentityApi, type AgencyIdentity } from '../services/agencyIdentityApi'
import { agencyDashboardApi } from '../services/agencyPortalApi'
import { toUserFacingErrorMessage } from '../utils/userFacingError'

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
  useEffect(() => {
    document.title = 'Company Settings - TruckOpti'
  }, [])

  const [form, setForm] = useState<CompanyData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [identity, setIdentity] = useState<AgencyIdentity | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { user, isAgencyOwner } = useAuthStore()
  // Only an explicit `false` marks a staff member; the owner keeps the editable profile.
  const isStaff = isAgencyOwner === false

  useEffect(() => {
    loadProfile()
    // loadProfile reads user metadata; intentionally runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    setLoadError(null)
    if (isStaff) {
      // Staff cannot read the owner's identity row; the dashboard snapshot is the agency identity they may see.
      try {
        const snapshot = await agencyDashboardApi.getSnapshot()
        setForm({
          ...EMPTY,
          name: snapshot.agency?.company_name ?? '',
          gstin: snapshot.agency?.gstin ?? '',
          city: snapshot.agency?.city ?? '',
        })
      } catch (err: unknown) {
        logger.error('[CompanyProfilePage] staff load', err)
        setLoadError(toUserFacingErrorMessage(err, 'Failed to load company details'))
      } finally {
        setLoading(false)
      }
      return
    }
    // Personal / non-agency fields (PAN, email, address line 2) stay in the login metadata.
    let next: CompanyData = { ...EMPTY, ...(user?.user_metadata?.company ?? {}) }
    try {
      // GST identity of an agency owner comes from the agency row: that is what the trial claim,
      // subscription invoices and freight invoices read.
      const row = user?.id ? await agencyIdentityApi.load(user.id) : null
      setIdentity(row)
      if (row) {
        next = {
          ...next,
          name: row.legalName,
          gstin: row.gstin,
          phone: row.phone,
          address_line1: row.address,
          address_line2: '',
          state: row.state,
          city: row.city || next.city,
          pincode: row.pincode || next.pincode,
        }
      }
      setForm(next)
    } catch (err: unknown) {
      logger.error('[CompanyProfilePage] load', err)
      setForm(next)
      setLoadError(toUserFacingErrorMessage(err, 'Failed to load company details'))
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

    if (identity) {
      if (form.phone.replace(/\D/g, '').length < 10) {
        toast.error('Enter a phone number with at least 10 digits'); return
      }
      if (!form.state) { toast.error('Choose your state'); return }
    }

    setSaving(true)
    setSaved(false)
    try {
      if (identity) {
        const result = await agencyIdentityApi.save({
          legalName: form.name,
          gstin: form.gstin,
          phone: form.phone,
          address: [form.address_line1, form.address_line2].map(v => v.trim()).filter(Boolean).join(', '),
          state: form.state,
          city: form.city,
          pincode: form.pincode,
          expectedUpdatedAt: identity.updatedAt,
        })
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        setIdentity({ ...identity, updatedAt: result.identity.updatedAt })
        setForm(prev => ({ ...prev, gstin: result.identity.gstin, phone: result.identity.phone }))
      }
      // Login metadata keeps PAN, email and the older readers of the company block; for an agency owner
      // it is a mirror, never the source of the GST identity.
      const { error } = await supabase.auth.updateUser({
        data: {
          company: {
            ...form,
            gstin: form.gstin.toUpperCase().trim(),
            pan: form.pan.toUpperCase().trim(),
          }
        }
      })
      if (error) {
        if (!identity) throw error
        logger.error('[CompanyProfilePage] metadata mirror', error)
      }
      setSaved(true)
      toast.success('Company profile saved!')
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      logger.error('[CompanyProfilePage]', err)
      toast.error(toUserFacingErrorMessage(err, 'Profile update failed.'))
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

  if (isStaff) {
    const staffRows: [string, string][] = [
      ['Company / business name', form.name],
      ['GSTIN', form.gstin],
      ['City', form.city],
    ]
    return (
      <div className="max-w-2xl md:max-w-3xl mx-auto p-4 md:p-8 pb-8 md:pb-12 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-500" /> Company Profile
          </h1>
        </div>
        {loadError && (
          <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
            <button onClick={loadProfile} className="px-4 py-2 min-h-[44px] rounded-xl bg-red-600 text-white text-sm font-semibold">Retry</button>
          </div>
        )}
        <p role="note" data-testid="staff-readonly-note" className="text-sm text-slate-600 dark:text-slate-300">
          Only the agency owner can change these details.
        </p>
        <dl className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-5 grid gap-4 sm:grid-cols-2">
          {staffRows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100 break-words">{value.trim() || 'Not set'}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  return (
    <div className="max-w-2xl md:max-w-3xl mx-auto p-4 md:p-8 pb-8 md:pb-12 space-y-6">
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

      {loadError && (
        <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
          <button onClick={loadProfile} className="px-4 py-2 min-h-[44px] rounded-xl bg-red-600 text-white text-sm font-semibold">Retry</button>
        </div>
      )}
      {identity && (
        <p className="text-xs text-slate-500" data-testid="agency-identity-note">
          Name, GSTIN, phone, address and state are saved to your agency record and used for your free trial and GST invoices.
        </p>
      )}

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
            <label htmlFor="company-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Company / Business Name *</label>
            <input id="company-name" value={form.name} onChange={set('name')} placeholder="e.g. Garg Logistics Pvt Ltd"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="company-gstin" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> GSTIN</span>
              </label>
              <input id="company-gstin" value={form.gstin} onChange={set('gstin')} placeholder="22AAAAA0000A1Z5" maxLength={15}
                className={`w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm uppercase ${form.gstin && !validateGSTIN(form.gstin.toUpperCase())
                  ? 'border-red-400 focus:ring-red-400'
                  : 'border-slate-200 dark:border-slate-600'
                  }`} />
              {form.gstin && !validateGSTIN(form.gstin.toUpperCase()) && (
                <p className="text-xs text-red-500 mt-1">Invalid GSTIN format</p>
              )}
            </div>
            <div>
              <label htmlFor="company-pan" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PAN Number *</label>
              <input id="company-pan" value={form.pan} onChange={set('pan')} placeholder="AAAPZ1234C" maxLength={10}
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
            <label htmlFor="company-address1" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address Line 1 *</label>
            <input id="company-address1" value={form.address_line1} onChange={set('address_line1')} placeholder="Building, street"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div>
            <label htmlFor="company-address2" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address Line 2</label>
            <input id="company-address2" value={form.address_line2} onChange={set('address_line2')} placeholder="Area, landmark"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="company-city" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">City *</label>
              <input id="company-city" value={form.city} onChange={set('city')} placeholder="Mumbai"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
            <div>
              <label htmlFor="company-pincode" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pincode *</label>
              <input id="company-pincode" value={form.pincode} onChange={set('pincode')} placeholder="400001" maxLength={6}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label htmlFor="company-state" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">State *</label>
            <select id="company-state" value={form.state} onChange={set('state')}
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
            <label htmlFor="company-phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone *</label>
            <input id="company-phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          </div>
          <div>
            <label htmlFor="company-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input id="company-email" value={form.email} onChange={set('email')} placeholder="billing@company.com" type="email"
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

      {/* Device backup (offline-first) */}
      <BackupSection />

      {/* Save Bottom Button */}
      <button onClick={handleSave} disabled={saving}        className="w-full py-4 bg-primary-600 text-white rounded-2xl font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        {saving ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <><Save className="w-5 h-5" /> Save Company Profile</>
        )}
      </button>
    </div>
  )
}
