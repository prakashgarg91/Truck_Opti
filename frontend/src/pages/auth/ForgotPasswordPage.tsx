import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Send, Shield } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authSupabaseApi } from '../../services/supabaseApi'
import { emailSchema } from '../../utils/validators'
import { toUserFacingErrorMessage } from '../../utils/userFacingError'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isSent, setIsSent] = useState(false)

  useEffect(() => {
    document.title = 'Forgot Password - TruckOpti'
  }, [])

  const resetMutation = useMutation({
    mutationFn: async () => {
      await authSupabaseApi.resetPasswordForEmail(email)
    },
    onSuccess: () => {
      setIsSent(true)
      toast.success('Password reset link sent to your email.')
    },
    onError: (error: unknown) => {
      toast.error(toUserFacingErrorMessage(error, 'Failed to send reset email. Please try again.'))
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    const result = emailSchema.safeParse(email)
    if (!result.success) {
      setEmailError(result.error.issues[0]?.message || 'Invalid email address')
      return
    }

    setEmailError('')
    resetMutation.mutate()
  }

  const isEmailValid = emailSchema.safeParse(email).success

  return (
    <div className="p-6 animate-fade-in">
      <button
        onClick={() => navigate('/login')}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition-colors active:scale-95"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to login</span>
      </button>

      <div className="text-center mb-8 animate-slide-up">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
          <KeyRound className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Reset Your Password
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          We&apos;ll email you a secure link to choose a new password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Email Address
          </label>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (emailError) setEmailError('')
            }}
            placeholder="your@email.com"
            className={`input text-lg font-medium ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
            aria-invalid={!!emailError}
            autoFocus
          />
          {emailError ? (
            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
              <span>⚠️</span>
              {emailError}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Reset emails are sent through Supabase Auth and expire automatically.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!isEmailValid || resetMutation.isPending}
          className="btn btn-primary w-full text-base shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300 animate-slide-up disabled:shadow-none"
          style={{ animationDelay: '200ms' }}
        >
          {resetMutation.isPending ? (
            <>
              <div className="spinner w-5 h-5" />
              <span>Sending reset link...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Send Reset Link</span>
            </>
          )}
        </button>
      </form>

      {isSent && (
        <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl animate-fade-in">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Check your inbox and spam folder for the password reset email.
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400 animate-fade-in" style={{ animationDelay: '300ms' }}>
        Remembered your password?{' '}
        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}