import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-144-D2 Tariff Versions (Stitch screen 20944736a6414) over agencyTariffApi:
// lane grouping with a pinned clock, Current/Upcoming/Past chips, the inline
// two-decimal refusal before any call, supersedes-on-revise, the overlap and
// agreement_not_active messages, one-toast/one-refetch conflicts and history
// locks.

const h = vi.hoisted(() => ({
    list: vi.fn(),
    listAgreements: vi.fn(),
    publish: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/agencyOrganizationApi', () => ({
    agencyTariffApi: { list: h.list, publish: h.publish },
    agencyClientsApi: { listAgreements: h.listAgreements },
}))

import AgencyTariffsPage from './AgencyTariffsPage'
import { UserFacingError } from '../utils/userFacingError'

// The classification under test pins "today" (2026-11-06) so effective
// windows are stable; only Date is faked so act()/setTimeout keep working.
const TODAY = new Date('2026-11-06T12:00:00')

function tariff(partial: Record<string, unknown>) {
    return {
        id: 'tv-x',
        agreement_id: 'agr-1',
        origin_label: 'Delhi',
        destination_label: 'Jaipur',
        vehicle_type: null,
        rate_basis: 'per_trip',
        rate_amount: 18500,
        currency: 'INR',
        effective_from: '2026-10-01',
        effective_to: null,
        version_no: 1,
        supersedes_version_id: null,
        created_at: '2026-10-01T00:00:00Z',
        ...partial,
    }
}

// Lane "Delhi → Jaipur", any vehicle: v2 current (open-ended), v1 past.
const A_CURRENT = tariff({ id: 'tv-a2', version_no: 2, rate_amount: 18500, effective_from: '2026-10-01' })
const A_PAST = tariff({
    id: 'tv-a1',
    version_no: 1,
    rate_amount: 17000,
    effective_from: '2026-09-01',
    effective_to: '2026-09-30',
})
// Lane "Mumbai → Pune", 32ft_sxl: only an upcoming version.
const B_UPCOMING = tariff({
    id: 'tv-b1',
    origin_label: 'Mumbai',
    destination_label: 'Pune',
    vehicle_type: '32ft_sxl',
    rate_amount: 62000,
    effective_from: '2026-12-01',
})
// Lane "Chennai → Jaipur", 20ft: only a past version.
const C_PAST = tariff({
    id: 'tv-c1',
    origin_label: 'Chennai',
    destination_label: 'Jaipur',
    vehicle_type: '20ft',
    rate_basis: 'per_km',
    rate_amount: 15.5,
    effective_from: '2026-08-01',
    effective_to: '2026-10-31',
})
// Lane "Goa → Hubli", any vehicle: v1 past, v2 current until Nov 30, v3 upcoming.
const E_PAST = tariff({
    id: 'tv-e1',
    origin_label: 'Goa',
    destination_label: 'Hubli',
    version_no: 1,
    rate_amount: 20000,
    effective_from: '2026-08-01',
    effective_to: '2026-09-30',
})
const E_CURRENT = tariff({
    id: 'tv-e2',
    origin_label: 'Goa',
    destination_label: 'Hubli',
    version_no: 2,
    rate_amount: 21000,
    effective_from: '2026-10-01',
    effective_to: '2026-11-30',
})
const E_UPCOMING = tariff({
    id: 'tv-e3',
    origin_label: 'Goa',
    destination_label: 'Hubli',
    version_no: 3,
    rate_amount: 22500,
    effective_from: '2026-12-01',
})

// Shuffled on purpose: lane grouping must not depend on service order.
const ROWS = [E_UPCOMING, A_PAST, B_UPCOMING, E_CURRENT, C_PAST, A_CURRENT, E_PAST]

const AGREEMENT = {
    id: 'agr-1',
    client_name: 'Acme Logistics',
    client_gstin: null,
    payment_terms_days: 30,
    status: 'active',
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
}

const PUBLISHED = { ok: true, state: 'published', tariff: A_CURRENT }

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/agency/clients/agr-1/tariffs'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, {
                        path: '/agency/clients/:agreementId/tariffs',
                        element: createElement(AgencyTariffsPage),
                    })
                )
            )
        )
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
    h.list.mockResolvedValue(ROWS)
    h.listAgreements.mockResolvedValue([AGREEMENT])
})

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
    vi.useRealTimers()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))
const dialogButton = (re: RegExp) =>
    Array.from((q('[role="dialog"]') as HTMLElement).querySelectorAll('button')).find((b) => re.test(b.textContent || ''))

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
    await act(async () => {
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
}

async function fillPublishForm(overrides?: { amount?: string }) {
    await type(q('input[name="tariff-origin"]') as HTMLInputElement, 'Nashik')
    await type(q('input[name="tariff-destination"]') as HTMLInputElement, 'Shirdi')
    await type(q('select[name="tariff-vehicle"]') as HTMLSelectElement, '20ft')
    await type(q('select[name="tariff-basis"]') as HTMLSelectElement, 'per_tonne')
    await type(q('input[name="tariff-amount"]') as HTMLInputElement, overrides?.amount ?? '1250.50')
    await type(q('input[name="tariff-from"]') as HTMLInputElement, '2026-11-15')
}

describe('AgencyTariffsPage', () => {
    it('loading renders a busy status region', async () => {
        h.list.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const loading = q('[data-testid="tariffs-loading"]')
        expect(loading?.getAttribute('role')).toBe('status')
        expect(loading?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the client name and each lane grouped by origin, destination and vehicle', async () => {
        await mountPage()
        expect(text()).toContain('Acme Logistics')
        expect(text()).toContain('Delhi → Jaipur')
        expect(text()).toContain('Any vehicle')
        expect(text()).toContain('Per trip')
        expect(text()).toContain('₹18,500.00 per trip')
        expect(text()).toContain('v2')
        expect(text()).toContain('Effective')
        expect(text()).toContain('onwards')
        // Only lanes whose window covers the pinned today are on the Current chip.
        expect(text()).not.toContain('Mumbai → Pune')
        expect(text()).not.toContain('₹17,000.00')
    })

    it('the current version is the highest version whose window covers today', async () => {
        await mountPage()
        expect(text()).toContain('Goa → Hubli')
        expect(text()).toContain('₹21,000.00')
        // v3 starts in the future and v1 ended in September; neither is current.
        expect(text()).not.toContain('₹22,500.00')
        expect(text()).not.toContain('₹20,000.00')
    })

    it('upcoming versions appear under the Upcoming chip only', async () => {
        await mountPage()
        await click(buttons(/Upcoming/)[0])
        expect(text()).toContain('Mumbai → Pune')
        expect(text()).toContain('32ft_sxl')
        expect(text()).toContain('Starts')
        expect(text()).toContain('Goa → Hubli')
        expect(text()).toContain('₹22,500.00')
        expect(text()).not.toContain('Delhi → Jaipur')
        expect(text()).not.toContain('₹18,500.00')
    })

    it('past versions appear under the Past chip with a Superseded lock and no revise action', async () => {
        await mountPage()
        await click(buttons(/Past/)[0])
        expect(text()).toContain('Superseded')
        expect(text()).toContain('₹17,000.00')
        expect(text()).toContain('₹15.50 per km')
        expect(buttons(/Revise rate/)).toHaveLength(0)
        // current rows are never past rows
        expect(text()).not.toContain('₹18,500.00')
    })

    it('empty state invites the first rate', async () => {
        h.list.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No rates yet. Publish the first rate for this client.')
        expect(q('[data-testid="tariffs-empty"]')).not.toBeNull()
    })

    it('error state offers Retry that refetches', async () => {
        h.list.mockRejectedValueOnce(new UserFacingError('Failed to load rates'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load rates')
        await click(buttons(/Retry/)[0])
        expect(h.list).toHaveBeenCalledTimes(2)
        expect(text()).toContain('₹18,500.00')
    })

    it('denial renders the owner-only message, not a generic error', async () => {
        h.list.mockRejectedValue(new UserFacingError('Agency approval is required.'))
        await mountPage()
        expect(text()).toContain('Only the agency owner can manage rates')
        expect(q('[role="alert"]')).toBeNull()
    })

    it('an inactive agreement shows its message while the rates stay visible', async () => {
        h.listAgreements.mockResolvedValue([{ ...AGREEMENT, status: 'inactive' }])
        await mountPage()
        expect(text()).toContain('This client agreement is inactive. Reactivate it to make changes.')
        expect(text()).toContain('₹18,500.00')
    })

    it('search narrows lanes by lane text', async () => {
        await mountPage()
        await type(q('input[name="tariff-search"]') as HTMLInputElement, 'jaipur')
        expect(text()).toContain('Delhi → Jaipur')
        expect(text()).not.toContain('Mumbai')
        expect(text()).not.toContain('Goa')
    })

    it('the vehicle filter narrows lanes by vehicle code', async () => {
        await mountPage()
        await click(buttons(/Past/)[0])
        await type(q('select[name="tariff-vehicle-filter"]') as HTMLSelectElement, '20ft')
        expect(text()).toContain('Chennai → Jaipur')
        expect(text()).toContain('Superseded')
        expect(text()).not.toContain('Delhi → Jaipur')
        expect(text()).not.toContain('Goa')
    })

    it('amounts with more than two decimals are refused inline before any call', async () => {
        await mountPage()
        await click(buttons(/Publish rate/)[0])
        await fillPublishForm({ amount: '100.123' })
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)
        expect(h.publish).not.toHaveBeenCalled()
        expect(q('[data-testid="tariff-form-error"]')?.textContent).toBe(
            'Rate amount must have at most two decimal places.'
        )
    })

    it('revising sends the lane current head as supersedesVersionId with prefilled fields', async () => {
        h.publish.mockResolvedValue(PUBLISHED)
        await mountPage()
        await click(buttons(/Revise rate/)[0])
        const dialog = q('[role="dialog"]') as HTMLElement
        expect(dialog.textContent).toContain('Delhi → Jaipur')
        await type(q('input[name="tariff-from"]') as HTMLInputElement, '2026-12-01')
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)
        expect(h.publish).toHaveBeenCalledTimes(1)
        expect(h.publish.mock.calls[0][0]).toMatchObject({
            agreementId: 'agr-1',
            origin: 'Delhi',
            destination: 'Jaipur',
            vehicleType: null,
            rateBasis: 'per_trip',
            rateAmount: 18500,
            effectiveFrom: '2026-12-01',
            effectiveTo: null,
            supersedesVersionId: 'tv-a2',
        })
    })

    it('publishing a new lane sends every field with an idempotency key and refetches once', async () => {
        h.publish.mockResolvedValue(PUBLISHED)
        await mountPage()
        await click(buttons(/Publish rate/)[0])
        await fillPublishForm()
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)

        expect(h.publish).toHaveBeenCalledTimes(1)
        const arg = h.publish.mock.calls[0][0]
        expect(arg).toMatchObject({
            agreementId: 'agr-1',
            origin: 'Nashik',
            destination: 'Shirdi',
            vehicleType: '20ft',
            rateBasis: 'per_tonne',
            rateAmount: 1250.5,
            effectiveFrom: '2026-11-15',
            effectiveTo: null,
        })
        expect(typeof arg.idempotencyKey).toBe('string')
        expect(arg.idempotencyKey.length).toBeGreaterThan(8)
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate published')
        expect(h.list).toHaveBeenCalledTimes(2)
        expect(q('[role="dialog"]')).toBeNull()
    })

    it('a tariff overlap surfaces the server message without closing the form', async () => {
        h.publish.mockResolvedValue({
            ok: false,
            error: 'tariff_overlap',
            message: 'A rate already exists for these dates. Revise the current version instead.',
        })
        await mountPage()
        await click(buttons(/Publish rate/)[0])
        await fillPublishForm()
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)
        expect(h.toastError).toHaveBeenCalledWith('A rate already exists for these dates. Revise the current version instead.')
        expect(q('[data-testid="tariff-form-error"]')?.textContent).toContain('A rate already exists for these dates.')
        expect(q('[role="dialog"]')).not.toBeNull()
    })

    it('a version conflict shows one toast and refetches once, with no automatic retry', async () => {
        h.publish.mockResolvedValue({
            ok: false,
            error: 'version_conflict',
            currentVersion: 9,
            message: 'This record changed. Reload to continue.',
        })
        await mountPage()
        const before = h.list.mock.calls.length
        await click(buttons(/Publish rate/)[0])
        await fillPublishForm()
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)
        expect(h.publish).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('This record changed. Reload to continue.')
        expect(h.list.mock.calls.length).toBe(before + 1)
    })

    it('agreement_not_active surfaces its message in the form', async () => {
        h.publish.mockResolvedValue({
            ok: false,
            error: 'agreement_not_active',
            message: 'This client agreement is inactive. Reactivate it to make changes.',
        })
        await mountPage()
        await click(buttons(/Publish rate/)[0])
        await fillPublishForm()
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)
        expect(h.toastError).toHaveBeenCalledWith('This client agreement is inactive. Reactivate it to make changes.')
        expect(q('[data-testid="tariff-form-error"]')?.textContent).toContain('This client agreement is inactive.')
    })

    it('history lists the version timeline with locked styling for superseded versions', async () => {
        await mountPage()
        await click(buttons(/View history/)[0])
        const history = q('[data-testid="tariff-history"]')
        expect(history?.textContent).toContain('v2')
        expect(history?.textContent).toContain('Current')
        expect(history?.textContent).toContain('v1')
        expect(history?.textContent).toContain('Superseded')
        expect(history?.textContent).toContain('₹17,000.00')
        expect(history?.querySelectorAll('svg').length).toBeGreaterThan(0)
    })

    it('a failed submit can be retried with the same idempotency key', async () => {
        h.publish.mockRejectedValueOnce(new UserFacingError('Failed to publish rate'))
        h.publish.mockResolvedValueOnce(PUBLISHED)
        await mountPage()
        await click(buttons(/Publish rate/)[0])
        await fillPublishForm()
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)
        expect(h.toastError).toHaveBeenCalledWith('Failed to publish rate')
        await click(dialogButton(/Publish rate/) as HTMLButtonElement)
        expect(h.publish).toHaveBeenCalledTimes(2)
        const first = h.publish.mock.calls[0][0].idempotencyKey
        expect(h.publish.mock.calls[1][0].idempotencyKey).toBe(first)
        expect(first.length).toBeGreaterThan(8)
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate published')
    })
})
