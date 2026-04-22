import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { ArrowRight, Building2, Eye, EyeOff, KeyRound, LogIn, MessageCircle, Phone, Send, Shield, Sparkles, Truck, UserCog, type LucideIcon } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authSupabaseApi } from '../../services/supabaseApi'
import { useAuthStore } from '../../stores/authStore'
import { emailOrLoginIdSchema, emailSchema, passwordSchema, phoneInputSchema } from '../../utils/validators'
import { UserFacingError, toUserFacingErrorMessage } from '../../utils/userFacingError'
import { logger } from '../../utils/logger'
import { buildAuthReturnTo, storeAuthReturnTo, type AuthRouteState } from '../../utils/authReturnTo'

const features = [
  { icon: '📦', text: '3D Smart Packing' },
  { icon: '🚛', text: 'Route Optimization' },
  { icon: '📍', text: 'Live GPS Tracking' },
]

const isEmailOtpEnabled = import.meta.env.VITE_AUTH_EMAIL_OTP_ENABLED !== 'false'
const isPhoneOtpEnabled = import.meta.env.VITE_AUTH_PHONE_OTP_ENABLED === 'true'
const isPasswordEnabled = import.meta.env.VITE_AUTH_PASSWORD_ENABLED === 'true'

type AuthMode = 'otp' | 'password'
type LoginSurfaceMode = 'default' | 'driver' | 'agency' | 'office' | 'partner'

type SurfaceConfig = {
  badge: string
  icon: LucideIcon
  iconClasses: string
  title: string
  subtitle: string
  signupHref: string | null
  signupIntro: string
  signupAction: string
  supportText: string | null
  passwordHint: string
  showTrustBadges: boolean
}

const SURFACE_CONFIG: Record<LoginSurfaceMode, SurfaceConfig> = {
  default: {
    badge: '',
    icon: LogIn,
    iconClasses: 'from-primary-500 to-primary-600 shadow-primary-500/30',
    title: 'Welcome Back',
    subtitle: 'Log in to your TruckOpti account',
    signupHref: '/signup',
    signupIntro: "Don't have an account?",
    signupAction: 'Create Account',
    supportText: null,
    passwordHint: 'Password sign-in accepts your seeded email address or login ID.',
    showTrustBadges: true,
  },
  driver: {
    badge: '🚚 Driver trips, earnings, and dispatch access',
    icon: Truck,
    iconClasses: 'from-emerald-500 to-green-600 shadow-emerald-500/30',
    title: 'Driver Login',
    subtitle: 'Access live trips, earnings, and delivery updates.',
    signupHref: '/driver/register',
    signupIntro: 'Need to join as a driver?',
    signupAction: 'Register Driver',
    supportText: null,
    passwordHint: 'Password sign-in accepts your seeded driver email address or login ID when enabled.',
    showTrustBadges: true,
  },
  agency: {
    badge: '🏢 Agency fleet, jobs, and billing access',
    icon: Building2,
    iconClasses: 'from-sky-500 to-indigo-600 shadow-sky-500/30',
    title: 'Agency Login',
    subtitle: 'Manage fleet operations, drivers, jobs, and billing in one place.',
    signupHref: '/agency/register',
    signupIntro: 'New transport agency?',
    signupAction: 'Register Agency',
    supportText: null,
    passwordHint: 'Password sign-in accepts your seeded agency email address or login ID when enabled.',
    showTrustBadges: true,
  },
  office: {
    badge: '🛡️ Backoffice, demo, and reviewer workspace access',
    icon: UserCog,
    iconClasses: 'from-slate-700 to-slate-900 shadow-slate-700/30',
    title: 'Office Login',
    subtitle: 'Access admin, operations, demo, and reviewer workflows.',
    signupHref: null,
    signupIntro: '',
    signupAction: '',
    supportText: 'Office, reviewer, and demo accounts are provisioned by TruckOpti admins. Use your seeded email address or login ID once the account is ready.',
    passwordHint: 'Password sign-in accepts your seeded office, reviewer, or demo email address or login ID.',
    showTrustBadges: false,
  },
  partner: {
    badge: '🔗 Partner and reseller access',
    icon: KeyRound,
    iconClasses: 'from-indigo-600 to-violet-700 shadow-indigo-600/30',
    title: 'Partner Login',
    subtitle: 'Use your provisioned partner or reviewer account to access TruckOpti.',
    signupHref: null,
    signupIntro: '',
    signupAction: '',
    supportText: 'Partner accounts are provisioned by TruckOpti. Use your seeded email address or login ID when the account is ready.',
    passwordHint: 'Password sign-in accepts your partner or reviewer email address or login ID.',
    showTrustBadges: false,
  },
}

const resolveSurfaceMode = (requestedMode: string | null, returnTo: string | null): LoginSurfaceMode => {
  if (requestedMode === 'driver') return 'driver'
  if (requestedMode === 'agency') return 'agency'
  if (requestedMode === 'partner') return 'partner'
  if (requestedMode === 'admin' || requestedMode === 'office') return 'office'

  if (returnTo?.startsWith('/driver')) return 'driver'
  if (returnTo?.startsWith('/agency')) return 'agency'
  if (returnTo?.startsWith('/admin')) return 'office'

  return 'default'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setPendingPhone } = useAuthStore()
  const returnTo = buildAuthReturnTo(location.state as AuthRouteState)
  const requestedMode = new URLSearchParams(location.search).get('mode')
  const surfaceMode = resolveSurfaceMode(requestedMode, returnTo)
  const surface = SURFACE_CONFIG[surfaceMode]
  const SurfaceIcon = surface.icon
  const modeParam = surfaceMode === 'default' ? '' : `?mode=${surfaceMode === 'office' ? 'admin' : surfaceMode}`
  const [authMode, setAuthMode] = useState<AuthMode>(
    isPasswordEnabled && (surfaceMode === 'office' || surfaceMode === 'partner') ? 'password' : 'otp'
  )
  const [contact, setContact] = useState('')
  const [contactError, setContactError] = useState('')
  const [passwordIdentifier, setPasswordIdentifier] = useState('')
  const [emailError, setEmailError] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | 'email'>(
    isEmailOtpEnabled ? 'email' : isPhoneOtpEnabled ? 'sms' : 'email'
  )
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [currentFeature, setCurrentFeature] = useState(0)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const availableOtpChannelCount = (isEmailOtpEnabled ? 1 : 0) + (isPhoneOtpEnabled ? 2 : 0)

  // Rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature(prev => (prev + 1) % features.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    document.title = `${surface.title} - TruckOpti`
  }, [surface.title])

  useEffect(() => {
    if (!returnTo) {
      storeAuthReturnTo(null)
    }
  }, [returnTo])

  useEffect(() => {
    if (!isPasswordEnabled) {
      setAuthMode('otp')
      return
    }

    if (surfaceMode === 'office' || surfaceMode === 'partner') {
      setAuthMode('password')
    }
  }, [surfaceMode])

  useEffect(() => {
    if (!isPhoneOtpEnabled && channel !== 'email') {
      setChannel('email')
      return
    }

    if (!isEmailOtpEnabled && channel === 'email' && isPhoneOtpEnabled) {
      setChannel('sms')
    }
  }, [channel])

  // Clear input when channel changes
  useEffect(() => {
    setContact('')
    setContactError('')
  }, [channel])

  useEffect(() => {
    setContactError('')
    setEmailError('')
    setPasswordError('')
  }, [authMode])

  const sendOTPMutation = useMutation({
    mutationFn: async () => {
      if (channel === 'email') {
        if (!isEmailOtpEnabled) {
          throw new UserFacingError('')
        }
        await authSupabaseApi.signInWithEmail(contact)
        return { success: true, channel: 'email' }
      } else {
        if (!isPhoneOtpEnabled) {
          throw new UserFacingError('')
        }

        // Format phone with country code for Supabase
        const formattedPhone = contact.startsWith('+') ? contact : `+91${contact}`
        await authSupabaseApi.signInWithPhone(formattedPhone, channel as 'sms' | 'whatsapp')
        return { success: true, channel }
      }
    },
    onSuccess: (data) => {
      setPendingPhone(contact)
      const channelLabel = data.channel === 'email' ? 'Email' : data.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'
      const successMsg = data.channel === 'email'
        ? ('OTP sent to email')
        : (`OTP sent via ${channelLabel}`)
      toast.success(successMsg, {
        icon: data.channel === 'email' ? '📧' : '📱',
        duration: 3000
      })
      navigate('/otp', { state: { channel, contact, returnTo } })
    },
    onError: (error: unknown) => {
      logger.error('[LoginPage] OTP error:', error)
      const errorMsg = toUserFacingErrorMessage(error, 'Failed to send OTP. Please try again.')
      toast.error(errorMsg)
    }
  })

  const passwordLoginMutation = useMutation({
    mutationFn: async () => authSupabaseApi.signInWithEmailPassword(passwordIdentifier, password),
    onSuccess: () => {
      storeAuthReturnTo(returnTo)
      navigate('/auth/callback', { replace: true })
    },
    onError: (error: unknown) => {
      logger.error('[LoginPage] Password login error:', error)
      toast.error(toUserFacingErrorMessage(error, 'Failed to sign in with password. Please try again.'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (authMode === 'password') {
      const identifierResult = emailOrLoginIdSchema.safeParse(passwordIdentifier)
      if (!identifierResult.success) {
        setEmailError(identifierResult.error.issues[0]?.message || 'Invalid email address or login ID')
        return
      }

      const passwordResult = passwordSchema.safeParse(password)
      if (!passwordResult.success) {
        setPasswordError(passwordResult.error.issues[0]?.message || 'Invalid password')
        return
      }

      setEmailError('')
      setPasswordError('')
      passwordLoginMutation.mutate()
      return
    }

    // Validate based on channel
    if (channel === 'email') {
      const result = emailSchema.safeParse(contact)
      if (!result.success) {
        setContactError(result.error.issues[0]?.message || 'Invalid email address')
        return
      }
    } else {
      // Validate phone number with Zod
      const result = phoneInputSchema.safeParse(contact)
      if (!result.success) {
        setContactError(result.error.issues[0]?.message || 'Invalid phone number')
        return
      }
    }

    setContactError('')
    sendOTPMutation.mutate()
  }

  const handleContactChange = (value: string) => {
    if (channel === 'email') {
      setContact(value)
      // Clear error when user starts typing
      if (contactError && value.length > 0) {
        setContactError('')
      }
      return
    }

    const digits = value.replace(/\D/g, '').slice(0, 10)
    setContact(digits)

    // Clear error when user starts typing
    if (contactError && digits.length > 0) {
      setContactError('')
    }

    // Validate on complete
    if (digits.length === 10) {
      const result = phoneInputSchema.safeParse(digits)
      if (!result.success) {
        setContactError(result.error.issues[0]?.message || 'Invalid phone number')
      } else {
        setContactError('')
      }
    }
  }

  const isOtpChannelAvailable = channel === 'email' ? isEmailOtpEnabled : isPhoneOtpEnabled

  const isContactValid = authMode === 'otp' && isOtpChannelAvailable && (channel === 'email'
    ? emailSchema.safeParse(contact).success
    : phoneInputSchema.safeParse(contact).success)

  const isPasswordLoginValid = emailOrLoginIdSchema.safeParse(passwordIdentifier).success && passwordSchema.safeParse(password).success

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true)
      storeAuthReturnTo(returnTo)
      await authSupabaseApi.signInWithGoogle()
      // Note: The page will redirect to Google, so we won't reach here
    } catch (error: unknown) {
      toast.error(toUserFacingErrorMessage(error, 'Failed to initiate Google login'))
      setIsGoogleLoading(false)
    }
  }

  // Format phone number for display (only for phone inputs)
  const formatPhone = (value: string) => {
    if (channel === 'email') return value
    if (value.length <= 5) return value
    return `${value.slice(0, 5)} ${value.slice(5)}`
  }

  const activeBadgeText = surfaceMode === 'default'
    ? `${features[currentFeature].icon} ${features[currentFeature].text}`
    : surface.badge

  const modeNotice = !isPasswordEnabled && (surfaceMode === 'office' || surfaceMode === 'partner')
    ? 'Password login is hidden in this environment until VITE_AUTH_PASSWORD_ENABLED=true.'
    : null

  return (
    <div className="p-6 animate-fade-in">
      {/* Animated Feature Badge */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-50 to-saffron/10 dark:from-primary-900/30 dark:to-saffron/10 rounded-full border border-primary-100 dark:border-primary-800 animate-scale-in">
          <Sparkles className="w-4 h-4 text-saffron animate-pulse" />
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300 transition-all duration-500">
            {activeBadgeText}
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <div className={`w-14 h-14 bg-gradient-to-br ${surface.iconClasses} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
          <SurfaceIcon className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {surface.title}
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          {surface.subtitle}
        </p>
        {modeNotice && (
          <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
            {modeNotice}
          </p>
        )}
      </div>

      {isPasswordEnabled && (
        <div className="animate-slide-up mb-6" style={{ animationDelay: '75ms' }}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Choose sign-in method
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAuthMode('otp')}
              className={`relative flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 transition-all duration-300 ${authMode === 'otp'
                ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-600 shadow-lg shadow-primary-500/20'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
            >
              <Send className="w-4 h-4" />
              <span className="font-medium text-sm">OTP</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('password')}
              className={`relative flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 transition-all duration-300 ${authMode === 'password'
                ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
            >
              <KeyRound className="w-4 h-4" />
              <span className="font-medium text-sm">Password</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {authMode === 'password'
              ? surface.passwordHint
              : 'Email OTP + Google remain the default public launch sign-in paths.'}
          </p>
        </div>
      )}

      {/* Auth Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {authMode === 'password' ? (
          <>
            <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email or Login ID
              </label>
              <div className={`relative transition-all duration-300 ${focusedField === 'password-email' ? 'scale-[1.02]' : ''}`}>
                <input
                  type="text"
                  inputMode="email"
                  value={passwordIdentifier}
                  onChange={(event) => {
                    setPasswordIdentifier(event.target.value)
                    if (emailError) setEmailError('')
                  }}
                  onFocus={() => setFocusedField('password-email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="your@email.com or demo.driver"
                  className={`input text-lg tracking-wide font-medium ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  autoFocus
                  aria-invalid={!!emailError}
                />
              </div>
              {emailError ? (
                <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                  <span>⚠️</span>
                  {emailError}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Use the seeded mailbox or assigned login ID connected to your TruckOpti account.
                </p>
              )}
            </div>

            <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Link to={`/forgot-password${modeParam}`} className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className={`relative transition-all duration-300 ${focusedField === 'password' ? 'scale-[1.02]' : ''}`}>
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
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password"
                  className={`input pl-12 pr-12 text-lg tracking-wide font-medium ${passwordError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
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
                  <span>⚠️</span>
                  {passwordError}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" />
                  Use at least 8 characters with letters and numbers.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {channel === 'email' ? 'Email Address' : 'Mobile Number'}
              </label>
              <div className={`relative transition-all duration-300 ${focusedField === 'contact' ? 'scale-[1.02]' : ''}`}>
                {channel !== 'email' && (
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-slate-500 pointer-events-none">
                    <span className="text-lg">🇮🇳</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">+91</span>
                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600" />
                  </div>
                )}
                <input
                  type={channel === 'email' ? 'email' : 'tel'}
                  inputMode={channel === 'email' ? 'email' : 'numeric'}
                  value={channel === 'email' ? contact : formatPhone(contact)}
                  onChange={(event) => handleContactChange(event.target.value)}
                  onFocus={() => setFocusedField('contact')}
                  onBlur={() => setFocusedField(null)}
                  placeholder={channel === 'email' ? 'your@email.com' : '98765 43210'}
                  className={`input ${channel !== 'email' ? 'pl-[105px]' : ''} text-lg tracking-wide font-medium ${contactError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  autoFocus
                  aria-label={channel === 'email' ? 'Enter your email address' : 'Enter your 10-digit mobile number'}
                  aria-invalid={!!contactError}
                />
                {contact.length === 10 && !contactError && channel !== 'email' && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 animate-scale-in">
                    <Shield className="w-5 h-5" />
                  </div>
                )}
              </div>
              {contactError ? (
                <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                  <span>⚠️</span>
                  {contactError}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {channel === 'email' ? 'Your email is secure and never shared.' : 'Your number is secure and never shared.'}
                </p>
              )}
            </div>

            <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Receive OTP via
              </label>
              <div className={`grid gap-3 ${availableOtpChannelCount >= 3 ? 'grid-cols-3' : availableOtpChannelCount === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {isEmailOtpEnabled && (
                  <button
                    type="button"
                    onClick={() => setChannel('email')}
                    className={`relative flex items-center justify-center gap-2 py-4 px-2 rounded-xl border-2 transition-all duration-300 ripple ${channel === 'email'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-600 shadow-lg shadow-blue-500/20 scale-[1.02]'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    aria-pressed={channel === 'email'}
                  >
                    <Send className={`w-4 h-4 ${channel === 'email' ? 'animate-bounce-subtle' : ''}`} />
                    <span className="font-medium text-sm">Email</span>
                    {channel === 'email' && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center animate-scale-in">
                        <span className="text-white text-xs">✓</span>
                      </span>
                    )}
                  </button>
                )}
                {isPhoneOtpEnabled && (
                  <>
                    <button
                      type="button"
                      onClick={() => setChannel('whatsapp')}
                      className={`relative flex items-center justify-center gap-2 py-4 px-2 rounded-xl border-2 transition-all duration-300 ripple ${channel === 'whatsapp'
                        ? 'border-green-600 bg-green-50 dark:bg-green-900/30 text-green-600 shadow-lg shadow-green-500/20 scale-[1.02]'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      aria-pressed={channel === 'whatsapp'}
                    >
                      <MessageCircle className={`w-4 h-4 ${channel === 'whatsapp' ? 'animate-bounce-subtle' : ''}`} />
                      <span className="font-medium text-sm">WhatsApp</span>
                      {channel === 'whatsapp' && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center animate-scale-in">
                          <span className="text-white text-xs">✓</span>
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('sms')}
                      className={`relative flex items-center justify-center gap-2 py-4 px-2 rounded-xl border-2 transition-all duration-300 ripple ${channel === 'sms'
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-600 shadow-lg shadow-primary-500/20 scale-[1.02]'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      aria-pressed={channel === 'sms'}
                    >
                      <Phone className={`w-4 h-4 ${channel === 'sms' ? 'animate-bounce-subtle' : ''}`} />
                      <span className="font-medium text-sm">SMS</span>
                      {channel === 'sms' && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-600 rounded-full flex items-center justify-center animate-scale-in">
                          <span className="text-white text-xs">✓</span>
                        </span>
                      )}
                    </button>
                  </>
                )}
              </div>
              {!isPhoneOtpEnabled && isEmailOtpEnabled && (
                <p className="mt-2 text-xs text-slate-500">
                  Phone OTP is disabled in this environment. Use Email OTP or Google login.
                </p>
              )}
              {!isEmailOtpEnabled && isPhoneOtpEnabled && (
                <p className="mt-2 text-xs text-slate-500">
                  Email OTP is disabled in this environment. Use SMS, WhatsApp, or Google login.
                </p>
              )}
              {!isEmailOtpEnabled && !isPhoneOtpEnabled && (
                <p className="mt-2 text-xs text-slate-500">
                  OTP login is disabled in this environment. Use Google login.
                </p>
              )}
            </div>
          </>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={authMode === 'password'
            ? !isPasswordLoginValid || passwordLoginMutation.isPending
            : !isContactValid || sendOTPMutation.isPending}
          className="btn btn-primary w-full text-base shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300 animate-slide-up disabled:shadow-none"
          style={{ animationDelay: '300ms' }}
        >
          {authMode === 'password' ? (passwordLoginMutation.isPending ? (
            <>
              <div className="spinner w-5 h-5" />
              <span>Signing you in...</span>
            </>
          ) : (
            <>
              <span>Sign In with Password</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )) : sendOTPMutation.isPending ? (
            <>
              <div className="spinner w-5 h-5" />
              <span>Sending OTP...</span>
            </>
          ) : (
            <>
              <span>{channel === 'email' ? 'Send Email OTP' : 'Get OTP'}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-8 animate-fade-in" style={{ animationDelay: '400ms' }}>
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white dark:bg-slate-800 text-slate-500">
            Or continue with
          </span>
        </div>
      </div>

      {/* Google Login */}
      <button
        onClick={handleGoogleLogin}
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
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continue with Google</span>
          </>
        )}
      </button>

      {surface.showTrustBadges ? (
        <div className="mt-8 flex items-center justify-center gap-6 text-slate-400 animate-fade-in" style={{ animationDelay: '600ms' }}>
          <div className="flex items-center gap-1 text-xs">
            <Shield className="w-4 h-4" />
            <span>Secure</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Truck className="w-4 h-4" />
            <span>1000+ Trucks</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span>🇮🇳</span>
            <span>Made in India</span>
          </div>
        </div>
      ) : surface.supportText ? (
        <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-2xl animate-fade-in" style={{ animationDelay: '600ms' }}>
          <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
            {surface.supportText}
          </p>
        </div>
      ) : null}

      {surface.signupHref && (
        <div className="mt-6 text-center animate-fade-in" style={{ animationDelay: '650ms' }}>
          <p className="text-slate-500 dark:text-slate-400">
            {surface.signupIntro}{' '}
            <Link to={surface.signupHref} className="text-primary-600 hover:text-primary-700 font-semibold hover:underline">
              {surface.signupAction}
            </Link>
          </p>
        </div>
      )}

      {/* Terms */}
      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 animate-fade-in" style={{ animationDelay: '700ms' }}>
        By continuing, you agree to our{' '}
        <Link to="/terms" className="text-primary-600 hover:underline font-medium">Terms</Link>
        {' '}and{' '}
        <Link to="/privacy" className="text-primary-600 hover:underline font-medium">Privacy Policy</Link>
      </p>
    </div>
  )
}
