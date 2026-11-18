import { describe, expect, it } from 'vitest'
import { PRICING_TIERS, TRIAL_CONFIG, FEATURE_LABELS, featureLabel, supportLevelLabel } from './pricing'

// Source of truth (docs/legal/SUBSCRIPTION-POLICY-DRAFT.md, section 1). Changing these
// numbers is a commercial decision, not a copy edit.
const tier = (id: string) => {
    const found = PRICING_TIERS.find((t) => t.id === id)
    if (!found) throw new Error(`missing tier ${id}`)
    return found
}

describe('PRICING_TIERS match the approved plan facts', () => {
    it.each([
        ['starter', 499, 4990, 3, 2],
        ['growth', 1999, 19990, 20, 10],
        ['professional', 4999, 49990, 50, 25],
    ])('%s: monthly, yearly, trucks and staff', (id, monthly, yearly, trucks, users) => {
        const t = tier(id)
        expect(t.monthlyPrice).toBe(monthly)
        expect(t.yearlyPrice).toBe(yearly)
        expect(t.limits.trucksManaged).toBe(trucks)
        expect(t.limits.users).toBe(users)
    })

    it('yearly price is exactly 10 times monthly for every listed plan', () => {
        for (const id of ['starter', 'growth', 'professional']) {
            expect(tier(id).yearlyPrice).toBe(tier(id).monthlyPrice * 10)
        }
    })

    it('Enterprise has no list price (contact us)', () => {
        expect(tier('enterprise').monthlyPrice).toBe(0)
        expect(tier('enterprise').yearlyPrice).toBe(0)
    })

    it('Growth support is chat, and the Growth feature list says so', () => {
        expect(tier('growth').limits.supportLevel).toBe('chat')
        expect(tier('growth').features).toContain('Chat support')
        expect(tier('growth').features.join('|')).not.toMatch(/Priority Email Support/)
    })

    it('does not advertise features that are not offered', () => {
        const all = PRICING_TIERS.flatMap((t) => t.features).join('|')
        expect(all).not.toMatch(/WhatsApp/)
        expect(all).not.toMatch(/Multi-language/)
        expect(all).not.toMatch(/10 types/)
        expect(all).not.toMatch(/17\+ types/)
        expect(all).not.toMatch(/Hindi/)
    })

    it('Professional no longer lists API access (the database places it in Growth)', () => {
        expect(tier('professional').features.join('|')).not.toMatch(/API Access/)
    })
})

describe('trial and discount copy', () => {
    it('the trial is 14 days on Starter limits, with no card', () => {
        expect(TRIAL_CONFIG.freeTrial.duration).toBe(14)
        expect(TRIAL_CONFIG.freeTrial.tier).toBe('starter')
        expect(TRIAL_CONFIG.freeTrial.creditCardRequired).toBe(false)
        expect(TRIAL_CONFIG.freeTrial.features).toBe('Starter limits for 14 days')
    })

    it('there is no free-forever tier', () => {
        expect(Object.keys(TRIAL_CONFIG)).toEqual(['freeTrial'])
    })
})

describe('featureLabel', () => {
    it('maps every database feature slug to a label', () => {
        const slugs = Object.keys(FEATURE_LABELS)
        expect(slugs.length).toBeGreaterThan(0)
        for (const slug of slugs) {
            expect(featureLabel(slug)).toBe(FEATURE_LABELS[slug])
            expect(featureLabel(slug)).not.toMatch(/_/)
        }
    })

    it('maps the seed slugs the pricing page showed raw before', () => {
        expect(featureLabel('basic_3d_packing')).toBe('3D bin packing')
        expect(featureLabel('route_planning')).toBe('Route planning')
        expect(featureLabel('shipment_tracking')).toBe('Shipment tracking')
        expect(featureLabel('basic_reports')).toBe('Basic reports')
    })

    it('title-cases unknown slugs and never shows underscores or dashes', () => {
        expect(featureLabel('brand_new_feature')).toBe('Brand New Feature')
        expect(featureLabel('some-thing__odd_')).toBe('Some Thing Odd')
        expect(featureLabel('  padded_slug  ')).toBe('Padded Slug')
        expect(featureLabel('___')).toBe('')
        expect(featureLabel('unknown_xyz')).not.toMatch(/[_-]/)
    })

    it('does not let inherited object keys leak through as labels', () => {
        expect(featureLabel('constructor')).toBe('Constructor')
        expect(featureLabel('toString')).toBe('ToString')
    })

    it('leaves human-written config features unchanged in the lookup chain', () => {
        expect(featureLabel('Email Support')).toBe('Email Support')
    })
})

describe('supportLevelLabel', () => {
    it.each([
        ['email', 'Email support'],
        ['chat', 'Chat support'],
        ['priority', 'Priority support'],
        ['dedicated', 'Dedicated account manager'],
        ['community', 'Community support'],
    ])('%s -> %s', (level, label) => {
        expect(supportLevelLabel(level)).toBe(label)
    })

    it('falls back to a title-cased label for unknown levels', () => {
        expect(supportLevelLabel('night_shift')).toBe('Night Shift')
    })
})
