import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface EmptyStateProps {
  /** Icon component from lucide-react */
  icon: LucideIcon
  /** Main title text */
  title: string
  /** Optional description text */
  description?: string
  /** Optional action button label */
  actionLabel?: string
  /** Optional action button callback */
  onAction?: () => void
  /** Additional CSS classes */
  className?: string
  /** Variant for different contexts */
  variant?: 'default' | 'compact'
}

/**
 * EmptyState - A reusable component for displaying empty states in list pages
 * 
 * Features:
 * - Centered layout with icon, title, and optional description
 * - Optional action button with callback
 * - Supports default (page-level) and compact (card-level) variants
 * - Dark mode support
 * - Accessible with proper ARIA attributes
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  variant = 'default',
}: EmptyStateProps) {
  const isCompact = variant === 'compact'

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        isCompact ? 'py-8 px-4' : 'py-12 px-4 sm:py-16',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Icon Container */}
      <div
        className={clsx(
          'flex items-center justify-center rounded-2xl',
          'bg-slate-100 dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
          isCompact ? 'w-14 h-14 mb-3' : 'w-20 h-20 mb-6'
        )}
      >
        <Icon
          className={clsx(
            'text-slate-400 dark:text-slate-500',
            isCompact ? 'w-7 h-7' : 'w-10 h-10'
          )}
        />
      </div>

      {/* Title */}
      <h3
        className={clsx(
          'font-semibold text-slate-900 dark:text-slate-100',
          isCompact ? 'text-base' : 'text-lg'
        )}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p
          className={clsx(
            'text-slate-500 dark:text-slate-400 max-w-sm',
            isCompact ? 'text-sm mt-1' : 'text-sm mt-2'
          )}
        >
          {description}
        </p>
      )}

      {/* Action Button */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={clsx(
            'inline-flex items-center justify-center gap-2',
            'font-medium text-sm',
            'bg-primary-600 hover:bg-primary-700',
            'text-white',
            'rounded-xl',
            'transition-all duration-200',
            'active:scale-[0.98]',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
            'dark:focus:ring-offset-slate-900',
            isCompact ? 'mt-4 px-4 py-2' : 'mt-6 px-6 py-3'
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
