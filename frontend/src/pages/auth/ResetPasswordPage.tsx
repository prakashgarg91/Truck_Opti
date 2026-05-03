import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { authSupabaseApi } from '../../services/supabaseApi'
import { passwordSchema } from '../../utils/validators'
import { toUserFacingErrorMessage } from '../../utils/userFacingError'

export default function ResetPasswordPage() {
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordError, setPasswordError] = useState('')
    const [isPasswordVisible, setIsPasswordVisible] = useState(false)
    const [isConfirmVisible, setIsConfirmVisible] = useState(false)
    const [isPreparing, setIsPreparing] = useState(true)
    const [isReady, setIsReady] = useState(false)
    const [pageError, setPageError] = useState<string | null>(null)
    const [completionError, setCompletionError] = useState<string | null>(null)

    useEffect(() => {
        document.title = 'Set New Password - TruckOpti'

        const prepareResetSession = async () => {
            try {
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
                const accessToken = hashParams.get('access_token')
                const refreshToken = hashParams.get('refresh_token')

                if (accessToken && refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    })

                    if (error) throw error

                    window.history.replaceState({}, document.title, '/reset-password')
                }

                const { data, error } = await supabase.auth.getSession()
                if (error) throw error

                if (!data.session) {
                    setPageError('This password reset link is invalid or has expired. Please request a fresh reset email.')
                    return
                }

                setIsReady(true)
            } catch {
                setPageError('This password reset link is invalid or has expired. Please request a fresh reset email.')
            } finally {
                setIsPreparing(false)
            }
        }

        prepareResetSession()
    }, [])

    const updatePasswordMutation = useMutation({
        mutationFn: async () => {
            await authSupabaseApi.updatePassword(password)
        },
        onSuccess: async () => {
            try {
                await authSupabaseApi.signOut()
            } catch {
                const message = 'Password updated, but we could not finish signing you out. Close this tab and sign in again with your new password.'
                setCompletionError(message)
                toast.error(message)
                return
            }

            setCompletionError(null)
            toast.success('Password updated. Sign in with your new password.')
            navigate('/login', { replace: true })
        },
        onError: (error: unknown) => {
            toast.error(toUserFacingErrorMessage(error, 'Failed to update password. Please try again.'))
        },
    })

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault()

        const result = passwordSchema.safeParse(password)
        if (!result.success) {
            setPasswordError(result.error.issues[0]?.message || 'Invalid password')
            return
        }

        if (password !== confirmPassword) {
            setPasswordError('Passwords do not match')
            return
        }

        setPasswordError('')
        setCompletionError(null)
        updatePasswordMutation.mutate()
    }

    if (isPreparing) {
        return (
            <div className="p-6 animate-fade-in">
                <div className="text-center py-10">
                    <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <div className="spinner w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Preparing Secure Reset</h2>
                    <p className="text-slate-500 dark:text-slate-400">Please wait while we verify your reset link.</p>
                </div>
            </div>
        )
    }

    if (pageError || !isReady) {
        return (
            <div className="p-6 animate-fade-in">
                <div className="text-center py-6">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Reset Link Unavailable</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">{pageError}</p>
                    <div className="flex flex-col gap-3">
                        <button onClick={() => navigate('/forgot-password')} className="btn btn-primary w-full">
                            Request New Reset Link
                        </button>
                        <Link to="/login" className="btn btn-secondary w-full">
                            Back to Login
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

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
                <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
                    <KeyRound className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    Set a New Password
                </h2>
                <p className="text-slate-500 dark:text-slate-400">
                    Choose a strong password for your TruckOpti account.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {completionError && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200">
                        {completionError}
                    </div>
                )}

                <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        New Password
                    </label>
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                            <Lock className="w-5 h-5" />
                        </div>
                        <input
                            type={isPasswordVisible ? 'text' : 'password'}
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value)
                                if (passwordError) setPasswordError('')
                            }}
                            placeholder="Use at least 8 characters"
                            className={`input pl-12 pr-12 text-lg font-medium ${passwordError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={() => setIsPasswordVisible((current) => !current)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Confirm Password
                    </label>
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                            <Lock className="w-5 h-5" />
                        </div>
                        <input
                            type={isConfirmVisible ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(event) => {
                                setConfirmPassword(event.target.value)
                                if (passwordError) setPasswordError('')
                            }}
                            placeholder="Re-enter your password"
                            className={`input pl-12 pr-12 text-lg font-medium ${passwordError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                        />
                        <button
                            type="button"
                            onClick={() => setIsConfirmVisible((current) => !current)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {isConfirmVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>
                    {passwordError ? (
                        <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                            <span>⚠️</span>
                            {passwordError}
                        </p>
                    ) : (
                        <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Use letters and numbers for better security.
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={updatePasswordMutation.isPending}
                    className="btn btn-primary w-full text-base shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300 animate-slide-up disabled:shadow-none"
                    style={{ animationDelay: '200ms' }}
                >
                    {updatePasswordMutation.isPending ? (
                        <>
                            <div className="spinner w-5 h-5" />
                            <span>Saving password...</span>
                        </>
                    ) : (
                        <>
                            <KeyRound className="w-5 h-5" />
                            <span>Update Password</span>
                        </>
                    )}
                </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400 animate-fade-in" style={{ animationDelay: '250ms' }}>
                Need a new reset link?{' '}
                <Link to="/forgot-password" className="text-primary-600 hover:text-primary-700 font-semibold hover:underline">
                    Request it again
                </Link>
            </p>
        </div>
    )
}