import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { useEntitlement } from './useEntitlement'
import LimitPrompt from './LimitPrompt'
import type { BillingView, Entitlement, SubscriptionErrorInfo } from '../../lib/billingState'

export interface BillingGate {
  /** false only when the server entitlement says new records are locked. */
  canWrite: boolean
  /** false only when the server entitlement says dispatch is locked. */
  canDispatch: boolean
  /** Explanatory title for a disabled create button (undefined when enabled). */
  writeTitle: string | undefined
  dispatchTitle: string | undefined
  loading: boolean
  entitlement: Entitlement | undefined
  view: BillingView | null
}

export const WRITE_LOCKED_TITLE = 'Your subscription is read-only, so new records cannot be created. Renew to continue.'
export const DISPATCH_LOCKED_TITLE = 'Your subscription has expired, so dispatch is locked. Renew to continue.'

const OPEN_GATE: BillingGate = {
  canWrite: true,
  canDispatch: true,
  writeTitle: undefined,
  dispatchTitle: undefined,
  loading: false,
  entitlement: undefined,
  view: null,
}

export const BillingGateContext = createContext<BillingGate>(OPEN_GATE)

/**
 * Pure derivation. Fails open: while loading, on an RPC error, or for status
 * 'none' nothing is blocked, because the server (SB001/SB002/SB003) is the
 * authority and enforcement is off by default.
 */
export function deriveBillingGate(
  entitlement: Entitlement | undefined,
  view: BillingView | null,
  loading: boolean,
): BillingGate {
  const known = entitlement !== undefined && entitlement.ok && entitlement.status !== 'none'
  const canWrite = !known || entitlement.canWrite
  const canDispatch = !known || entitlement.canDispatch
  return {
    canWrite,
    canDispatch,
    writeTitle: canWrite ? undefined : WRITE_LOCKED_TITLE,
    dispatchTitle: canDispatch ? undefined : DISPATCH_LOCKED_TITLE,
    loading,
    entitlement,
    view,
  }
}

/** Mount once in the agency layout; it is the only place that reads the entitlement for gating. */
export function BillingGateProvider({ children }: { children: ReactNode }) {
  const { entitlement, view, isLoading } = useEntitlement()
  const value = useMemo(() => deriveBillingGate(entitlement, view, isLoading), [entitlement, view, isLoading])
  return <BillingGateContext.Provider value={value}>{children}</BillingGateContext.Provider>
}

/** Outside the provider (tests, other layouts) everything is allowed. */
export function useBillingGate(): BillingGate {
  return useContext(BillingGateContext)
}

function RoutedPrompt({ info, onDismiss }: { info: SubscriptionErrorInfo; onDismiss?: () => void }) {
  const navigate = useNavigate()
  return <LimitPrompt info={info} onAction={() => navigate('/subscription')} onDismiss={onDismiss} />
}

/** LimitPrompt that sends the user to /subscription; works with or without a router. */
export function SubscriptionLimitPrompt({ info, onDismiss }: { info: SubscriptionErrorInfo; onDismiss?: () => void }) {
  const inRouter = useInRouterContext()
  if (inRouter) return <RoutedPrompt info={info} onDismiss={onDismiss} />
  return <LimitPrompt info={info} onAction={() => window.location.assign('/subscription')} onDismiss={onDismiss} />
}
