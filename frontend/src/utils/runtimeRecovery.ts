const RECOVERY_WINDOW_MS = 15_000
const RECOVERY_KEY = 'truckopti:runtime-recovery-at'

type ServiceWorkerUpdater = (reloadPage?: boolean) => Promise<void>

const CHUNK_ERROR_PATTERNS = [
  'chunkloaderror',
  'loading chunk',
  'failed to fetch dynamically imported module',
  'failed to fetch module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'module script',
  'dynamically imported module',
]

const getErrorText = (value: unknown): string => {
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join(' ').toLowerCase()
  }

  if (typeof value === 'string') {
    return value.toLowerCase()
  }

  if (value && typeof value === 'object') {
    const maybeMessage = (value as { message?: unknown }).message
    if (typeof maybeMessage === 'string') {
      return maybeMessage.toLowerCase()
    }
  }

  return ''
}

export const isChunkLoadLikeError = (value: unknown): boolean => {
  const text = getErrorText(value)
  return CHUNK_ERROR_PATTERNS.some((pattern) => text.includes(pattern))
}

const shouldThrottleRecovery = (): boolean => {
  if (typeof window === 'undefined') {
    return true
  }

  const now = Date.now()
  const lastAttempt = Number(sessionStorage.getItem(RECOVERY_KEY) || '0')

  if (now - lastAttempt < RECOVERY_WINDOW_MS) {
    return true
  }

  sessionStorage.setItem(RECOVERY_KEY, String(now))
  return false
}

const clearRuntimeCaches = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)))
  }
}

const unregisterServiceWorkers = async (): Promise<void> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
}

export const triggerRuntimeRecovery = async (
  updateServiceWorker?: ServiceWorkerUpdater,
): Promise<boolean> => {
  if (typeof window === 'undefined' || shouldThrottleRecovery()) {
    return false
  }

  try {
    await updateServiceWorker?.(false)
  } catch {
    // Best effort only. A normal reload is still better than leaving the app stuck.
  }

  try {
    await clearRuntimeCaches()
  } catch {
    // Cache cleanup is additive; keep moving if it fails.
  }

  try {
    await unregisterServiceWorkers()
  } catch {
    // Unregistering old workers is additive; keep moving if it fails.
  }

  window.location.reload()
  return true
}

export const installChunkRecovery = (
  updateServiceWorker?: ServiceWorkerUpdater,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const recover = () => {
    void triggerRuntimeRecovery(updateServiceWorker)
  }

  const handlePreloadError = (event: Event) => {
    event.preventDefault?.()
    recover()
  }

  const handleWindowError = (event: ErrorEvent) => {
    if (!isChunkLoadLikeError(event.error ?? event.message)) {
      return
    }

    event.preventDefault?.()
    recover()
  }

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!isChunkLoadLikeError(event.reason)) {
      return
    }

    event.preventDefault?.()
    recover()
  }

  window.addEventListener('vite:preloadError', handlePreloadError)
  window.addEventListener('error', handleWindowError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)

  return () => {
    window.removeEventListener('vite:preloadError', handlePreloadError)
    window.removeEventListener('error', handleWindowError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }
}
