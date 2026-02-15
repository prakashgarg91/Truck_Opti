import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [, setIsProcessing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Authenticating... - TruckOpti'
    const timeoutId = window.setTimeout(() => {
      window.location.replace('/login')
    }, 8000)
    
    const handleAuthCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (setSessionError) {
            throw setSessionError
          }
        }

        const queryParams = new URLSearchParams(window.location.search)
        const code = queryParams.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            throw exchangeError
          }
        }

        let data: any = null
        let error: any = null
        for (let i = 0; i < 5; i++) {
          const result = await supabase.auth.getSession()
          data = result.data
          error = result.error
          if (data?.session) break
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        
        if (error) {
          logger.error('Auth callback error:', error)
          setError(error.message)
          toast.error('Authentication failed: ' + error.message)
          navigate('/login', { replace: true })
          return
        }

        if (data.session) {
          if (window.location.hash || window.location.search) {
            window.history.replaceState({}, document.title, '/auth/callback')
          }

          // Session successfully extracted
          toast.success('Successfully signed in!', {
            icon: '✅',
            duration: 2000
          })
          
          window.clearTimeout(timeoutId)
          window.location.replace('/')
        } else {
          // No session found - might be a direct visit to this page
          logger.warn('No session found in callback')
          window.clearTimeout(timeoutId)
          window.location.replace('/login')
        }
      } catch (err: any) {
        logger.error('Unexpected error during auth callback:', err)
        setError(err.message || 'An unexpected error occurred')
        toast.error('Authentication failed. Please try again.')
        window.clearTimeout(timeoutId)
        window.location.replace('/login')
      } finally {
        setIsProcessing(false)
      }
    }

    handleAuthCallback()
    return () => window.clearTimeout(timeoutId)
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Authentication Failed
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {error}
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="btn btn-primary"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="relative mb-6">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
          <div className="absolute inset-0 w-16 h-16 bg-primary-500/20 rounded-full animate-ping mx-auto" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Completing Sign In
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Please wait while we authenticate you...
        </p>
      </div>
    </div>
  )
}
