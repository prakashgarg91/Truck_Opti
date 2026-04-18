const AUTH_RETURN_TO_STORAGE_KEY = 'truckopti-auth-return-to'

const BLOCKED_AUTH_PREFIXES = [
  '/login',
  '/signup',
  '/otp',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
]

type RouteSnapshot = {
  pathname?: string
  search?: string
  hash?: string
}

export type AuthRouteState = {
  from?: RouteSnapshot
} | null | undefined

export function isSafeAuthReturnTo(path?: string | null): path is string {
  if (!path || typeof path !== 'string') return false
  if (!path.startsWith('/') || path.startsWith('//')) return false

  return !BLOCKED_AUTH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`))
}

export function buildAuthReturnTo(state?: AuthRouteState): string | null {
  const from = state?.from
  if (!from?.pathname) return null

  const candidate = `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
  return isSafeAuthReturnTo(candidate) ? candidate : null
}

export function storeAuthReturnTo(path?: string | null) {
  if (typeof window === 'undefined') return

  if (isSafeAuthReturnTo(path)) {
    window.sessionStorage.setItem(AUTH_RETURN_TO_STORAGE_KEY, path)
    return
  }

  window.sessionStorage.removeItem(AUTH_RETURN_TO_STORAGE_KEY)
}

export function consumeAuthReturnTo(): string | null {
  if (typeof window === 'undefined') return null

  const value = window.sessionStorage.getItem(AUTH_RETURN_TO_STORAGE_KEY)
  window.sessionStorage.removeItem(AUTH_RETURN_TO_STORAGE_KEY)
  return isSafeAuthReturnTo(value) ? value : null
}