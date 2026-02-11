import clsx from 'clsx'

interface PageSkeletonProps {
  /** Number of list items to show (default: 4) */
  count?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * PageSkeleton - A skeleton loader component for card-based layouts
 * 
 * Displays animated pulse placeholders matching the app's card layout:
 * - Header section with title and action button
 * - Stats cards row
 * - List items with icon, title, subtitle, and action
 * 
 * Supports dark mode via Tailwind dark: classes.
 */
export default function PageSkeleton({ count = 4, className }: PageSkeletonProps) {
  return (
    <div className={clsx('animate-pulse', className)}>
      {/* Header Skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="h-10 w-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`stat-${index}`}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Card Skeleton */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Card Header */}
        <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-8 w-28 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        </div>

        {/* List Items */}
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {Array.from({ length: count }).map((_, index) => (
            <div
              key={`item-${index}`}
              className="flex items-center gap-4 p-4"
            >
              {/* Icon placeholder */}
              <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl flex-shrink-0" />
              
              {/* Content placeholder */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>

              {/* Action placeholder */}
              <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg flex-shrink-0" />
            </div>
          ))}
        </div>

        {/* Card Footer */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="flex gap-2">
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
