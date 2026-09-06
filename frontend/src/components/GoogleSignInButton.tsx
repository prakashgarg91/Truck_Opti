import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { isGoogleAuthConfigured, renderGoogleButton } from '../lib/googleAuth'
import { agencyProfileLocalApi } from '../services/localApi'
import { useAuthStore } from '../stores/authStore'
import { getDefaultHomePathForRole } from './ProtectedRoute'
import { logger } from '../utils/logger'

// Google sign-in via GIS (no Supabase, no OTP). Without VITE_GOOGLE_CLIENT_ID
// it renders an honest disabled state instead of a broken redirect.
export default function GoogleSignInButton({ label }: { label: string }) {
  const btnRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const loginLocal = useAuthStore((s) => s.loginLocal)
  const [error, setError] = useState<string | null>(null)
  const configured = isGoogleAuthConfigured()

  useEffect(() => {
    if (!configured || !btnRef.current) return
    let cancelled = false
    renderGoogleButton(
      btnRef.current,
      async (profile) => {
        if (cancelled) return
        try {
          const linked = await agencyProfileLocalApi.linkGoogle(profile)
          loginLocal(linked)
          toast.success(`Welcome${profile.name ? `, ${profile.name.split(' ')[0]}` : ''}!`)
          navigate(getDefaultHomePathForRole(linked.role), { replace: true })
        } catch (e) {
          logger.error('[GoogleSignIn] link error:', e)
          setError('Could not sign you in on this device.')
        }
      },
      (message) => { if (!cancelled) setError(message) }
    )
    return () => { cancelled = true }
  }, [configured, loginLocal, navigate])

  if (!configured) {
    return (
      <div title="Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in">
        <button
          disabled
          className="btn btn-secondary w-full opacity-60 cursor-not-allowed"
        >
          <span>{label} (needs setup)</span>
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Google sign-in activates once the owner adds a client ID. Meanwhile, use device setup below.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div ref={btnRef} className="flex justify-center" />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
