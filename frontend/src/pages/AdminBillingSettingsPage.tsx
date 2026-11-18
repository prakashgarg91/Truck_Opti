import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, FileText, RefreshCw, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  adminBillingSettingsApi,
  type PlatformBillingSettings,
} from '../services/adminSupabaseApi'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'

export const GSTIN_PATTERN = /^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const STATE_PATTERN = /^(0[1-9]|[12][0-9]|3[0-8])$/
const SAC_PATTERN = /^[0-9]{6,8}$/
const DEFAULT_SAC = '997331'

const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

interface FormState {
  legalName: string
  gstin: string
  address: string
  stateCode: string
  sacCode: string
}

type FieldErrors = Partial<Record<keyof FormState, string>>

function toForm(settings: PlatformBillingSettings | null): FormState {
  return {
    legalName: settings?.legalName ?? '',
    gstin: settings?.gstin ?? '',
    address: settings?.address ?? '',
    stateCode: settings?.stateCode ?? '',
    sacCode: settings?.sacCode ?? DEFAULT_SAC,
  }
}

export function validateBillingForm(form: FormState): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.legalName.trim()) errors.legalName = 'Enter the legal name of the business that issues the invoices.'
  if (!form.gstin) errors.gstin = 'Enter the 15-character GSTIN.'
  else if (!GSTIN_PATTERN.test(form.gstin)) {
    errors.gstin = `This is not a valid GSTIN (${form.gstin.length} of 15 characters). Example: 27AAAAA0000A1Z5.`
  }
  if (!form.address.trim()) errors.address = 'Enter the registered address that appears on the invoices.'
  if (!STATE_PATTERN.test(form.stateCode)) errors.stateCode = 'Enter a two-digit GST state code between 01 and 38.'
  else if (GSTIN_PATTERN.test(form.gstin) && form.gstin.slice(0, 2) !== form.stateCode) {
    errors.stateCode = 'The state code must match the first two digits of the GSTIN.'
  }
  if (!SAC_PATTERN.test(form.sacCode)) errors.sacCode = 'The SAC must be 6 to 8 digits.'
  return errors
}

const INPUT =
  'w-full min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 ' +
  'text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
const BUTTON =
  'inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl text-sm font-medium ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'

export default function AdminBillingSettingsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettings] = useState<PlatformBillingSettings | null>(null)
  const [form, setForm] = useState<FormState>(toForm(null))
  const [stateTouched, setStateTouched] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [unsubscribed, setUnsubscribed] = useState<number | null | 'loading'>('loading')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const next = await adminBillingSettingsApi.getSettings()
      setSettings(next)
      setForm(toForm(next))
      setStateTouched(Boolean(next?.stateCode))
    } catch (error) {
      logger.error('[AdminBillingSettings] load:', error)
      setLoadError(toUserFacingErrorMessage(error, 'Unable to load billing settings right now. Please try again.'))
    } finally {
      setLoading(false)
    }
    // The agency count is informational: a failure shows "unavailable" and never blocks the form.
    setUnsubscribed('loading')
    try {
      setUnsubscribed(await adminBillingSettingsApi.countApprovedAgenciesWithoutLiveSubscription())
    } catch (error) {
      logger.error('[AdminBillingSettings] agency count:', error)
      setUnsubscribed(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const update = (patch: Partial<FormState>) => {
    setSaved(false)
    setSaveError(null)
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const onGstinChange = (raw: string) => {
    const gstin = raw.toUpperCase().replace(/\s+/g, '').slice(0, 15)
    const prefix = gstin.slice(0, 2)
    // Follow the GSTIN's first two digits until the admin edits the state code by hand.
    update(!stateTouched && STATE_PATTERN.test(prefix) ? { gstin, stateCode: prefix } : { gstin })
  }

  const errors = validateBillingForm(form)
  const gstinHint = form.gstin.length >= 2 && STATE_PATTERN.test(form.gstin.slice(0, 2)) ? form.gstin.slice(0, 2) : null
  // A live message appears as soon as the GSTIN is long enough to judge, or after a save attempt.
  const gstinLiveError = form.gstin.length === 15 || showErrors ? errors.gstin : undefined
  const fieldError = (name: keyof FormState) => (name === 'gstin' ? gstinLiveError : showErrors ? errors[name] : undefined)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    setSaved(false)
    setSaveError(null)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    try {
      await adminBillingSettingsApi.updateSettings({
        legalName: form.legalName.trim(),
        gstin: form.gstin,
        address: form.address.trim(),
        stateCode: form.stateCode,
        sacCode: form.sacCode,
      })
      setSaved(true)
      toast.success('Billing settings saved.')
      const next = await adminBillingSettingsApi.getSettings()
      setSettings(next)
      setForm(toForm(next))
    } catch (error) {
      logger.error('[AdminBillingSettings] save:', error)
      const message = toUserFacingErrorMessage(error, 'Billing settings could not be saved. Please try again.')
      setSaveError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const configured = Boolean(settings?.legalName && settings?.gstin && settings?.address && settings?.stateCode)

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-3xl mx-auto pb-8 md:pb-10">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className={`${BUTTON} bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700`}
          aria-label="Back to admin dashboard"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
        <FileText className="w-5 h-5 text-purple-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Billing settings</h1>
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="flex items-center justify-center py-16" data-testid="billing-loading">
          <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
          <span className="sr-only">Loading billing settings</span>
        </div>
      ) : loadError || !settings ? (
        <div role="alert" data-testid="billing-load-error" className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center space-y-3">
          <p className="text-slate-800 dark:text-slate-100 font-medium">{loadError ?? 'The billing settings row was not found.'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing was changed. You can try again.</p>
          <button type="button" onClick={() => void load()} className={`${BUTTON} bg-indigo-600 text-white`}>
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : (
        <>
          {!configured && (
            <div role="status" data-testid="billing-empty" className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-900 dark:text-amber-100">
              Billing details are not set yet. No plan can be quoted to an agency until the legal name, GSTIN, address and state code are saved.
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="bg-white dark:bg-slate-800 rounded-2xl p-4 md:p-6 shadow-sm space-y-4" aria-label="Invoice issuer details">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Invoice issuer details</h2>

            <div>
              <label htmlFor="billing-legal-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Legal name</label>
              <input
                id="billing-legal-name"
                className={INPUT}
                value={form.legalName}
                autoComplete="organization"
                aria-invalid={Boolean(fieldError('legalName'))}
                aria-describedby={fieldError('legalName') ? 'billing-legal-name-error' : undefined}
                onChange={(e) => update({ legalName: e.target.value })}
              />
              {fieldError('legalName') && <p id="billing-legal-name-error" role="alert" className="mt-1 text-sm text-red-600">{fieldError('legalName')}</p>}
            </div>

            <div>
              <label htmlFor="billing-gstin" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">GSTIN</label>
              <input
                id="billing-gstin"
                className={`${INPUT} font-mono uppercase`}
                value={form.gstin}
                maxLength={15}
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={Boolean(gstinLiveError)}
                aria-describedby={gstinLiveError ? 'billing-gstin-error' : 'billing-gstin-help'}
                onChange={(e) => onGstinChange(e.target.value)}
              />
              {gstinLiveError ? (
                <p id="billing-gstin-error" role="alert" className="mt-1 text-sm text-red-600">{gstinLiveError}</p>
              ) : (
                <p id="billing-gstin-help" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{`${form.gstin.length} of 15 characters`}</p>
              )}
            </div>

            <div>
              <label htmlFor="billing-address" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Registered address</label>
              <textarea
                id="billing-address"
                rows={3}
                className={INPUT}
                value={form.address}
                autoComplete="street-address"
                aria-invalid={Boolean(fieldError('address'))}
                aria-describedby={fieldError('address') ? 'billing-address-error' : undefined}
                onChange={(e) => update({ address: e.target.value })}
              />
              {fieldError('address') && <p id="billing-address-error" role="alert" className="mt-1 text-sm text-red-600">{fieldError('address')}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="billing-state" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">State code</label>
                <input
                  id="billing-state"
                  className={`${INPUT} font-mono`}
                  value={form.stateCode}
                  maxLength={2}
                  inputMode="numeric"
                  aria-invalid={Boolean(fieldError('stateCode'))}
                  aria-describedby={fieldError('stateCode') ? 'billing-state-error' : 'billing-state-help'}
                  onChange={(e) => {
                    setStateTouched(true)
                    update({ stateCode: e.target.value.replace(/\D/g, '').slice(0, 2) })
                  }}
                />
                {fieldError('stateCode') ? (
                  <p id="billing-state-error" role="alert" className="mt-1 text-sm text-red-600">{fieldError('stateCode')}</p>
                ) : (
                  <p id="billing-state-help" data-testid="billing-state-hint" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {gstinHint
                      ? `From the GSTIN: ${gstinHint}${GST_STATES[gstinHint] ? ` (${GST_STATES[gstinHint]})` : ''}`
                      : 'The first two digits of the GSTIN.'}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="billing-sac" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SAC</label>
                <input
                  id="billing-sac"
                  className={`${INPUT} font-mono`}
                  value={form.sacCode}
                  maxLength={8}
                  inputMode="numeric"
                  aria-invalid={Boolean(fieldError('sacCode'))}
                  aria-describedby={fieldError('sacCode') ? 'billing-sac-error' : 'billing-sac-help'}
                  onChange={(e) => update({ sacCode: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                />
                {fieldError('sacCode') ? (
                  <p id="billing-sac-error" role="alert" className="mt-1 text-sm text-red-600">{fieldError('sacCode')}</p>
                ) : (
                  <p id="billing-sac-help" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{`Default ${DEFAULT_SAC}. Confirm with your accountant.`}</p>
                )}
              </div>
            </div>

            {saveError && <p role="alert" data-testid="billing-save-error" className="text-sm text-red-600">{saveError}</p>}
            {saved && <p role="status" data-testid="billing-saved" className="text-sm text-green-700 dark:text-green-400">Billing settings saved.</p>}

            <button type="submit" disabled={saving} className={`${BUTTON} bg-indigo-600 text-white disabled:opacity-60`}>
              {saving ? 'Saving…' : 'Save billing settings'}
            </button>
          </form>

          <section
            aria-labelledby="billing-danger-heading"
            data-testid="billing-danger"
            className="rounded-2xl border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 md:p-6 space-y-3"
          >
            <h2 id="billing-danger-heading" className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
              <ShieldAlert size={16} aria-hidden="true" />
              Danger: subscription enforcement
            </h2>
            <p data-testid="billing-enforcement-value" className="text-sm font-medium text-slate-800 dark:text-slate-100">
              {`Enforcement is currently ${settings.enforcementEnabled ? 'ON' : 'OFF'}.`}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Turning enforcement on is a launch step: see docs/STAGING-SMOKE-CHECKLIST.md
            </p>
            <p data-testid="billing-unsubscribed" className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <AlertTriangle size={16} className="mt-0.5 text-red-700 shrink-0" aria-hidden="true" />
              {unsubscribed === 'loading'
                ? 'Counting approved agencies without a live subscription…'
                : unsubscribed === null
                  ? 'The number of approved agencies without a live subscription is unavailable right now.'
                  : `${unsubscribed} approved ${unsubscribed === 1 ? 'agency has' : 'agencies have'} no live subscription. They become read-only when enforcement is turned on.`}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
