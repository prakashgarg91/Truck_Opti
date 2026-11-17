import { describe, expect, it } from 'vitest'
import {
  ACTIVATION_POLL_BUDGET_MS,
  activationPollDelay,
  buildUsageRows,
  daysUntil,
  deriveBillingView,
  formatPlanPrice,
  hasActivated,
  parseEntitlement,
  parseSubscriptionError,
  parseTrialError,
  pollForActivation,
  trialErrorMessage,
  type Entitlement,
} from './billingState'

const raw = (over: Record<string, unknown> = {}) => ({
  ok: true,
  agency_id: 'ag1',
  status: 'active',
  plan_tier: 'growth',
  period_end: '2027-01-31T00:00:00Z',
  grace_end: null,
  trial_end: null,
  can_write: true,
  can_dispatch: true,
  limits: { trucks: 10, staff: 5, drivers: 20, orders_month: 500 },
  usage: { trucks: 10, staff: 2, drivers: 3, orders_month: 120 },
  ...over,
})
const ent = (over: Record<string, unknown> = {}): Entitlement => parseEntitlement(raw(over))
const NOW = new Date('2027-01-01T00:00:00Z')

describe('parseEntitlement', () => {
  it('maps the RPC shape', () => {
    const e = ent()
    expect(e).toMatchObject({ status: 'active', planTier: 'growth', canWrite: true, canDispatch: true })
    expect(e.limits.orders_month).toBe(500)
    expect(e.usage.trucks).toBe(10)
  })
  it('fails closed on garbage', () => {
    for (const bad of [null, undefined, 'x', [], { ok: false, can_write: true }]) {
      const e = parseEntitlement(bad)
      expect(e.status).toBe('none')
      expect(e.canWrite).toBe(false)
      expect(e.canDispatch).toBe(false)
    }
  })
  it('rejects unknown status and negative usage', () => {
    const e = ent({ status: 'weird', usage: { trucks: -4 } })
    expect(e.status).toBe('none')
    expect(e.usage.trucks).toBe(0)
  })
})

describe('daysUntil / deriveBillingView', () => {
  it('rounds up and never goes negative', () => {
    expect(daysUntil('2027-01-04T00:00:01Z', NOW)).toBe(4)
    expect(daysUntil('2026-12-01T00:00:00Z', NOW)).toBe(0)
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil('nope', NOW)).toBeNull()
  })
  it('trial banner with days left', () => {
    const v = deriveBillingView(ent({ status: 'trial', trial_end: '2027-01-08T00:00:00Z' }), NOW)
    expect(v.banner).toBe('trial')
    expect(v.daysLeft).toBe(7)
  })
  it('past_due keeps writes on', () => {
    const v = deriveBillingView(ent({ status: 'past_due' }), NOW)
    expect(v.banner).toBe('past_due')
    expect(v.canCreate).toBe(true)
  })
  it('grace is read-only', () => {
    const v = deriveBillingView(ent({ status: 'grace', can_write: false, grace_end: '2027-01-04T00:00:00Z' }), NOW)
    expect(v.banner).toBe('grace')
    expect(v.canCreate).toBe(false)
    expect(v.daysLeft).toBe(3)
  })
  it('expired locks dispatch', () => {
    const v = deriveBillingView(ent({ status: 'expired', can_write: false, can_dispatch: false }), NOW)
    expect(v.banner).toBe('expired')
    expect(v.dispatchLocked).toBe(true)
  })
  it('no plan offers the trial; active has no banner', () => {
    expect(deriveBillingView(parseEntitlement({ ok: false }), NOW).needsPlan).toBe(true)
    expect(deriveBillingView(ent(), NOW).banner).toBeNull()
  })
})

describe('buildUsageRows', () => {
  it('shows exact numbers and flags limits', () => {
    const rows = buildUsageRows(ent())
    expect(rows.map((r) => r.text)).toEqual(['10 of 10', '2 of 5', '3 of 20', '120 of 500'])
    expect(rows[0].atLimit).toBe(true)
    expect(rows[0].percent).toBe(100)
    expect(rows[1].percent).toBe(40)
  })
  it('handles missing limits', () => {
    const rows = buildUsageRows(ent({ limits: {} }))
    expect(rows[0]).toMatchObject({ limit: null, percent: 0, atLimit: false, text: '10 used' })
  })
})

describe('parseSubscriptionError', () => {
  const detail = JSON.stringify({ code: 'SUBSCRIPTION_LIMIT_REACHED', resource: 'truck_add', limit: 5, used: 5, plan: 'starter', status: 'active' })
  it('parses SB001 from message prefix and DETAIL', () => {
    const info = parseSubscriptionError({ message: 'SB001 SUBSCRIPTION_LIMIT_REACHED', details: detail, code: 'SB001' })
    expect(info).toMatchObject({ code: 'SB001', kind: 'limit_reached', resource: 'truck_add', limit: 5, used: 5, plan: 'starter', action: 'upgrade' })
    expect(info?.message).toContain('5 of 5')
    expect(info?.message).toContain('trucks')
  })
  it('parses SB002 and distinguishes past_due', () => {
    const grace = parseSubscriptionError({ message: 'SB002 SUBSCRIPTION_READ_ONLY', details: JSON.stringify({ status: 'grace' }) })
    expect(grace).toMatchObject({ kind: 'read_only', action: 'renew' })
    const due = parseSubscriptionError({ message: 'SB002 x', details: JSON.stringify({ status: 'past_due' }) })
    expect(due?.action).toBe('pay')
  })
  it('parses SB003', () => {
    expect(parseSubscriptionError({ message: 'SB003 SUBSCRIPTION_DISPATCH_LOCKED' })).toMatchObject({ kind: 'dispatch_locked', action: 'renew' })
  })
  it('falls back to the SQLSTATE code and tolerates bad DETAIL', () => {
    const info = parseSubscriptionError({ message: 'something', code: 'SB001', details: '{not json' })
    expect(info?.code).toBe('SB001')
    expect(info?.limit).toBeNull()
  })
  it('works for Error instances and ignores other errors', () => {
    expect(parseSubscriptionError(new Error('SB002 read only'))?.code).toBe('SB002')
    expect(parseSubscriptionError({ message: 'permission denied', code: '42501' })).toBeNull()
    expect(parseSubscriptionError(null)).toBeNull()
    expect(parseSubscriptionError('SB001')).toBeNull()
  })
})

describe('trial errors', () => {
  it('finds typed codes', () => {
    expect(parseTrialError({ message: 'trial_already_claimed' })).toBe('trial_already_claimed')
    expect(parseTrialError({ ok: false, error: 'identity_required' })).toBe('identity_required')
    expect(parseTrialError(new Error('forbidden_scope: x'))).toBe('forbidden_scope')
    expect(parseTrialError({ message: 'other' })).toBeNull()
  })
  it('has a message for each', () => {
    expect(trialErrorMessage('forbidden_scope')).toMatch(/owner/)
    expect(trialErrorMessage(null)).toMatch(/could not/)
  })
})

describe('activation', () => {
  it('hasActivated needs an active status and a change when already active', () => {
    const active = ent()
    expect(hasActivated(null, ent({ status: 'grace' }))).toBe(false)
    expect(hasActivated(ent({ status: 'past_due' }), active)).toBe(true)
    expect(hasActivated(active, active)).toBe(false)
    expect(hasActivated(active, ent({ period_end: '2027-02-28T00:00:00Z' }))).toBe(true)
    expect(hasActivated(active, ent({ plan_tier: 'professional' }))).toBe(true)
  })
  it('backoff stops at the 60 s budget', () => {
    expect(activationPollDelay(0, 0)).toBe(2000)
    expect(activationPollDelay(99, 10_000)).toBe(10_000)
    expect(activationPollDelay(2, 57_000)).toBe(3000)
    expect(activationPollDelay(1, ACTIVATION_POLL_BUDGET_MS)).toBeNull()
  })
  it('polls until active', async () => {
    const reads = [ent({ status: 'grace' }), ent({ status: 'grace' }), ent()]
    const slept: number[] = []
    const out = await pollForActivation({
      fetchEntitlement: async () => reads.shift() as Entitlement,
      before: ent({ status: 'grace' }),
      sleep: async (ms) => { slept.push(ms) },
    })
    expect(out).toBe('activated')
    expect(slept).toEqual([2000, 3000])
  })
  it('times out after at most 60 s of waiting and survives fetch errors', async () => {
    let total = 0
    const out = await pollForActivation({
      fetchEntitlement: async () => { throw new Error('net') },
      before: null,
      sleep: async (ms) => { total += ms },
    })
    expect(out).toBe('timeout')
    expect(total).toBe(ACTIVATION_POLL_BUDGET_MS)
  })
  it('can be cancelled', async () => {
    const out = await pollForActivation({
      fetchEntitlement: async () => ent(),
      before: null,
      sleep: async () => {},
      isCancelled: () => true,
    })
    expect(out).toBe('cancelled')
  })
})

describe('formatPlanPrice', () => {
  it('uses Indian grouping without .00', () => {
    expect(formatPlanPrice(49_900)).toBe('₹499')
    expect(formatPlanPrice(499_900)).toBe('₹4,999')
    expect(formatPlanPrice(1_999_000)).toBe('₹19,990')
  })
})
