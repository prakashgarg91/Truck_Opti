import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [, setIsProcessing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Authenticating... - TruckOpti'
    
    const handleAuthCallback = async () => {
      try {
        // Extract session from URL hash (Supabase handles this automatically)
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Auth callback error:', error)
          setError(error.message)
          toast.error('Authentication failed: ' + error.message)
          navigate('/login', { replace: true })
          return
        }

        if (data.session) {
          // Session successfully extracted
          toast.success('Successfully signed in!', {
            icon: '✅',
            duration: 2000
          })
          
          // Redirect to dashboard
          navigate('/', { replace: true })
        } else {
          // No session found - might be a direct visit to this page
          console.warn('No session found in callback')
          navigate('/login', { replace: true })
        }
      } catch (err: any) {
        console.error('Unexpected error during auth callback:', err)
        setError(err.message || 'An unexpected error occurred')
        toast.error('Authentication failed. Please try again.')
        navigate('/login', { replace: true })
      } finally {
        setIsProcessing(false)
      }
    }

    handleAuthCallback()
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
