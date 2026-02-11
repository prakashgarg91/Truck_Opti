import { useState, useEffect } from 'react'
import { WifiOff, X } from 'lucide-react'
import clsx from 'clsx'

/**
 * OfflineBanner - A sticky banner that displays when the user loses internet connection
 * 
 * Features:
 * - Monitors navigator.onLine status
 * - Listens to window online/offline events
 * - Auto-hides when connection is restored
 * - Can be manually dismissed (will reappear if goes offline again)
 * - Fixed position at top of viewport with high z-index
 */
export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Handle online event
    const handleOnline = () => {
      setIsOnline(true)
      setIsDismissed(false)
      // Delay hiding to show "back online" state briefly
      setTimeout(() => setShowBanner(false), 2000)
    }

    // Handle offline event
    const handleOffline = () => {
      setIsOnline(false)
      setIsDismissed(false)
      setShowBanner(true)
    }

    // Initial check
    if (!navigator.onLine) {
      setShowBanner(true)
    }

    // Add event listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    setShowBanner(false)
  }

  // Don't render if banner shouldn't be shown
  if (!showBanner || isDismissed) {
    return null
  }

  return (
    <div
      className={clsx(
        'fixed top-0 left-0 right-0 z-50',
        'transition-all duration-300 ease-out',
        'animate-slide-down'
      )}
      role="alert"
      aria-live="polite"
    >
      <div
        className={clsx(
          'flex items-center justify-between',
          'px-4 py-3',
          'bg-amber-500 dark:bg-amber-600',
          'text-white',
          'shadow-lg',
          isOnline && 'bg-green-500 dark:bg-green-600'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-lg">
            {isOnline ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <WifiOff className="w-5 h-5" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">
              {isOnline ? 'Back online' : 'No internet connection'}
            </span>
            <span className="text-xs text-white/80">
              {isOnline
                ? 'Your connection has been restored'
                : 'Please check your network settings'}
            </span>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Safe area spacing for mobile devices with notches */}
      <div className="safe-area-inset-top" />
    </div>
  )
}
