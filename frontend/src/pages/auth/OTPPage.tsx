import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Shield, CheckCircle2, XCircle } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authApi } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const OTP_LENGTH = 6

export default function OTPPage() {
  const navigate = useNavigate()
  const { pendingPhone, login } = useAuthStore()
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [timer, setTimer] = useState(30)
  const [isError, setIsError] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  
  // Redirect if no pending phone
  useEffect(() => {
    if (!pendingPhone) {
      navigate('/login')
    }
  }, [pendingPhone, navigate])
  
  // Timer countdown
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000)
      return () => clearInterval(interval)
    }
  }, [timer])
  
  const verifyOTPMutation = useMutation({
    mutationFn: () => authApi.verifyOTP(pendingPhone!, otp.join('')),
    onSuccess: (data) => {
      if (data.success) {
        setIsSuccess(true)
        login(data.data.user, data.data.token)
        toast.success('Login successful! 🎉', { duration: 2000 })
        setTimeout(() => navigate('/'), 1000)
      } else {
        setIsError(true)
        toast.error(data.message || 'Invalid OTP')
        setTimeout(() => {
          setIsError(false)
          setOtp(Array(OTP_LENGTH).fill(''))
          inputRefs.current[0]?.focus()
        }, 600)
      }
    },
    onError: (error: any) => {
      setIsError(true)
      toast.error(error.response?.data?.message || 'Verification failed')
      setTimeout(() => {
        setIsError(false)
        setOtp(Array(OTP_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
      }, 600)
    }
  })
  
  const resendOTPMutation = useMutation({
    mutationFn: () => authApi.resendOTP(pendingPhone!),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('OTP resent! Check your phone 📱', { duration: 3000 })
        setTimer(30)
        setOtp(Array(OTP_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
      } else {
        toast.error(data.message || 'Failed to resend OTP')
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to resend OTP')
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
  
  const maskedPhone = pendingPhone 
    ? `+91 ${pendingPhone.slice(0, 5)} ****${pendingPhone.slice(-2)}`
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
          Verify Your Number
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          We sent a 6-digit code to
        </p>
        <p className="font-semibold text-slate-900 dark:text-white mt-1 text-lg">
          {maskedPhone}
        </p>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mb-6 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-300 ${
            isError ? 'bg-red-500' : isSuccess ? 'bg-green-500' : 'bg-primary-500'
          }`}
          style={{ width: `${isSuccess ? 100 : progress}%` }}
        />
      </div>
      
      {/* OTP Input */}
      <div 
        className={`flex justify-center gap-2 sm:gap-3 mb-8 transition-all duration-300 ${
          isError ? 'animate-shake' : ''
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
            className={`otp-input ${digit ? 'filled' : ''} ${
              isError ? 'border-red-500 bg-red-50 dark:bg-red-900/30' : ''
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
        </ul>
      </div>
    </div>
  )
}
