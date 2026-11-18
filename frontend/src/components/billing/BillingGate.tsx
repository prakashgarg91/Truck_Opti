import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { useEntitlement } from './useEntitlement'
import LimitPrompt from './LimitPrompt'
import type { BillingView, Entitlement, SubscriptionErrorInfo } from '../../lib/billingState'

export interface BillingGate {
  /** false only when the server entitlement says new records are locked. */
  canWrite: boolean
  /** false only when the server entitlement says settlement actions are locked (open in grace). */
  canSettle: boolean
  /** false only when the server entitlement says the plan does not include the ERP connector. */
  erpIncluded: boolean
  /** false only when the server entitlement says dispatch is locked. */
  canDispatch: boolean
  /** Explanatory title for a disabled create button (undefined when enabled). */
  writeTitle: string | undefined
  dispatchTitle: string | undefined
  settleTitle: string | undefined
  /** Create/rotate on the ERP page: write lock first (as the server does), then the plan feature. */
  erpTitle: string | undefined
  loading: boolean
  entitlement: Entitlement | undefined
  view: BillingView | null
}

export const WRITE_LOCKED_TITLE = 'Your subscription is read-only, so new orders, trucks, drivers and team members cannot be added. Renew to continue.'
export const SETTLE_LOCKED_TITLE = 'Your subscription has expired, so this action is locked. Renew to continue.'
export const ERP_NOT_IN_PLAN_TITLE = 'The ERP connector is included from the Growth plan. Upgrade your plan to use it.'
export const DISPATCH_LOCKED_TITLE = 'Your subscription has expired, so dispatch is locked. Renew to continue.'

const OPEN_GATE: BillingGate = {
  canWrite: true,
  canSettle: true,
  erpIncluded: true,
  canDispatch: true,
  writeTitle: undefined,
  dispatchTitle: undefined,
  settleTitle: undefined,
  erpTitle: undefined,
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
  // The server only refuses when enforcement is switched on; while it is off the gate stays open.
  const known =
    entitlement !== undefined && entitlement.ok && entitlement.status !== 'none' && entitlement.enforcementEnabled !== false
  const canWrite = !known || entitlement.canWrite
  const canSettle = !known || entitlement.canSettle
  const erpIncluded = !known || entitlement.features.erp !== false
  const canDispatch = !known || entitlement.canDispatch
  return {
    canWrite,
    canSettle,
    erpIncluded,
    canDispatch,
    writeTitle: canWrite ? undefined : WRITE_LOCKED_TITLE,
    dispatchTitle: canDispatch ? undefined : DISPATCH_LOCKED_TITLE,
    settleTitle: canSettle ? undefined : SETTLE_LOCKED_TITLE,
    erpTitle: !canWrite ? WRITE_LOCKED_TITLE : erpIncluded ? undefined : ERP_NOT_IN_PLAN_TITLE,
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
