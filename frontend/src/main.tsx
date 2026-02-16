import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import App from './App'
import './index.css'

const canonicalAppUrl = import.meta.env.VITE_APP_URL?.trim()
const isHerokuHost = window.location.hostname.endsWith('herokuapp.com')

if (canonicalAppUrl && isHerokuHost) {
  const canonicalUrl = new URL(canonicalAppUrl)
  canonicalUrl.pathname = window.location.pathname
  canonicalUrl.search = window.location.search
  canonicalUrl.hash = window.location.hash
  window.location.replace(canonicalUrl.toString())
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
  </React.StrictMode>,
)
