import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Phone, ArrowRight, MessageCircle, Shield, Truck, Sparkles, Send, LogIn } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authSupabaseApi } from '../../services/supabaseApi'
import { useAuthStore } from '../../stores/authStore'
import { phoneInputSchema, emailSchema } from '../../utils/validators'

const features = [
  { icon: '📦', text: '3D Smart Packing' },
  { icon: '🚛', text: 'Route Optimization' },
  { icon: '📍', text: 'Live GPS Tracking' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { setPendingPhone } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | 'email'>('email')
  const [isFocused, setIsFocused] = useState(false)
  const [currentFeature, setCurrentFeature] = useState(0)
  
  // Rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature(prev => (prev + 1) % features.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    document.title = 'Login - TruckOpti'
  }, [])
  
  // Clear input when channel changes
  useEffect(() => {
    setPhone('')
    setPhoneError('')
  }, [channel])
  
  const sendOTPMutation = useMutation({
    mutationFn: async () => {
      if (channel === 'email') {
        await authSupabaseApi.signInWithEmail(phone) // phone variable holds email in this case
        return { success: true, channel: 'email' }
      } else {
        // Format phone with country code for Supabase
        const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`
        await authSupabaseApi.signInWithPhone(formattedPhone, channel as 'sms' | 'whatsapp')
        return { success: true, channel }
      }
    },
    onSuccess: (data) => {
      setPendingPhone(phone)
      const channelLabel = data.channel === 'email' ? 'Email' : data.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'
      toast.success(`OTP sent via ${channelLabel}`, {
        icon: data.channel === 'email' ? '📧' : '📱',
        duration: 3000
      })
      navigate('/otp', { state: { channel, contact: phone } })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send OTP')
    }
  })
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate based on channel
    if (channel === 'email') {
      const result = emailSchema.safeParse(phone)
      if (!result.success) {
        setPhoneError(result.error.issues[0]?.message || 'Invalid email address')
        return
      }
    } else {
      // Validate phone number with Zod
      const result = phoneInputSchema.safeParse(phone)
      if (!result.success) {
        setPhoneError(result.error.issues[0]?.message || 'Invalid phone number')
        return
      }
    }
    
    setPhoneError('')
    sendOTPMutation.mutate()
  }

  const handlePhoneChange = (value: string) => {
    if (channel === 'email') {
      setPhone(value)
      // Clear error when user starts typing
      if (phoneError && value.length > 0) {
        setPhoneError('')
      }
      return
    }
    
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setPhone(digits)
    
    // Clear error when user starts typing
    if (phoneError && digits.length > 0) {
      setPhoneError('')
    }
    
    // Validate on complete
    if (digits.length === 10) {
      const result = phoneInputSchema.safeParse(digits)
      if (!result.success) {
        setPhoneError(result.error.issues[0]?.message || 'Invalid phone number')
      } else {
        setPhoneError('')
      }
    }
  }
  
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const isContactValid = channel === 'email'
    ? emailSchema.safeParse(phone).success
    : phoneInputSchema.safeParse(phone).success
  
  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true)
      await authSupabaseApi.signInWithGoogle()
      // Note: The page will redirect to Google, so we won't reach here
    } catch (error: any) {
      toast.error('Failed to initiate Google login')
      setIsGoogleLoading(false)
    }
  }
  
  // Format phone number for display (only for phone inputs)
  const formatPhone = (value: string) => {
    if (channel === 'email') return value
    if (value.length <= 5) return value
    return `${value.slice(0, 5)} ${value.slice(5)}`
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
        <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
          <LogIn className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Welcome Back
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Log in to your <span className="text-gradient font-semibold">TruckOpti</span> account
        </p>
      </div>
      
      {/* Phone Input Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Phone/Email Input */}
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {channel === 'email' ? 'Email Address' : 'Mobile Number'}
          </label>
          <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`}>
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
              value={channel === 'email' ? phone : formatPhone(phone)}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={channel === 'email' ? 'your@email.com' : '98765 43210'}
              className={`input ${channel !== 'email' ? 'pl-[105px]' : ''} text-lg tracking-wide font-medium ${phoneError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              autoFocus
              aria-label={channel === 'email' ? 'Enter your email address' : 'Enter your 10-digit mobile number'}
              aria-invalid={!!phoneError}
            />
            {phone.length === 10 && !phoneError && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 animate-scale-in">
                <Shield className="w-5 h-5" />
              </div>
            )}
          </div>
          {phoneError ? (
            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
              <span>⚠️</span>
              {phoneError}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Your number is secure and never shared
            </p>
          )}
        </div>
        
        {/* OTP Channel Selection */}
        <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Receive OTP via
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`relative flex items-center justify-center gap-2 py-4 px-2 rounded-xl border-2 transition-all duration-300 ripple ${
                channel === 'email'
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
            <button
              type="button"
              onClick={() => setChannel('whatsapp')}
              className={`relative flex items-center justify-center gap-2 py-4 px-2 rounded-xl border-2 transition-all duration-300 ripple ${
                channel === 'whatsapp'
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
              className={`relative flex items-center justify-center gap-2 py-4 px-2 rounded-xl border-2 transition-all duration-300 ripple ${
                channel === 'sms'
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
          </div>
        </div>
        
        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isContactValid || sendOTPMutation.isPending}
          className="btn btn-primary w-full text-base shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300 animate-slide-up disabled:shadow-none"
          style={{ animationDelay: '300ms' }}
        >
          {sendOTPMutation.isPending ? (
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
      
      {/* Trust Badges */}
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

      {/* Signup Link */}
      <div className="mt-6 text-center animate-fade-in" style={{ animationDelay: '650ms' }}>
        <p className="text-slate-500 dark:text-slate-400">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary-600 hover:text-primary-700 font-semibold hover:underline">
            Create Account
          </Link>
        </p>
      </div>
      
      {/* Terms */}
      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 animate-fade-in" style={{ animationDelay: '700ms' }}>
        By continuing, you agree to our{' '}
        <a href="#" className="text-primary-600 hover:underline font-medium">Terms</a>
        {' '}and{' '}
        <a href="#" className="text-primary-600 hover:underline font-medium">Privacy Policy</a>
      </p>
    </div>
  )
}
