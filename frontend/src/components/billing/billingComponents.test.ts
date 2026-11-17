import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import BillingBanner from './BillingBanner'
import LimitPrompt from './LimitPrompt'
import UsageBars from './UsageBars'
import { FOCUS_RING } from './styles'
import { deriveBillingView, parseEntitlement, parseSubscriptionError } from '../../lib/billingState'

const ent = (over: Record<string, unknown> = {}) =>
  parseEntitlement({
    ok: true, agency_id: 'a', status: 'active', plan_tier: 'starter', period_end: '2027-01-31T00:00:00Z',
    can_write: true, can_dispatch: true,
    limits: { trucks: 5, staff: 2, drivers: 10, orders_month: 100 },
    usage: { trucks: 5, staff: 1, drivers: 4, orders_month: 37 },
    ...over,
  })
const banner = (e: ReturnType<typeof ent>) =>
  renderToStaticMarkup(createElement(BillingBanner, { view: deriveBillingView(e, new Date('2027-01-01T00:00:00Z')), onAction: () => {} }))

describe('BillingBanner', () => {
  it('trial shows days left', () => {
    expect(banner(ent({ status: 'trial', trial_end: '2027-01-06T00:00:00Z' }))).toContain('5 days left')
  })
  it('past_due offers Pay now', () => {
    expect(banner(ent({ status: 'past_due' }))).toContain('Pay now')
  })
  it('grace is read-only with Renew', () => {
    const html = banner(ent({ status: 'grace', can_write: false, grace_end: '2027-01-05T00:00:00Z' }))
    expect(html).toContain('Read-only')
    expect(html).toContain('Renew')
  })
  it('expired says data stays visible and never offers refund or cancel', () => {
    const html = banner(ent({ status: 'expired', can_write: false, can_dispatch: false }))
    expect(html).toContain('data stays visible')
    expect(html).not.toMatch(/refund|cancel|auto-renew/i)
  })
  it('active renders nothing', () => {
    expect(banner(ent())).toBe('')
  })
  it('buttons are 44px and focus-ringed', () => {
    const html = banner(ent({ status: 'past_due' }))
    expect(html).toContain('min-h-[44px]')
    expect(html).toContain('focus-visible:ring-2')
    expect(FOCUS_RING).toContain('focus-visible:ring-indigo-500')
  })
})

describe('UsageBars', () => {
  it('renders exact numbers and accessible progress bars', () => {
    const html = renderToStaticMarkup(createElement(UsageBars, { entitlement: ent() }))
    for (const t of ['5 of 5', '1 of 2', '4 of 10', '37 of 100', 'Orders this month', 'Limit reached']) expect(html).toContain(t)
    expect(html).toContain('role="progressbar"')
  })
})

describe('LimitPrompt', () => {
  it('builds a prompt from an SB001 error', () => {
    const info = parseSubscriptionError({
      message: 'SB001 SUBSCRIPTION_LIMIT_REACHED',
      details: JSON.stringify({ resource: 'truck_add', limit: 5, used: 5, plan: 'starter', status: 'active' }),
    })!
    const html = renderToStaticMarkup(createElement(LimitPrompt, { info, onAction: () => {}, onDismiss: () => {} }))
    expect(html).toContain('Plan limit reached')
    expect(html).toContain('Upgrade plan')
    expect(html).toContain('Dismiss')
  })
})

describe('page guards (source level, no browser)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  it('CheckoutPage has no PhonePe, no tax maths and sends no amount', () => {
    const src = read('../../pages/CheckoutPage.tsx')
    expect(src).not.toMatch(/phonepe/i)
    expect(src).not.toMatch(/calculateSubscriptionBillingAmounts|taxAmount|initiateRazorpayPayment/)
    expect(src).toContain('GST_NOTE')
  })
  it('billing pages never write subscription rows or offer cancel/refund buttons', () => {
    for (const f of ['CheckoutPage', 'SubscriptionPage', 'PricingPage']) {
      const src = read(`../../pages/${f}.tsx`)
      expect(src).not.toMatch(/\.from\('subscriptions'\)/)
      expect(src).not.toMatch(/>\s*(Cancel subscription|Request refund|Auto-renew)/i)
    }
    expect(read('../../pages/SubscriptionPage.tsx')).toContain('to="/terms"')
  })
  it('the API never reads subscription or usage tables', () => {
    const src = read('../../services/subscriptionApi.ts')
    expect(src).not.toMatch(/from\('(subscriptions|usage_tracking)'\)/)
  })
})
