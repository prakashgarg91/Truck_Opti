import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Shield, CheckCircle2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authSupabaseApi } from '../../services/supabaseApi'
import { useAuthStore } from '../../stores/authStore'
import { toUserFacingErrorMessage } from '../../utils/userFacingError'
import { storeAuthReturnTo } from '../../utils/authReturnTo'

export default function OTPPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pendingPhone } = useAuthStore()
  const channel = (location.state as { channel?: string })?.channel || 'sms'
  // TruckOpti auth OTPs are configured to six digits for both email and phone flows.
  const OTP_LENGTH = 6
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [timer, setTimer] = useState(30)
  const [isError, setIsError] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const contact = (location.state as { contact?: string })?.contact || pendingPhone
  const isSignup = (location.state as { isSignup?: boolean } | null)?.isSignup === true
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo || null

  // Redirect if no pending phone/email
  useEffect(() => {
    if (!contact) {
      navigate('/login')
    }
  }, [contact, navigate])

  useEffect(() => {
    document.title = 'Verify OTP - TruckOpti'
  }, [])

  // Timer countdown
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000)
      return () => clearInterval(interval)
    }
  }, [timer])

  const verifyOTPMutation = useMutation({
    mutationFn: async () => {
      if (channel === 'email') {
        const { session, user } = await authSupabaseApi.verifyEmailOtp(contact!, otp.join(''))
        return { session, user }
      } else {
        const formattedPhone = contact!.startsWith('+') ? contact! : `+91${contact!}`
        const { session, user } = await authSupabaseApi.verifyPhoneOtp(formattedPhone, otp.join(''))
        return { session, user }
      }
    },
    onSuccess: () => {
      setIsSuccess(true)
      if (returnTo) {
        storeAuthReturnTo(returnTo)
      }
      setTimeout(() => navigate('/auth/callback', { replace: true }), 350)
    },
    onError: (error: unknown) => {
      setIsError(true)
      toast.error(toUserFacingErrorMessage(error, 'Invalid OTP — please try again'))
      setTimeout(() => {
        setIsError(false)
        setOtp(Array(OTP_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
      }, 600)
    }
  })

  const resendOTPMutation = useMutation({
    mutationFn: async () => {
      if (channel === 'email') {
        if (isSignup) {
          await authSupabaseApi.signUpWithEmail(contact!)
        } else {
          await authSupabaseApi.signInWithEmail(contact!)
        }
      } else {
        const formattedPhone = contact!.startsWith('+') ? contact! : `+91${contact!}`
        await authSupabaseApi.signInWithPhone(formattedPhone, channel as 'sms' | 'whatsapp')
      }
      return { success: true }
    },
    onSuccess: () => {
      const channelLabel = channel === 'email' ? 'email' : 'phone'
      toast.success(`OTP resent! Check your ${channelLabel} ${channel === 'email' ? '📧' : '📱'}`, { duration: 3000 })
      setTimer(30)
      setOtp(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    },
    onError: (error: unknown) => {
      toast.error(toUserFacingErrorMessage(error, 'Failed to resend OTP — please try again'))
    }
  })

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)

    // Auto-advance to next input
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when complete
    if (newOtp.every(d => d) && newOtp.join('').length === OTP_LENGTH) {
      verifyOTPMutation.mutate()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (pastedData.length === OTP_LENGTH) {
      setOtp(pastedData.split(''))
      inputRefs.current[OTP_LENGTH - 1]?.focus()
      // Auto-submit
      setTimeout(() => verifyOTPMutation.mutate(), 100)
    }
  }

  // Mask contact info for display
  const maskedContact = channel === 'email'
    ? contact?.replace(/(.{2}).*@/, '$1***@') || ''
    : contact
      ? `+91 ${contact.slice(0, 5)} ****${contact.slice(-2)}`
      : ''

  const filledCount = otp.filter(d => d).length
  const progress = (filledCount / OTP_LENGTH) * 100

  return (
    <div className="p-6 animate-fade-in">
      {/* Back Button */}
      <button
        onClick={() => navigate('/login')}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition-colors active:scale-95"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </button>

      {/* Header */}
      <div className="text-center mb-8 animate-slide-up">
        <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {channel === 'email' ? 'Verify Your Email' : 'Verify Your Number'}
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          We sent a {OTP_LENGTH}-digit code to
        </p>
        <p className="font-semibold text-slate-900 dark:text-white mt-1 text-lg">
          {maskedContact}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mb-6 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isError ? 'bg-red-500' : isSuccess ? 'bg-green-500' : 'bg-primary-500'
            }`}
          style={{ width: `${isSuccess ? 100 : progress}%` }}
        />
      </div>

      {/* OTP Input */}
      <div
        className={`flex justify-center ${OTP_LENGTH >= 8 ? 'gap-1 sm:gap-1.5' : 'gap-2 sm:gap-3'} mb-8 transition-all duration-300 ${isError ? 'animate-shake' : ''
          } ${isSuccess ? 'scale-95 opacity-50' : ''}`}
        onPaste={handlePaste}
      >
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => inputRefs.current[index] = el}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            disabled={isSuccess || verifyOTPMutation.isPending}
            className={`${OTP_LENGTH >= 8 ? 'otp-input-sm' : 'otp-input'} ${digit ? 'filled' : ''} ${isError ? 'border-red-500 bg-red-50 dark:bg-red-900/30' : ''
              } ${isSuccess ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : ''}`}
            autoFocus={index === 0}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      {/* Status Indicator */}
      {(isSuccess || verifyOTPMutation.isPending) && (
        <div className="flex items-center justify-center gap-2 mb-6 animate-scale-in">
          {isSuccess ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-green-600 font-medium">Verified! Redirecting...</span>
            </>
          ) : (
            <>
              <div className="spinner w-5 h-5" />
              <span className="text-slate-500">Verifying...</span>
            </>
          )}
        </div>
      )}

      {/* Verify Button */}
      {!isSuccess && (
        <button
          onClick={() => verifyOTPMutation.mutate()}
          disabled={otp.some(d => !d) || verifyOTPMutation.isPending}
          className="btn btn-primary w-full mb-6 shadow-lg shadow-primary-500/30 disabled:shadow-none"
        >
          {verifyOTPMutation.isPending ? (
            <>
              <div className="spinner w-5 h-5" />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <Shield className="w-5 h-5" />
              <span>Verify OTP</span>
            </>
          )}
        </button>
      )}

      {/* Resend OTP */}
      <div className="text-center animate-fade-in" style={{ animationDelay: '300ms' }}>
        {timer > 0 ? (
          <p className="text-slate-500 dark:text-slate-400">
            Resend OTP in{' '}
            <span className="inline-flex items-center justify-center w-10 h-10 bg-primary-50 dark:bg-primary-900/30 text-primary-600 font-bold rounded-full">
              {timer}
            </span>
          </p>
        ) : (
          <button
            onClick={() => resendOTPMutation.mutate()}
            disabled={resendOTPMutation.isPending}
            className="flex items-center justify-center gap-2 text-primary-600 hover:text-primary-700 font-medium mx-auto px-4 py-2 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-all active:scale-95"
          >
            {resendOTPMutation.isPending ? (
              <div className="spinner w-4 h-4" />
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Resend OTP
              </>
            )}
          </button>
        )}
      </div>

      {/* Help Text */}
      <div className="mt-8 p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-700 animate-slide-up" style={{ animationDelay: '400ms' }}>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <span>💡</span> Didn't receive the code?
        </p>
        <ul className="mt-3 text-sm text-slate-500 dark:text-slate-400 space-y-2">
          {channel === 'email' ? (
            <>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Check your email inbox & spam/junk folder
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Verify your email address is correct
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                The code expires in 10 minutes
              </li>
            </>
          ) : (
            <>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                Check your SMS inbox & spam folder
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                Verify your mobile number is correct
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-green-600 dark:text-green-400 font-medium">Try WhatsApp for instant delivery</span>
              </li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}
