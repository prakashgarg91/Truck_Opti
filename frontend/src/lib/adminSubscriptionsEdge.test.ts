import { describe, expect, it } from 'vitest'
import {
  interpretReopenResult,
  parseAdminRequest,
  reopenableSubscriptionIds,
  shapeRefundException,
  shapeRefusal,
  shapeSubscription,
} from '../../../supabase/functions/admin-portal-subscriptions/logic.ts'

const AGENCY = '0b9d3c1e-1111-4222-8333-444455556666'

const row = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  agency_id: AGENCY,
  user_id: 'u1',
  plan_id: 'p1',
  status: 'cancelled',
  billing_cycle: 'monthly',
  current_period_start: '2026-10-01T00:00:00Z',
  current_period_end: '2026-11-01T00:00:00Z',
  trial_end: null,
  grace_end: null,
  first_paid_at: '2026-10-01T00:00:00Z',
  cancel_at_period_end: null,
  created_at: '2026-10-01T00:00:00Z',
  ...over,
})

describe('admin-portal-subscriptions request parsing', () => {
  it('accepts list and reopen with a uuid agency; nothing else (no status write action exists)', () => {
    expect(parseAdminRequest({ action: 'list' })).toEqual({ action: 'list' })
    expect(parseAdminRequest({ action: 'reopen', agencyId: AGENCY })).toEqual({ action: 'reopen', agencyId: AGENCY })
    for (const bad of [
      { action: 'reopen' },
      { action: 'reopen', agencyId: 'not-a-uuid' },
      { action: 'set-status', agencyId: AGENCY, status: 'active' },
      { action: 'update', status: 'active' },
      { action: 'change-plan', planId: 'x' },
      null,
      [],
      'list',
    ]) {
      expect(parseAdminRequest(bad)).toHaveProperty('error')
    }
  })
})

describe('reopen eligibility (mirrors subscription_support_reopen)', () => {
  it('only the newest row of an agency that is cancelled with no live row is reopenable', () => {
    const rows = [
      row({ id: 'old', status: 'cancelled', created_at: '2026-01-01T00:00:00Z' }),
      row({ id: 'new', status: 'cancelled', created_at: '2026-05-01T00:00:00Z' }),
    ]
    expect([...reopenableSubscriptionIds(rows)]).toEqual(['new'])
  })

  it.each(['trial', 'active', 'past_due', 'grace'])('a live %s row blocks reopen for the agency', (live) => {
    const rows = [row({ id: 'c', status: 'cancelled' }), row({ id: 'l', status: live, created_at: '2026-11-01T00:00:00Z' })]
    expect(reopenableSubscriptionIds(rows).size).toBe(0)
  })

  it('an agency whose newest row is expired (already reopened) or that has no agency is not reopenable', () => {
    const rows = [
      row({ id: 'c', status: 'cancelled', created_at: '2026-05-01T00:00:00Z' }),
      row({ id: 'e', status: 'expired', created_at: '2026-06-01T00:00:00Z' }),
      row({ id: 'n', agency_id: null, status: 'cancelled' }),
    ]
    expect(reopenableSubscriptionIds(rows).size).toBe(0)
  })
})

describe('shapeSubscription', () => {
  it('exposes agency, grace_end and first_paid_at and flags can_reopen from the id set', () => {
    const shaped = shapeSubscription(
      row({ status: 'grace', grace_end: '2026-11-20T00:00:00Z' }) as never,
      { company_name: 'Acme', gstin: 'G', status: 'approved' },
      { name: 'Owner', email: 'o@x.test' },
      { id: 'p1', name: 'Pro', tier: 'pro' },
      new Set(['s1']),
    )
    expect(shaped).toMatchObject({
      agency_id: AGENCY,
      agency: { name: 'Acme', gstin: 'G', status: 'approved' },
      purchaser: { email: 'o@x.test' },
      status: 'grace',
      grace_end: '2026-11-20T00:00:00Z',
      first_paid_at: '2026-10-01T00:00:00Z',
      cancel_at_period_end: false,
      can_reopen: true,
    })
    expect(shaped).not.toHaveProperty('user_id')
  })

  it('tolerates a legacy row with no agency, purchaser or plan', () => {
    const shaped = shapeSubscription(row({ agency_id: null, user_id: null }) as never, null, null, null, new Set())
    expect(shaped).toMatchObject({ agency: null, purchaser: null, plan: null, can_reopen: false })
  })
})

describe('refusal and refund exception shaping', () => {
  const pay = (metadata: Record<string, unknown> | null) => ({
    id: 'pay1',
    agency_id: AGENCY,
    subscription_id: 's1',
    amount: 118000,
    status: 'pending',
    razorpay_order_id: 'order_1',
    razorpay_payment_id: null,
    error_message: 'amount differs',
    metadata,
    created_at: '2026-11-06T08:00:00Z',
  })

  it('surfaces the captured payment id and refusal code from metadata', () => {
    const shaped = shapeRefusal(
      pay({ refusal: 'AMOUNT_MISMATCH', captured_payment_id: 'pay_C', refused_payment_ids: ['pay_C', 7], at: '2026-11-06T08:01:00Z' }),
    )
    expect(shaped).toMatchObject({
      refusal: 'AMOUNT_MISMATCH',
      payment_id: 'pay_C',
      refused_payment_ids: ['pay_C'],
      amount_paise: 118000,
      refused_at: '2026-11-06T08:01:00Z',
      order_id: 'order_1',
    })
  })

  it('returns null for a row with no refusal (resolved rows carry prior_refusal only) or no metadata', () => {
    expect(shapeRefusal(pay({ prior_refusal: 'AMOUNT_MISMATCH' }))).toBeNull()
    expect(shapeRefusal(pay({ refusal: '  ' }))).toBeNull()
    expect(shapeRefusal(pay(null))).toBeNull()
  })

  it('coerces a bigint-as-string refund amount to a number', () => {
    expect(
      shapeRefundException({ id: 'x', refund_id: 'r', payment_id: 'p', agency_id: null, amount_paise: '59000', reason: 'why', created_at: 'ts' }),
    ).toMatchObject({ amount_paise: 59000, agency_id: null, reason: 'why' })
  })
})

describe('interpretReopenResult', () => {
  it('passes success through with the new subscription id', () => {
    expect(interpretReopenResult({ ok: true, subscription_id: 'new', status: 'expired' })).toEqual({ ok: true, subscriptionId: 'new' })
  })

  it.each([
    ['agency_not_found', 404],
    ['agency_not_operational', 409],
    ['subscription_live_exists', 409],
    ['subscription_not_cancelled', 409],
  ])('maps %s to a safe %i refusal', (code, status) => {
    const out = interpretReopenResult({ ok: false, error: code })
    expect(out).toMatchObject({ ok: false, status })
    expect((out as { message: string }).message).not.toContain(code)
  })

  it('treats malformed or unknown results as a generic refusal, never as success', () => {
    for (const bad of [null, undefined, 'ok', { ok: false, error: 'weird' }, { ok: 'true' }]) {
      expect(interpretReopenResult(bad)).toMatchObject({ ok: false, status: 409 })
    }
  })
})
