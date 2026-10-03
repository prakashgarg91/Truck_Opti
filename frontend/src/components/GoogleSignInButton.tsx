import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isSupabaseConfigured, isSupabaseReachable } from '../lib/supabase'
import { authSupabaseApi } from '../services/supabaseApi'
import { buildAuthReturnTo, type AuthRouteState } from '../utils/authReturnTo'
import { logger } from '../utils/logger'

// Google sign-in starts a trusted Supabase OAuth round trip (implicit flow on
// this SPA client). Identity and app role are resolved from the verified
// Supabase user plus protected server data once the /auth/callback redirect
// returns. GIS ID tokens are deliberately NOT decoded here: a client-decoded
// identity is device-local data and can never grant cloud, admin, reviewer or
// driver authority, or enable payments. Device-local workspaces live behind
// /local-start, not behind a Google button.
//
// TO-123: when the Supabase backend is not configured, Google sign-in is not
// an available method — the button renders nothing rather than a disabled
// "(needs setup)" control, so no login surface ever suggests an unavailable
// method. The auth pages additionally hide the button via the canonical
// capability model (lib/authSurfaceMethods).
export default function GoogleSignInButton({ label }: { label: string }) {
  const location = useLocation()
  const returnTo = buildAuthReturnTo(location.state as AuthRouteState)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  if (!isSupabaseConfigured) {
    return null
  }

  const startGoogleSignIn = async () => {
    if (starting) return
    setError(null)
    setStarting(true)
    try {
      if (!(await isSupabaseReachable())) {
        throw new Error(
          'Google sign-in is unavailable right now because the sign-in backend cannot be reached. You can continue offline on this device.'
        )
      }
      await authSupabaseApi.signInWithGoogle(returnTo ?? undefined)
      // On success supabase-js redirects the browser to Google; the page is
      // replaced shortly after, so the button stays in its "starting" state.
    } catch (e) {
      logger.error('[GoogleSignIn] failed to start OAuth:', e)
      setError(e instanceof Error ? e.message : 'Could not start Google sign-in. Please try again.')
      setStarting(false)
    }
  }

  return (
    <div>
      <button
        onClick={startGoogleSignIn}
        disabled={starting}
        className="btn btn-secondary w-full"
      >
        <span>{starting ? 'Redirecting to Google…' : label}</span>
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
