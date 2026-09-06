import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { agencyProfileLocalApi } from '../services/localApi'
import { useAuthStore } from '../stores/authStore'
import { getDefaultHomePathForRole } from '../components/ProtectedRoute'
import { logger } from '../utils/logger'

// First-run device setup for offline-first (local) mode. Creates the
// device-held agency profile and signs in locally. Supabase flows untouched.
export default function LocalSetupPage() {
  const navigate = useNavigate()
  const loginLocal = useAuthStore((s) => s.loginLocal)
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [existingName, setExistingName] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Device Setup - TruckOpti'
    agencyProfileLocalApi.current()
      .then((p) => { if (p) setExistingName(p.company_name) })
      .catch((e) => logger.error('[LocalSetup] load error:', e))
  }, [])

  const submit = async () => {
    if (!companyName.trim()) {
      toast.error('Please enter your company name')
      return
    }
    setBusy(true)
    try {
      const profile = await agencyProfileLocalApi.save({
        role: 'agency',
        company_name: companyName.trim(),
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
      })
      loginLocal(profile)
      toast.success('Device ready — welcome!')
      navigate(getDefaultHomePathForRole(profile.role), { replace: true })
    } catch (e) {
      logger.error('[LocalSetup] save error:', e)
      toast.error('Could not save on this device. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const continueExisting = async () => {
    const p = await agencyProfileLocalApi.current()
    if (!p) return
    loginLocal(p)
    navigate(getDefaultHomePathForRole(p.role), { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900">Set up this device</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your data stays on this device and in your own backup.
          No account or internet needed to start.
        </p>

        {existingName && (
          <button
            onClick={continueExisting}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Continue as {existingName}
          </button>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Company name *</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Sharma Transport"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Your name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Ravi Sharma"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Phone</label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="98765 00000"
              inputMode="tel"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
            />
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : existingName ? 'Switch to these details' : 'Start using TruckOpti'}
          </button>
          <p className="text-xs text-slate-500">
            Data is stored only on this device until you connect a backup.
          </p>
        </div>
      </div>
    </div>
  )
}
