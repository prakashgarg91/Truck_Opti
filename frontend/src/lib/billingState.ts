// Pure billing-state helpers for the agency subscription UI (TO-152 S7).
// No React, no network. The server is the only authority: this file only
// parses what the entitlement RPC and the limit guard return and turns it
// into labels. It never computes a price, a tax amount or an entitlement.

import { formatInr } from './invoiceMoney'

export type BillingStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'expired'
  | 'cancelled'
  | 'none'

const KNOWN_STATUSES: readonly BillingStatus[] = ['trial', 'active', 'past_due', 'grace', 'expired', 'cancelled']

export interface EntitlementLimits {
  trucks: number | null
  staff: number | null
  drivers: number | null
  orders_month: number | null
}

export interface EntitlementUsage {
  trucks: number
  staff: number
  drivers: number
  orders_month: number
}

/** Shape returned by the agency_subscription_entitlement() RPC, normalised. */
export interface Entitlement {
  ok: boolean
  agencyId: string | null
  status: BillingStatus
  planTier: string | null
  periodEnd: string | null
  graceEnd: string | null
  trialEnd: string | null
  canWrite: boolean
  canDispatch: boolean
  limits: EntitlementLimits
  usage: EntitlementUsage
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Normalise the raw RPC jsonb. Anything unexpected becomes the safest state:
 * status 'none', cannot write, cannot dispatch.
 */
export function parseEntitlement(raw: unknown): Entitlement {
  const r = asRecord(raw)
  const limits = asRecord(r.limits)
  const usage = asRecord(r.usage)
  const status = (KNOWN_STATUSES as readonly unknown[]).includes(r.status)
    ? (r.status as BillingStatus)
    : 'none'

  return {
    ok: r.ok === true,
    agencyId: asStringOrNull(r.agency_id),
    status,
    planTier: asStringOrNull(r.plan_tier),
    periodEnd: asStringOrNull(r.period_end),
    graceEnd: asStringOrNull(r.grace_end),
    trialEnd: asStringOrNull(r.trial_end),
    canWrite: r.ok === true && r.can_write === true,
    canDispatch: r.ok === true && r.can_dispatch === true,
    limits: {
      trucks: asLimit(limits.trucks),
      staff: asLimit(limits.staff),
      drivers: asLimit(limits.drivers),
      orders_month: asLimit(limits.orders_month),
    },
    usage: {
      trucks: asCount(usage.trucks),
      staff: asCount(usage.staff),
      drivers: asCount(usage.drivers),
      orders_month: asCount(usage.orders_month),
    },
  }
}

const DAY_MS = 86_400_000

/** Whole days left until `iso` (rounded up, never negative); null when unknown. */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.ceil((t - now.getTime()) / DAY_MS))
}

// ---------------------------------------------------------------- view state

export type BannerKind = 'trial' | 'past_due' | 'grace' | 'expired'

export interface BillingView {
  banner: BannerKind | null
  /** Days left in the trial, grace window or current period, when relevant. */
  daysLeft: number | null
  /** Create buttons must be disabled when false (server still enforces). */
  canCreate: boolean
  /** Dispatch actions are locked (expired). */
  dispatchLocked: boolean
  /** The agency has never had a subscription: offer the trial. */
  needsPlan: boolean
  statusLabel: string
}

const STATUS_LABELS: Record<BillingStatus, string> = {
  trial: 'Free trial',
  active: 'Active',
  past_due: 'Payment due',
  grace: 'Grace period (read-only)',
  expired: 'Expired',
  cancelled: 'Cancelled',
  none: 'No plan',
}

export function deriveBillingView(ent: Entitlement, now: Date = new Date()): BillingView {
  const statusLabel = STATUS_LABELS[ent.status]
  const base = {
    canCreate: ent.canWrite,
    dispatchLocked: ent.status === 'expired' || ent.status === 'cancelled' || !ent.canDispatch,
    needsPlan: ent.status === 'none',
    statusLabel,
  }

  switch (ent.status) {
    case 'trial':
      return { ...base, banner: 'trial', daysLeft: daysUntil(ent.trialEnd ?? ent.periodEnd, now) }
    case 'past_due':
      return { ...base, banner: 'past_due', daysLeft: daysUntil(ent.periodEnd, now) }
    case 'grace':
      return { ...base, banner: 'grace', daysLeft: daysUntil(ent.graceEnd, now) }
    case 'expired':
    case 'cancelled':
      return { ...base, banner: 'expired', daysLeft: null }
    default:
      return { ...base, banner: null, daysLeft: ent.status === 'active' ? daysUntil(ent.periodEnd, now) : null }
  }
}

export type UsageKey = keyof EntitlementUsage

export interface UsageRow {
  key: UsageKey
  label: string
  used: number
  /** null means the server reported no numeric limit. */
  limit: number | null
  /** 0..100 for the bar; 0 when there is no limit. */
  percent: number
  atLimit: boolean
  /** Exact numbers from the RPC, e.g. "3 of 10". */
  text: string
}

const USAGE_LABELS: ReadonlyArray<{ key: UsageKey; label: string }> = [
  { key: 'trucks', label: 'Trucks' },
  { key: 'staff', label: 'Staff seats' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'orders_month', label: 'Orders this month' },
]

export function buildUsageRows(ent: Entitlement): UsageRow[] {
  return USAGE_LABELS.map(({ key, label }) => {
    const used = ent.usage[key]
    const limit = ent.limits[key]
    const hasLimit = limit !== null && limit > 0
    const percent = hasLimit ? Math.min(100, Math.round((used / limit) * 100)) : 0
    return {
      key,
      label,
      used,
      limit,
      percent,
      atLimit: hasLimit && used >= limit,
      text: limit === null ? `${used} used` : `${used} of ${limit}`,
    }
  })
}

// ------------------------------------------------------- limit-guard errors

export type SubscriptionErrorCode = 'SB001' | 'SB002' | 'SB003'

export interface SubscriptionErrorInfo {
  code: SubscriptionErrorCode
  kind: 'limit_reached' | 'read_only' | 'dispatch_locked'
  resource: string | null
  limit: number | null
  used: number | null
  plan: string | null
  status: string | null
  title: string
  message: string
  /** Which call to action the prompt should offer. */
  action: 'upgrade' | 'pay' | 'renew'
}

const RESOURCE_LABELS: Record<string, string> = {
  truck: 'trucks',
  trucks: 'trucks',
  staff: 'staff seats',
  driver: 'drivers',
  drivers: 'drivers',
  order: 'orders this month',
  orders: 'orders this month',
  orders_month: 'orders this month',
  order_import: 'orders this month',
  truck_add: 'trucks',
  staff_add: 'staff seats',
  driver_add: 'drivers',
}

function resourceLabel(resource: string | null): string {
  if (!resource) return 'this plan limit'
  return RESOURCE_LABELS[resource] ?? resource.replace(/_/g, ' ')
}

function tryParseJson(text: unknown): Record<string, unknown> {
  if (typeof text !== 'string') return asRecord(text)
  try {
    return asRecord(JSON.parse(text))
  } catch {
    return {}
  }
}

function detectCode(err: Record<string, unknown>): SubscriptionErrorCode | null {
  const message = typeof err.message === 'string' ? err.message : ''
  const prefix = /^\s*(SB00[123])\b/.exec(message)?.[1]
  if (prefix) return prefix as SubscriptionErrorCode
  if (err.code === 'SB001' || err.code === 'SB002' || err.code === 'SB003') return err.code
  return null
}

/**
 * Turn a Supabase/PostgREST error from a guarded command into a prompt, or
 * return null when it is not a subscription error. SQLSTATE SB001/SB002/SB003,
 * MESSAGE starts with the code, DETAIL is JSON {code,resource,limit,used,plan,status}.
 */
export function parseSubscriptionError(err: unknown): SubscriptionErrorInfo | null {
  const e = asRecord(err)
  if (Object.keys(e).length === 0 && !(err instanceof Error)) return null
  const source = err instanceof Error ? { message: err.message, ...e } : e
  const code = detectCode(source)
  if (!code) return null

  const detail = tryParseJson(source.details ?? source.detail)
  const resource = asStringOrNull(detail.resource)
  const limit = asLimit(detail.limit)
  const used = asLimit(detail.used)
  const plan = asStringOrNull(detail.plan)
  const status = asStringOrNull(detail.status)

  if (code === 'SB001') {
    const what = resourceLabel(resource)
    const numbers = limit !== null && used !== null ? ` (${used} of ${limit} used)` : ''
    return {
      code,
      kind: 'limit_reached',
      resource,
      limit,
      used,
      plan,
      status,
      title: 'Plan limit reached',
      message: `Your plan allows no more ${what}${numbers}. Upgrade your plan to add more.`,
      action: 'upgrade',
    }
  }

  if (code === 'SB002') {
    const pastDue = status === 'past_due'
    return {
      code,
      kind: 'read_only',
      resource,
      limit,
      used,
      plan,
      status,
      title: 'Your account is read-only',
      message: pastDue
        ? 'Payment is due. Pay now to create or import new records. Your data stays visible.'
        : 'Your subscription is in its grace period, so new records cannot be created. Renew to continue. Your data stays visible.',
      action: pastDue ? 'pay' : 'renew',
    }
  }

  return {
    code,
    kind: 'dispatch_locked',
    resource,
    limit,
    used,
    plan,
    status,
    title: 'Dispatch is locked',
    message: 'Your subscription has expired, so dispatch actions are locked. Renew to resume dispatch. Your data stays visible.',
    action: 'renew',
  }
}

// --------------------------------------------------------------- trial errors

export type TrialErrorCode = 'identity_required' | 'trial_already_claimed' | 'forbidden_scope'

const TRIAL_MESSAGES: Record<TrialErrorCode, string> = {
  identity_required: 'Add your GSTIN and phone to the agency profile first, then start your trial.',
  trial_already_claimed: 'A free trial has already been used for this agency, GSTIN or phone number. Choose a plan to continue.',
  forbidden_scope: 'Only the agency owner can start the free trial.',
}

/** Find a typed trial error in a thrown error or an {ok:false,error} payload. */
export function parseTrialError(input: unknown): TrialErrorCode | null {
  const r = asRecord(input)
  const candidates = [r.error, r.code, r.message, r.details, r.hint]
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    for (const code of Object.keys(TRIAL_MESSAGES) as TrialErrorCode[]) {
      if (c.includes(code)) return code
    }
  }
  if (input instanceof Error) {
    for (const code of Object.keys(TRIAL_MESSAGES) as TrialErrorCode[]) {
      if (input.message.includes(code)) return code
    }
  }
  return null
}

export function trialErrorMessage(code: TrialErrorCode | null): string {
  return code ? TRIAL_MESSAGES[code] : 'We could not start your trial. Please try again or contact support.'
}

// ---------------------------------------------------------------- activation

/** The server is the only thing that activates; this compares two reads. */
export function hasActivated(before: Entitlement | null, after: Entitlement): boolean {
  if (after.status !== 'active') return false
  if (!before || before.status !== 'active') return true
  return before.periodEnd !== after.periodEnd || before.planTier !== after.planTier
}

export const ACTIVATION_POLL_BUDGET_MS = 60_000
const BACKOFF_STEPS_MS = [2_000, 3_000, 5_000, 8_000, 10_000]

/** Delay before poll number `attempt` (0-based); null once the budget is spent. */
export function activationPollDelay(attempt: number, elapsedMs: number): number | null {
  if (elapsedMs >= ACTIVATION_POLL_BUDGET_MS) return null
  const step = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)]
  return Math.min(step, ACTIVATION_POLL_BUDGET_MS - elapsedMs)
}

export type ActivationOutcome = 'activated' | 'timeout' | 'cancelled'

export interface ActivationPollOptions {
  fetchEntitlement: () => Promise<Entitlement>
  before: Entitlement | null
  sleep: (ms: number) => Promise<void>
  isCancelled?: () => boolean
  onAttempt?: (attempt: number) => void
}

/**
 * Refetch the entitlement with backoff for at most 60 s of waiting. Fetch
 * failures are treated as "not yet" so a flaky network cannot fake success.
 */
export async function pollForActivation(options: ActivationPollOptions): Promise<ActivationOutcome> {
  const { fetchEntitlement, before, sleep, isCancelled, onAttempt } = options
  let elapsed = 0
  let attempt = 0
  for (;;) {
    if (isCancelled?.()) return 'cancelled'
    onAttempt?.(attempt)
    try {
      const next = await fetchEntitlement()
      if (hasActivated(before, next)) return 'activated'
    } catch {
      // keep polling
    }
    const delay = activationPollDelay(attempt, elapsed)
    if (delay === null || delay <= 0) return 'timeout'
    await sleep(delay)
    elapsed += delay
    attempt += 1
  }
}

// ------------------------------------------------------------------- display

export const GST_NOTE = 'GST extra at 18%'
export const TWO_MONTHS_FREE = 'Two months free'

/** Display-only list prices (paise), used only if the plans table cannot be read. */
export const FALLBACK_PLAN_PRICES_PAISE: Readonly<Record<string, { monthly: number; yearly: number }>> = {
  starter: { monthly: 49_900, yearly: 499_000 },
  growth: { monthly: 199_900, yearly: 1_999_000 },
  professional: { monthly: 499_900, yearly: 4_999_000 },
}

/** List price in paise as "₹1,999" (drops a zero ".00"); uses the shared INR formatter. */
export function formatPlanPrice(paise: number): string {
  return formatInr(paise).replace(/\.00$/, '')
}
