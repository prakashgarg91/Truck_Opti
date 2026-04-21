/**
 * useSubscription — full subscription lifecycle hook
 * Covers: trial detection, expiry, usage counters, plan metadata
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import {
  subscriptionsApi,
  usageApi,
  subscriptionHelpers,
  type Subscription,
  type SubscriptionPlan,
  type UsageTracking,
} from '../services/subscriptionApi'
import { useAuthStore } from '../stores/authStore'

// ────────────────────────────────────────────────────────────
// Derived state helpers
// ────────────────────────────────────────────────────────────

export interface SubscriptionStatus {
  /** Raw DB row (null if no active/trial subscription) */
  subscription: Subscription | null
  /** Plan details joined from subscription_plans */
  plan: SubscriptionPlan | null
  /** Current-period usage */
  usage: UsageTracking | null

  // Computed booleans
  isActive: boolean        // status === 'active'
  isTrial: boolean         // status === 'trial'
  isExpired: boolean       // period_end < now
  isCancelled: boolean     // status === 'cancelled' | 'expired'
  isLoading: boolean

  // Trial helpers
  trialDaysRemaining: number | null   // null if not in trial
  trialHasExpired: boolean

  // Period helpers
  daysRemaining: number       // days left in current billing period
  periodEndDate: Date | null

  // Plan limits (convenience shorthand)
  limits: SubscriptionPlan['trucks_limit'] extends number ? {
    trucks: number
    shipments: number
    users: number
    storage_gb: number
    api_calls: number
    sms: number
    maps: number
    support: string
  } : null

  // Usage % for each resource
  usagePercent: {
    shipments: number
    api_calls: number
    sms: number
    maps: number
    storage: number
  }

  // Actions
  checkLimit: (feature: FeatureKey) => Promise<boolean>
  showUpgradePrompt: (feature: string) => void
  refetch: () => void
}

export type FeatureKey =
  | 'packing_optimizations'
  | 'route_optimizations'
  | 'sale_order_imports'
  | 'shipments'
  | 'api_calls'
  | 'sms'
  | 'maps'

// Map feature names to DB resource types
const FEATURE_RESOURCE_MAP: Record<FeatureKey, 'shipments' | 'api_calls' | 'sms' | 'maps'> = {
  packing_optimizations: 'shipments',
  route_optimizations: 'api_calls',
  sale_order_imports: 'api_calls',
  shipments: 'shipments',
  api_calls: 'api_calls',
  sms: 'sms',
  maps: 'maps',
}

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useSubscription(): SubscriptionStatus {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  // 1. Fetch subscription + plan
  const {
    data: subWithPlan,
    isLoading: subLoading,
  } = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => subscriptionsApi.getCurrentWithPlan(),
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 1,
  })

  // 2. Fetch usage
  const {
    data: usage,
    isLoading: usageLoading,
  } = useQuery({
    queryKey: ['subscription-usage'],
    queryFn: () => usageApi.getCurrent(),
    staleTime: 1000 * 60 * 1, // 1 minute
    retry: 1,
  })

  const subscription = subWithPlan?.subscription ?? null
  const plan = subWithPlan?.plan ?? null
  const isLoading = subLoading || usageLoading

  // ── Expiry detection ──────────────────────────────────────
  const now = new Date()
  const periodEnd = subscription ? new Date(subscription.current_period_end) : null
  const isExpired = periodEnd ? periodEnd < now : false

  const isActive = subscription?.status === 'active' && !isExpired
  const isTrial = subscription?.status === 'trial' && !isExpired
  const isCancelled =
    subscription?.status === 'cancelled' ||
    subscription?.status === 'expired' ||
    isExpired

  // ── Trial helpers ─────────────────────────────────────────
  const trialEnd = subscription?.trial_end ? new Date(subscription.trial_end) : null
  const trialHasExpired = trialEnd ? trialEnd < now : false
  const trialDaysRemaining =
    isTrial && trialEnd && !trialHasExpired
      ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000))
      : null

  // ── Period helpers ────────────────────────────────────────
  const daysRemaining = subscription
    ? subscriptionHelpers.getRemainingDays(subscription)
    : 0

  // ── Plan limits shorthand ─────────────────────────────────
  const limits = plan
    ? {
      trucks: plan.trucks_limit,
      shipments: plan.shipments_monthly,
      users: plan.users_limit,
      storage_gb: plan.storage_gb,
      api_calls: plan.api_calls_monthly,
      sms: plan.sms_included,
      maps: plan.maps_requests_monthly,
      support: plan.support_level,
    }
    : null

  // ── Usage % ───────────────────────────────────────────────
  const pct = (used: number, limit: number) =>
    subscriptionHelpers.getUsagePercentage(used, limit)

  const usagePercent = {
    shipments: plan && usage ? pct(usage.shipments_used, plan.shipments_monthly) : 0,
    api_calls: plan && usage ? pct(usage.api_calls_used, plan.api_calls_monthly) : 0,
    sms: plan && usage ? pct(usage.sms_sent, plan.sms_included) : 0,
    maps: plan && usage ? pct(usage.maps_requests, plan.maps_requests_monthly) : 0,
    storage: plan && usage ? pct(usage.storage_used_mb / 1024, plan.storage_gb) : 0,
  }

  // ── checkLimit ────────────────────────────────────────────
  const checkLimit = async (feature: FeatureKey): Promise<boolean> => {
    // Admin always has full access — no limits apply
    if (isAdmin) return true
    // If no active/trial subscription, deny
    if (!isActive && !isTrial) {
      showUpgradePrompt(feature)
      return false
    }
    try {
      const resource = FEATURE_RESOURCE_MAP[feature]
      const allowed = await usageApi.canUse(resource)
      if (!allowed) showUpgradePrompt(feature)
      return allowed
    } catch {
      // Fail closed — unexpected errors should not bypass subscription limits
      logger.warn('[useSubscription] checkLimit failed — denying access to', feature)
      return false
    }
  }

  // ── showUpgradePrompt ─────────────────────────────────────
  const showUpgradePrompt = (feature: string) => {
    toast.error(
      `You've reached your plan limit for ${feature}. Upgrade your plan to continue.`,
      { duration: 5000, icon: '🚀' }
    )
  }

  // ── refetch ───────────────────────────────────────────────
  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['subscription-current'] })
    queryClient.invalidateQueries({ queryKey: ['subscription-usage'] })
  }

  return {
    subscription,
    plan,
    usage: usage ?? null,
    isActive,
    isTrial,
    isExpired,
    isCancelled,
    isLoading,
    trialDaysRemaining,
    trialHasExpired,
    daysRemaining,
    periodEndDate: periodEnd,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers access dynamic plan-key properties
    limits: limits as any,
    usagePercent,
    checkLimit,
    showUpgradePrompt,
    refetch,
  }
}

// ────────────────────────────────────────────────────────────
// Thin re-export for callers that only need checkLimit
// (backward-compatible with old hook signature)
// ────────────────────────────────────────────────────────────
export function useSubscriptionCheck() {
  const { checkLimit, showUpgradePrompt } = useSubscription()
  return { checkLimit, showUpgradePrompt }
}
