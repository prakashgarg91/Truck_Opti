// Google Identity Services sign-in (no Supabase, no OTP).
// Active only when VITE_GOOGLE_CLIENT_ID is set; otherwise callers render a
// clear "needs setup" state instead of a broken button.
// Security note: the ID token is decoded client-side for profile display.
// Server-side signature verification arrives with the micro-backend; until
// then this identity is trusted for device-local data only (never money).
const GIS_SCRIPT = 'https://accounts.google.com/gsi/client'

export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || ''

export function isGoogleAuthConfigured(): boolean {
  return googleClientId.length > 0
}

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  picture?: string
}

export function decodeIdToken(credential: string): GoogleProfile {
  const parts = credential.split('.')
  if (parts.length !== 3) throw new Error('Malformed Google credential.')
  const payload = JSON.parse(
    atob(parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (parts[1].length % 4)) % 4))
  ) as Record<string, unknown>
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Google credential has no subject.')
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' && payload.name ? payload.name : (typeof payload.email === 'string' ? payload.email : 'Google user'),
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  }
}

interface GisId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void
  renderButton(el: HTMLElement, opts: { theme?: string; size?: string; width?: number }): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GisId } }
  }
}

let scriptPromise: Promise<void> | null = null

export function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GIS_SCRIPT
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection and try again.'))
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export async function renderGoogleButton(
  el: HTMLElement,
  onCredential: (profile: GoogleProfile) => void,
  onError: (message: string) => void
): Promise<void> {
  try {
    await loadGisScript()
    const id = window.google?.accounts?.id
    if (!id) throw new Error('Google sign-in did not initialise.')
    id.initialize({
      client_id: googleClientId,
      callback: (resp) => {
        try {
          onCredential(decodeIdToken(resp.credential))
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Google sign-in failed.')
        }
      },
    })
    id.renderButton(el, { theme: 'outline', size: 'large', width: 320 })
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Google sign-in failed.')
  }
}
