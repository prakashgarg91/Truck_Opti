import { act } from 'react'
import { createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pins for the AgencyProfilePage agency profile hub: the render
// states (loading, no-agency snapshot, failed load, complete record, sparse
// record, signed-out owner), the one-snapshot-per-mount call contract, every
// navigation action and the completion-score maths. The page renders nothing
// date-dependent, so no pinned clock is required; every wait is a 0 ms real
// timer (< 50 ms).
//
// FINDING: a rejected getSnapshot renders the same "Agency profile not
// found" panel as a genuine agency-less snapshot — the error toast is the
// only distinguishing signal — and the fetch runs exactly once per mount
// with no Retry affordance. Related observations: the loading spinner
// exposes no role="status"/aria-busy, and the completion score counts the
// session email as agency metadata (a signed-out owner caps at 80%).
// Recorded, not fixed; the tests below pin current behaviour.

const h = vi.hoisted(() => ({
    getSnapshot: vi.fn(),
    toastError: vi.fn(),
    loggerError: vi.fn(),
    user: null as { email: string; phone: string } | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError } }))

vi.mock('../services/agencyPortalApi', () => ({
    agencyDashboardApi: { getSnapshot: h.getSnapshot },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.user }),
}))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: h.loggerError },
}))

import AgencyProfilePage from './AgencyProfilePage'
import type { AgencyPortalProfile, AgencyPortalSummary } from '../services/agencyPortalApi'

const AGENCY: AgencyPortalProfile = {
    id: 'agency-1',
    company_name: 'Sethi Roadlines',
    status: 'approved',
    rating: 4.35,
    total_jobs: 118,
    fleet_size: 12,
    city: 'Jaipur',
    gstin: '08ABCDE1234F1Z5',
}

const SUMMARY: AgencyPortalSummary = {
    active: 7,
    today: 5,
    pending: 3,
    thirtyDayRevenue: 450000,
    thirtyDayJobs: 22,
}

const OWNER = { email: 'owner@sethi.example', phone: '+91 98290 11111' }

let root: Root | null = null
let container: HTMLElement | null = null
let lastPath = ''

function LocationWatcher() {
    const location = useLocation()
    useEffect(() => {
        lastPath = location.pathname
    }, [location.pathname])
    return null
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/agency/profile'] },
                createElement(AgencyProfilePage),
                createElement(LocationWatcher),
            ),
        )
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
    document.title = ''
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))
const metricValues = () =>
    Array.from((container as HTMLElement).querySelectorAll('p.text-xl')).map((p) => p.textContent)
const bigValues = () =>
    Array.from((container as HTMLElement).querySelectorAll('p.text-2xl')).map((p) => p.textContent)

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('AgencyProfilePage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.title = ''
        lastPath = ''
        h.user = OWNER
        h.getSnapshot.mockResolvedValue({ agency: AGENCY, summary: SUMMARY })
    })

    it('loading renders only the spinner and fires exactly one snapshot call', async () => {
        h.getSnapshot.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('.animate-spin')).not.toBeNull()
        expect(q('h1')).toBeNull()
        expect((container as HTMLElement).querySelectorAll('button')).toHaveLength(0)
        expect(h.getSnapshot).toHaveBeenCalledTimes(1)
    })

    it('sets the document title on mount', async () => {
        await mountPage()
        expect(document.title).toBe('Agency Profile - TruckOpti')
    })

    it('happy path renders the agency identity header with a complete record', async () => {
        await mountPage()
        expect(text()).toContain('Agency Profile Hub')
        expect(q('h1')?.textContent).toBe('Sethi Roadlines')
        expect(text()).toContain('Jaipur')
        expect(text()).toContain('08ABCDE1234F1Z5')
        expect(text()).toContain('approved')
        expect(text()).toContain('Record Health')
        expect(text()).toContain('100%')
        expect(h.getSnapshot).toHaveBeenCalledTimes(1)
    })

    it('metric cards show fleet size and the snapshot summary with Indian currency', async () => {
        await mountPage()
        expect(metricValues()).toEqual(['12', '7', '3', '₹4,50,000'])
        expect(text()).toContain('Registered trucks under this agency')
        expect(text()).toContain('Loads currently in motion')
        expect(text()).toContain('Loads awaiting agency response')
        expect(text()).toContain('22 delivered jobs')
    })

    it('operations snapshot repeats today and the 30-day window', async () => {
        await mountPage()
        expect(bigValues()).toEqual(['5', '22 jobs'])
        expect(text()).toContain('Revenue: ₹4,50,000')
        expect(text()).toContain('Loads created today')
        expect(text()).toContain('Last 30 days')
    })

    it('business metadata panel shows company, tax and owner contact details', async () => {
        await mountPage()
        expect(text()).toContain('Business metadata')
        expect(text()).toContain('Owner Contact')
        expect(text()).toContain('City: Jaipur')
        expect(text()).toContain('GSTIN: 08ABCDE1234F1Z5')
        expect(text()).toContain('Status: approved')
        expect(text()).toContain('Email: owner@sethi.example')
        expect(text()).toContain('Phone: +91 98290 11111')
        // 4.35 is stored below the midpoint, so toFixed(1) renders 4.3
        expect(text()).toContain('Rating: 4.3')
        expect(text()).toContain('Total jobs: 118')
    })

    it('a sparse record scores 40% and shows every fallback', async () => {
        h.getSnapshot.mockResolvedValue({
            agency: { ...AGENCY, city: null, gstin: null, fleet_size: null },
            summary: SUMMARY,
        })
        await mountPage()
        expect(text()).toContain('40%')
        expect(text()).toContain('City not added')
        expect(text()).toContain('GSTIN pending')
        expect(text()).toContain('City: Missing')
        expect(text()).toContain('GSTIN: Missing')
        expect(metricValues()).toEqual(['0', '7', '3', '₹4,50,000'])
    })

    it('a missing session user blanks the owner contact but keeps 80% completion', async () => {
        h.user = null
        await mountPage()
        expect(text()).toContain('Email: Missing')
        expect(text()).toContain('Phone: Missing')
        expect(text()).toContain('80%')
    })

    it('a new agency without rating or job history renders New and zero totals', async () => {
        h.getSnapshot.mockResolvedValue({
            agency: { ...AGENCY, rating: null, total_jobs: null },
            summary: SUMMARY,
        })
        await mountPage()
        expect(text()).toContain('Rating: New')
        expect(text()).toContain('Total jobs: 0')
    })

    it('an agency-less snapshot explains the missing record without an error toast', async () => {
        h.getSnapshot.mockResolvedValue({
            agency: null,
            summary: { active: 0, today: 0, pending: 0, thirtyDayRevenue: 0, thirtyDayJobs: 0 },
        })
        await mountPage()
        expect(q('h1')?.textContent).toBe('Agency profile not found')
        expect(text()).toContain('does not have a linked transport agency record yet')
        expect(h.toastError).not.toHaveBeenCalled()
        expect(h.loggerError).not.toHaveBeenCalled()
    })

    it('a failed load toasts once, logs with the page tag and renders the not-found panel', async () => {
        const failure = new Error('edge function unavailable')
        h.getSnapshot.mockRejectedValue(failure)
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load agency profile')
        expect(h.loggerError).toHaveBeenCalledWith('[AgencyProfilePage] loadProfile', failure)
        expect(q('h1')?.textContent).toBe('Agency profile not found')
        expect(buttons(/Retry/)).toHaveLength(0)
        expect(h.getSnapshot).toHaveBeenCalledTimes(1)
    })

    it('the not-found panel returns to the agency dashboard', async () => {
        h.getSnapshot.mockResolvedValue({ agency: null, summary: SUMMARY })
        await mountPage()
        await click(buttons(/Back To Agency Dashboard/)[0])
        expect(lastPath).toBe('/agency/dashboard')
    })

    it('the not-found panel opens company settings', async () => {
        h.getSnapshot.mockResolvedValue({ agency: null, summary: SUMMARY })
        await mountPage()
        await click(buttons(/Open Company Settings/)[0])
        expect(lastPath).toBe('/settings/company')
    })

    it('quick action: Company Settings navigates to /settings/company', async () => {
        await mountPage()
        await click(buttons(/Company Settings/)[0])
        expect(lastPath).toBe('/settings/company')
    })

    it('quick action: Fleet navigates to /agency/fleet', async () => {
        await mountPage()
        await click(buttons(/Fleet/)[0])
        expect(lastPath).toBe('/agency/fleet')
    })

    it('quick action: Billing navigates to /agency/billing', async () => {
        await mountPage()
        await click(buttons(/Billing/)[0])
        expect(lastPath).toBe('/agency/billing')
    })

    it('quick action: Rates navigates to /agency/rates', async () => {
        await mountPage()
        await click(buttons(/Rates/)[0])
        expect(lastPath).toBe('/agency/rates')
    })

    it('Refresh Snapshot returns to the agency dashboard', async () => {
        await mountPage()
        await click(buttons(/Refresh Snapshot/)[0])
        expect(lastPath).toBe('/agency/dashboard')
    })

    it('exposes a single h1 and five uniquely named buttons on the happy path', async () => {
        await mountPage()
        const headings = (container as HTMLElement).querySelectorAll('h1')
        expect(headings).toHaveLength(1)
        expect(headings[0].textContent).toBe('Sethi Roadlines')
        const all = Array.from((container as HTMLElement).querySelectorAll('button'))
        expect(all).toHaveLength(5)
        for (const button of all) {
            expect((button.textContent || '').trim().length).toBeGreaterThan(0)
        }
    })
})
