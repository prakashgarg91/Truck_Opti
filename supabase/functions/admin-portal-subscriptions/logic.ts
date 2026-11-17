// Pure decision logic for admin-portal-subscriptions (no Deno, no network) so vitest can cover it.
// Subscriptions are agency-level (TO-152). The admin surface is read-only except for ONE legal action,
// 'reopen', which calls the service-only SQL command subscription_support_reopen. Status is never written here:
// the DB status machine owns every transition.

export type AdminAction = { action: 'list' } | { action: 'reopen'; agencyId: string }

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'grace', 'expired', 'cancelled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

const LIVE_STATUSES: readonly string[] = ['trial', 'active', 'past_due', 'grace']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseAdminRequest(body: unknown): AdminAction | { error: string } {
  if (!isRecord(body)) return { error: 'A valid admin action is required.' }
  if (body.action === 'list') return { action: 'list' }
  if (body.action === 'reopen') {
    const agencyId = typeof body.agencyId === 'string' ? body.agencyId.trim() : ''
    if (!UUID_RE.test(agencyId)) return { error: 'A valid agency is required.' }
    return { action: 'reopen', agencyId }
  }
  return { error: 'A valid admin action is required.' }
}

export type SubscriptionRowInput = {
  id: string
  agency_id: string | null
  user_id: string | null
  plan_id: string
  status: string
  billing_cycle: string
  current_period_start: string
  current_period_end: string
  trial_end: string | null
  grace_end: string | null
  first_paid_at: string | null
  cancel_at_period_end: boolean | null
  created_at: string
}

/** Ids of the NEWEST row of each agency that is cancelled while the agency holds no live row: the only reopen targets. */
export function reopenableSubscriptionIds(rows: readonly Pick<SubscriptionRowInput, 'id' | 'agency_id' | 'status' | 'created_at'>[]): Set<string> {
  const byAgency = new Map<string, Pick<SubscriptionRowInput, 'id' | 'agency_id' | 'status' | 'created_at'>[]>()
  for (const row of rows) {
    if (!row.agency_id) continue
    const list = byAgency.get(row.agency_id) ?? []
    list.push(row)
    byAgency.set(row.agency_id, list)
  }
  const out = new Set<string>()
  for (const list of byAgency.values()) {
    if (list.some((r) => LIVE_STATUSES.includes(r.status))) continue
    const newest = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (newest?.status === 'cancelled') out.add(newest.id)
  }
  return out
}

export type AgencyInfo = { company_name: string | null; gstin: string | null; status: string | null }
export type UserInfo = { name: string | null; email: string | null }
export type PlanInfo = { id: string; name: string; tier: string }

export function shapeSubscription(
  row: SubscriptionRowInput,
  agency: AgencyInfo | null,
  purchaser: UserInfo | null,
  plan: PlanInfo | null,
  reopenable: ReadonlySet<string>,
) {
  return {
    id: row.id,
    agency_id: row.agency_id,
    agency: agency ? { name: agency.company_name, gstin: agency.gstin, status: agency.status } : null,
    purchaser: purchaser ? { name: purchaser.name, email: purchaser.email } : null,
    status: row.status,
    billing_cycle: row.billing_cycle,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    trial_end: row.trial_end,
    grace_end: row.grace_end,
    first_paid_at: row.first_paid_at,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    created_at: row.created_at,
    plan: plan ? { id: plan.id, name: plan.name, tier: plan.tier } : null,
    can_reopen: reopenable.has(row.id),
  }
}

export type RefusalRowInput = {
  id: string
  agency_id: string | null
  subscription_id: string | null
  amount: number | null
  status: string
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Captured-but-refused payment (metadata.refusal set by subscription_note_refusal). Null when the row has none. */
export function shapeRefusal(row: RefusalRowInput) {
  const meta = isRecord(row.metadata) ? row.metadata : {}
  const refusal = typeof meta.refusal === 'string' && meta.refusal.trim() ? meta.refusal.trim() : null
  if (!refusal) return null
  const capturedPaymentId =
    typeof meta.captured_payment_id === 'string' && meta.captured_payment_id ? meta.captured_payment_id : row.razorpay_payment_id
  const refused = Array.isArray(meta.refused_payment_ids) ? meta.refused_payment_ids.filter((v): v is string => typeof v === 'string') : []
  return {
    id: row.id,
    agency_id: row.agency_id,
    subscription_id: row.subscription_id,
    amount_paise: typeof row.amount === 'number' ? row.amount : null,
    order_id: row.razorpay_order_id,
    payment_id: capturedPaymentId,
    refused_payment_ids: refused,
    refusal,
    refused_at: typeof meta.at === 'string' ? meta.at : row.created_at,
    error_message: row.error_message,
  }
}

export type RefundExceptionRowInput = {
  id: string
  refund_id: string
  payment_id: string
  agency_id: string | null
  amount_paise: number | string
  reason: string
  created_at: string
}

export function shapeRefundException(row: RefundExceptionRowInput) {
  return {
    id: row.id,
    refund_id: row.refund_id,
    payment_id: row.payment_id,
    agency_id: row.agency_id,
    amount_paise: Number(row.amount_paise),
    reason: row.reason,
    created_at: row.created_at,
  }
}

const REOPEN_MESSAGES: Record<string, { status: number; message: string }> = {
  agency_not_found: { status: 404, message: 'That agency no longer exists.' },
  agency_not_operational: { status: 409, message: 'The agency must be approved before its subscription can be reopened.' },
  subscription_live_exists: { status: 409, message: 'The agency already has a live subscription.' },
  subscription_not_cancelled: { status: 409, message: 'Only an agency whose latest subscription is cancelled can be reopened.' },
}

/** Maps the jsonb result of subscription_support_reopen to an HTTP outcome. */
export function interpretReopenResult(result: unknown):
  | { ok: true; subscriptionId: string | null }
  | { ok: false; status: number; message: string } {
  if (isRecord(result) && result.ok === true) {
    return { ok: true, subscriptionId: typeof result.subscription_id === 'string' ? result.subscription_id : null }
  }
  const code = isRecord(result) && typeof result.error === 'string' ? result.error : ''
  const known = REOPEN_MESSAGES[code]
  return { ok: false, status: known?.status ?? 409, message: known?.message ?? 'The subscription could not be reopened.' }
}
