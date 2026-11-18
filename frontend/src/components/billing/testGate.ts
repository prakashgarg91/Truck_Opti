// Test helpers only: render a page inside a BillingGate with a chosen entitlement.
import { createElement, type ReactElement } from 'react'
import { BillingGateContext, deriveBillingGate, type BillingGate } from './BillingGate'
import { deriveBillingView, parseEntitlement, parseSubscriptionError } from '../../lib/billingState'
import { SubscriptionLimitError } from '../../lib/subscriptionGuard'

export const SB001_ERROR = {
  code: 'SB001',
  message: 'SB001 SUBSCRIPTION_LIMIT_REACHED',
  details: JSON.stringify({ code: 'SB001', resource: 'truck_add', limit: 5, used: 5, plan: 'starter', status: 'active' }),
}
export const SB002_ERROR = {
  code: 'SB002',
  message: 'SB002 SUBSCRIPTION_READ_ONLY',
  details: JSON.stringify({ code: 'SB002', resource: 'order_import', plan: 'starter', status: 'grace' }),
}
export const SB003_ERROR = {
  code: 'SB003',
  message: 'SB003 SUBSCRIPTION_DISPATCH_LOCKED',
  details: JSON.stringify({ code: 'SB003', resource: 'dispatch', plan: 'starter', status: 'expired' }),
}

export const SB004_ERROR = {
  code: 'SB004',
  message: 'SB004 SUBSCRIPTION_FEATURE_NOT_IN_PLAN',
  details: JSON.stringify({ code: 'SB004', resource: 'erp', plan: 'starter', status: 'active' }),
}

export function gateFor(
  status: 'grace' | 'expired' | 'active' | 'none' | 'cancelled',
  extra: Record<string, unknown> = {}
): BillingGate {
  const ent = parseEntitlement({
    ok: true,
    agency_id: 'a',
    status,
    plan_tier: 'starter',
    can_write: status === 'active',
    can_dispatch: status === 'active' || status === 'grace',
    ...extra,
  })
  return deriveBillingGate(ent, deriveBillingView(ent), false)
}

export function withGate(element: ReactElement, gate: BillingGate): ReactElement {
  return createElement(BillingGateContext.Provider, { value: gate }, element)
}

/** What the service layer throws for a guarded command (parsed SQLSTATE error). */
export function sbError(raw: typeof SB001_ERROR): SubscriptionLimitError {
  const info = parseSubscriptionError(raw)
  if (!info) throw new Error('fixture is not a subscription error')
  return new SubscriptionLimitError(info)
}
