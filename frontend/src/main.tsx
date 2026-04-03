import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import * as Sentry from '@sentry/react'
import { registerSW } from 'virtual:pwa-register'
import { queryClient } from './lib/queryClient'
import { installChunkRecovery } from './utils/runtimeRecovery'
import App from './App'
import './index.css'

// Initialize Sentry for error tracking
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

const canonicalAppUrl = import.meta.env.VITE_APP_URL?.trim()
const isHerokuHost = window.location.hostname.endsWith('herokuapp.com')

if (canonicalAppUrl && isHerokuHost) {
  const canonicalUrl = new URL(canonicalAppUrl)
  canonicalUrl.pathname = window.location.pathname
  canonicalUrl.search = window.location.search
  canonicalUrl.hash = window.location.hash
  window.location.replace(canonicalUrl.toString())
}

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined

if (typeof window !== 'undefined') {
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateServiceWorker?.(true)
    },
  })

  installChunkRecovery(updateServiceWorker)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="p-8 text-center">Something went wrong. Please refresh.</div>}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1e293b',
                color: '#f8fafc',
                borderRadius: '12px',
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
