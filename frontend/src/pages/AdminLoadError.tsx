import { RefreshCw } from 'lucide-react'

interface AdminLoadErrorProps {
  /** What failed to load, for example "users". Used in the default message. */
  what: string
  onRetry: () => void
  message?: string
}

/** Shared error state for admin lists: a failed load must never look like an empty queue. */
export default function AdminLoadError({ what, onRetry, message }: AdminLoadErrorProps) {
  return (
    <div role="alert" data-testid="admin-load-error" className="text-center py-12 px-4 space-y-3 bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-900">
      <p className="text-slate-800 dark:text-slate-100 font-medium">{message ?? `Could not load ${what}.`}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{'This is not an empty list. The data could not be loaded.'}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        <RefreshCw size={16} aria-hidden="true" />
        {'Retry'}
      </button>
    </div>
  )
}
