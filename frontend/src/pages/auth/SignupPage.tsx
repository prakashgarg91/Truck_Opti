import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, KeyRound, Send, Shield, Sparkles, UserPlus } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authSupabaseApi } from '../../services/supabaseApi'
import { useAuthStore } from '../../stores/authStore'
import { useLanguageStore } from '../../stores/languageStore'
import { emailSchema, passwordSchema } from '../../utils/validators'
import { UserFacingError, toUserFacingErrorMessage } from '../../utils/userFacingError'

const features = [
  { icon: '📦', text: '3D Smart Packing' },
  { icon: '🚛', text: 'Route Optimization' },
  { icon: '📍', text: 'Live GPS Tracking' },
]

const isEmailOtpEnabled = import.meta.env.VITE_AUTH_EMAIL_OTP_ENABLED !== 'false'
const isPasswordEnabled = import.meta.env.VITE_AUTH_PASSWORD_ENABLED === 'true'

type SignupMode = 'otp' | 'password'

export default function SignupPage() {
  const navigate = useNavigate()
  const { setPendingPhone } = useAuthStore()
  const { language } = useLanguageStore()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [emailError, setEmailError] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [signupMode, setSignupMode] = useState<SignupMode>(isEmailOtpEnabled ? 'otp' : 'password')
  const [isFocused, setIsFocused] = useState<string | null>(null)
  const [currentFeature, setCurrentFeature] = useState(0)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  // Rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature(prev => (prev + 1) % features.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    document.title = 'Sign Up - TruckOpti'
  }, [])

  useEffect(() => {
    if (!isEmailOtpEnabled && isPasswordEnabled) {
      setSignupMode('password')
      return
    }

    if (!isEmailOtpEnabled && !isPasswordEnabled) {
      setSignupMode('otp')
    }
  }, [])

  useEffect(() => {
    setEmailError('')
    setPasswordError('')
  }, [signupMode])

  const signupMutation = useMutation({
    mutationFn: async () => {
      if (signupMode === 'password') {
        const data = await authSupabaseApi.signUpWithEmailPassword(email, password, name)
        return { mode: 'password' as const, data }
      }

      if (!isEmailOtpEnabled) {
        throw new UserFacingError('Email signup is disabled. Please use Google sign up.')
      }

      await authSupabaseApi.signUpWithEmail(email, name)
      return { mode: 'otp' as const }
    },
    onSuccess: (result) => {
      if (result.mode === 'password') {
        setPendingPhone(null)

        if (result.data.session) {
          toast.success('Account created. Completing sign in...')
          navigate('/auth/callback', { replace: true })
          return
        }

        toast.success('Account created. Check your email to confirm your new password.')
        navigate('/login', { replace: true })
        return
      }

      setPendingPhone(email)
      toast.success('Verification code sent to your email 📧', { duration: 3000 })
      navigate('/otp', { state: { channel: 'email', contact: email, isSignup: true } })
    },
    onError: (error: unknown) => {
      toast.error(
        language === 'en'
          ? toUserFacingErrorMessage(error, 'Failed to create account')
          : 'खाता बनाने में विफल'
      )
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const result = emailSchema.safeParse(email)
    if (!result.success) {
      setEmailError(result.error.issues[0]?.message || 'Invalid email address')
      return
    }

    if (signupMode === 'password') {
      const passwordResult = passwordSchema.safeParse(password)
      if (!passwordResult.success) {
        setPasswordError(passwordResult.error.issues[0]?.message || 'Invalid password')
        return
      }
    } else if (!isEmailOtpEnabled) {
      toast.error('Email signup is disabled. Please use Google sign up.')
      return
    }

    setEmailError('')
    setPasswordError('')
    signupMutation.mutate()
  }

  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const isEmailValid = emailSchema.safeParse(email).success
  const isPasswordValid = passwordSchema.safeParse(password).success

  const handleGoogleSignup = async () => {
    try {
      setIsGoogleLoading(true)
      await authSupabaseApi.signInWithGoogle()
    } catch (error: unknown) {
      toast.error(toUserFacingErrorMessage(error, 'Failed to initiate Google signup'))
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="p-6 animate-fade-in">
      {/* Animated Feature Badge */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-50 to-saffron/10 dark:from-primary-900/30 dark:to-saffron/10 rounded-full border border-primary-100 dark:border-primary-800 animate-scale-in">
          <Sparkles className="w-4 h-4 text-saffron animate-pulse" />
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300 transition-all duration-500">
            {features[currentFeature].icon} {features[currentFeature].text}
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
          <UserPlus className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Create Your Account
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Join India's smartest logistics platform 🇮🇳
        </p>
      </div>

      {isPasswordEnabled && (
        <div className="animate-slide-up mb-6" style={{ animationDelay: '75ms' }}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Choose signup method
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSignupMode('otp')}
              disabled={!isEmailOtpEnabled}
              className={`relative flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 transition-all duration-300 ${signupMode === 'otp'
                ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-600 shadow-lg shadow-primary-500/20'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Send className="w-4 h-4" />
              <span className="font-medium text-sm">Email OTP</span>
            </button>
            <button
              type="button"
              onClick={() => setSignupMode('password')}
              className={`relative flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 transition-all duration-300 ${signupMode === 'password'
                ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <KeyRound className="w-4 h-4" />
              <span className="font-medium text-sm">Password</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {signupMode === 'password'
              ? 'Password signup assigns a login ID automatically and shows it in your profile after sign-in.'
              : 'Email OTP remains the default public signup path.'}
          </p>
        </div>
      )}

      {/* Signup Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name Input */}
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Full Name
          </label>
          <div className={`relative transition-all duration-300 ${isFocused === 'name' ? 'scale-[1.02]' : ''}`}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setIsFocused('name')}
              onBlur={() => setIsFocused(null)}
              placeholder="Enter your full name"
              className="input text-lg font-medium"
              autoFocus
              aria-label="Enter your full name"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            This will be shown on invoices & shipments
          </p>
        </div>

        {/* Email Input */}
        <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Email Address
          </label>
          <div className={`relative transition-all duration-300 ${isFocused === 'email' ? 'scale-[1.02]' : ''}`}>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError('')
              }}
              onFocus={() => setIsFocused('email')}
              onBlur={() => setIsFocused(null)}
              placeholder="your@email.com"
              className={`input text-lg font-medium ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              aria-label="Enter your email address"
              aria-invalid={!!emailError}
            />
            {isEmailValid && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 animate-scale-in">
                <Shield className="w-5 h-5" />
              </div>
            )}
          </div>
          {emailError ? (
            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
              <span>⚠️</span> {emailError}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
              <Send className="w-3 h-3" />
              We'll send a 6-digit verification code
            </p>
          )}
        </div>

        {signupMode === 'password' && (
          <div className="animate-slide-up" style={{ animationDelay: '250ms' }}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Password
            </label>
            <div className={`relative transition-all duration-300 ${isFocused === 'password' ? 'scale-[1.02]' : ''}`}>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <KeyRound className="w-5 h-5" />
              </div>
              <input
                type={isPasswordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (passwordError) setPasswordError('')
                }}
                onFocus={() => setIsFocused('password')}
                onBlur={() => setIsFocused(null)}
                placeholder="Use at least 8 characters"
                className={`input pl-12 pr-12 text-lg font-medium ${passwordError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                aria-invalid={!!passwordError}
              />
              <button
                type="button"
                onClick={() => setIsPasswordVisible((current) => !current)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {passwordError ? (
              <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                <span>⚠️</span> {passwordError}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                <KeyRound className="w-3 h-3" />
                Use letters and numbers for a stronger password.
              </p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={signupMutation.isPending || !isEmailValid || (signupMode === 'otp' ? !isEmailOtpEnabled : !isPasswordValid)}
          className="btn btn-primary w-full text-base shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300 animate-slide-up disabled:shadow-none"
          style={{ animationDelay: '300ms' }}
        >
          {signupMutation.isPending ? (
            <>
              <div className="spinner w-5 h-5" />
              <span>{signupMode === 'password' ? 'Creating password account...' : 'Creating account...'}</span>
            </>
          ) : (
            <>
              <span>{signupMode === 'password' ? 'Create Password Account' : (isEmailOtpEnabled ? 'Create Account' : 'Email Signup Disabled')}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
        {!isEmailOtpEnabled && signupMode === 'otp' && (
          <p className="mt-2 text-xs text-slate-500">
            Email OTP signup is disabled in this environment. Use Google signup below.
          </p>
        )}
      </form>

      {/* Divider */}
      <div className="relative my-8 animate-fade-in" style={{ animationDelay: '400ms' }}>
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white dark:bg-slate-800 text-slate-500">
            Or sign up with
          </span>
        </div>
      </div>

      {/* Google Signup */}
      <button
        onClick={handleGoogleSignup}
        disabled={isGoogleLoading}
        className="btn btn-secondary w-full group hover:scale-[1.02] transition-all duration-300 animate-slide-up disabled:opacity-70 disabled:cursor-not-allowed"
        style={{ animationDelay: '500ms' }}
      >
        {isGoogleLoading ? (
          <>
            <div className="spinner w-5 h-5 border-2 border-slate-400" />
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Sign up with Google</span>
          </>
        )}
      </button>

      {/* Login Link */}
      <div className="mt-6 text-center animate-fade-in" style={{ animationDelay: '600ms' }}>
        <p className="text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-semibold hover:underline">
            Log In
          </Link>
        </p>
      </div>

      {/* Terms */}
      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 animate-fade-in" style={{ animationDelay: '700ms' }}>
        By creating an account, you agree to our{' '}
        <Link to="/terms" className="text-primary-600 hover:underline font-medium">Terms</Link>
        {' '}and{' '}
        <Link to="/privacy" className="text-primary-600 hover:underline font-medium">Privacy Policy</Link>
      </p>
    </div>
  )
}
