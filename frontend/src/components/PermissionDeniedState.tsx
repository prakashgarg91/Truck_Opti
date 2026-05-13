import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, ShieldAlert } from 'lucide-react'

interface PermissionDeniedStateProps {
  attemptedPath: string
  allowedRoles?: string[]
  homePath: string
}

export default function PermissionDeniedState({
  attemptedPath,
  allowedRoles,
  homePath,
}: PermissionDeniedStateProps) {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Permission Denied - TruckOpti'
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-xl w-full rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-xl p-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Permission denied
        </h1>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          You are signed in, but your current role does not have access to this area.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Requested path
          </p>
          <p className="mt-1 break-all text-sm font-medium text-slate-900 dark:text-white">
            {attemptedPath}
          </p>
          {allowedRoles && allowedRoles.length > 0 && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Allowed roles: <span className="font-medium text-slate-900 dark:text-white">{allowedRoles.join(', ')}</span>
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => navigate(homePath)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-primary-700"
          >
            <Home className="h-5 w-5" />
            Go to my home
          </button>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-6 py-3 font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
            Go back
          </button>
        </div>
      </div>
    </div>
  )
}