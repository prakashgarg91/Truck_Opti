import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import clsx from 'clsx'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const STORAGE_KEY = 'install-prompt-dismissed'
const AUTO_HIDE_DELAY = 3000 // 3 seconds

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Check if user previously dismissed the prompt
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed === 'true') {
      setIsDismissed(true)
      return
    }

    // Treat tablet-and-up widths as desktop so app-shell breakpoints stay consistent.
    const checkMobile = () => {
      const isMobileScreen = window.innerWidth < 768
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
      setIsMobile(isMobileScreen || isMobileUA)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      if (!isDismissed) {
        setIsVisible(true)
        // Auto-hide after 3 seconds
        setTimeout(() => {
          setIsVisible(false)
        }, AUTO_HIDE_DELAY)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [isDismissed])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setIsVisible(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    localStorage.setItem(STORAGE_KEY, 'true')
  }

  // Don't render if not mobile, already dismissed, or no prompt available
  if (!isMobile || isDismissed || (!deferredPrompt && !isVisible)) {
    return null
  }

  return (
    <div
      className={clsx(
        'fixed top-16 left-4 right-4 z-30 transition-all duration-500 ease-out md:hidden',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      )}
    >
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-lg shadow-green-500/30 p-4">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Download className="w-5 h-5 text-white" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">
              Add to Home Screen
            </p>
            <p className="text-white/80 text-xs mt-0.5">
              Install TruckOpti for quick access
            </p>
          </div>

          {/* Install Button */}
          <button
            onClick={handleInstall}
            className="flex-shrink-0 px-4 py-2 bg-white text-green-600 font-medium text-sm rounded-xl hover:bg-green-50 transition-colors active:scale-95"
          >
            Install
          </button>

          {/* Dismiss Button */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
