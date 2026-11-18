import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Agency Drivers: shared vehicle catalogue labels (never a raw code), a
// client-side search and status filter over the assigned roster, and no record
// id in the employment-card accessible names. The data layer is mocked.

const h = vi.hoisted(() => ({
    getSnapshot: vi.fn(),
    listEmployments: vi.fn(),
    isAgencyDenial: vi.fn(() => false),
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

vi.mock('../services/agencyPortalApi', () => ({
    agencyDriversApi: {
        getSnapshot: h.getSnapshot,
        listEmployments: h.listEmployments,
        endEmployment: vi.fn(),
        assignTruckToDriver: vi.fn(),
        unassignTruck: vi.fn(),
    },
    isAgencyDenial: h.isAgencyDenial,
}))

vi.mock('../hooks/useAgencyAccess', () => ({
    useAgencyAccess: () => ({ hasScope: () => true, deniedTitle: 'Not allowed' }),
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'owner-1' } }),
}))

vi.mock('../components/DriverInvitationsPanel', () => ({ default: () => null }))

vi.mock('../utils/logger', () => ({ logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import AgencyDriversPage from './AgencyDriversPage'

function driver(overrides: Record<string, unknown>) {
    return {
        id: 'drv-x',
        full_name: 'Driver',
        phone: '9000000000',
        vehicle_type: 'eicher_14ft',
        home_city: null,
        rating: null,
        total_trips: 0,
        status: 'active',
        is_online: false,
        active_job_id: null,
        truck_id: null,
        ...overrides,
    }
}

const DRIVERS = [
    driver({ id: 'd1', full_name: 'Ravi Kumar', phone: '9811111111', home_city: 'Mumbai', is_online: true }),
    driver({ id: 'd2', full_name: 'Sunita Devi', phone: '9822222222', home_city: 'Jaipur', is_online: false }),
    driver({ id: 'd3', full_name: 'Amit Shah', phone: '9833333333', home_city: 'Pune', is_online: true, active_job_id: 'job-9', truck_id: 't2' }),
]

const TRUCKS = [
    { id: 't1', vehicle_type: 'volvo_40ft', rc_number: 'KA05EK1111' },
    { id: 't2', vehicle_type: 'tata_ace', rc_number: 'TN01QQ0001' },
    { id: 't3', vehicle_type: 'mystery_code', rc_number: 'GJ01XX0002' },
]

let container: HTMLElement | null = null
let root: Root | null = null

async function mountPage(): Promise<void> {
    container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container as HTMLElement)
        root.render(createElement(MemoryRouter, null, createElement(AgencyDriversPage)))
    })
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (predicate()) return
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
        })
    }
    throw new Error(`Timed out waiting for ${label}`)
}

function queryOne(selector: string): HTMLElement | null {
    return container?.querySelector(selector) as HTMLElement | null
}

function driverNames(): string[] {
    return Array.from(container?.querySelectorAll('p.font-semibold') ?? [])
        .map((p) => p.textContent || '')
        .filter((t) => t.length > 0)
}

function setInput(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    act(() => {
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

function setSelect(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, value)
    act(() => {
        select.dispatchEvent(new Event('change', { bubbles: true }))
    })
}

describe('AgencyDriversPage roster labels, search and status filter', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.getSnapshot.mockResolvedValue({ trucks: TRUCKS, drivers: DRIVERS })
        h.listEmployments.mockResolvedValue([])
    })

    afterEach(() => {
        act(() => { root?.unmount() })
        container?.remove()
        container = null
        root = null
    })

    it('unassigned trucks use the shared catalogue label and never show a raw code', async () => {
        await mountPage()
        await waitFor(() => queryOne('#drivers-search') !== null, 'roster')
        const text = container?.textContent || ''
        expect(text).toContain('Volvo 40ft Container (25T) · KA05EK1111')
        expect(text).toContain('Other truck type · GJ01XX0002')
        expect(text).not.toContain('volvo_40ft')
        expect(text).not.toContain('mystery_code')
    })

    it('search matches name, phone or city and reports when nothing matches', async () => {
        await mountPage()
        await waitFor(() => queryOne('#drivers-search') !== null, 'roster')
        const search = queryOne('#drivers-search') as HTMLInputElement

        setInput(search, 'jaipur')
        expect(driverNames()).toEqual(['Sunita Devi'])

        setInput(search, '9833')
        expect(driverNames()).toEqual(['Amit Shah'])

        setInput(search, 'RAVI')
        expect(driverNames()).toEqual(['Ravi Kumar'])

        setInput(search, 'nobody-here')
        expect(driverNames()).toEqual([])
        expect(queryOne('[data-testid="drivers-no-matches"]')).not.toBeNull()

        setInput(search, '')
        expect(driverNames()).toHaveLength(3)
        expect(queryOne('[data-testid="drivers-no-matches"]')).toBeNull()
    })

    it('the status filter shows online, offline or on-trip drivers only', async () => {
        await mountPage()
        await waitFor(() => queryOne('#drivers-status-filter') !== null, 'status filter')
        const status = queryOne('#drivers-status-filter') as HTMLSelectElement

        setSelect(status, 'online')
        expect(driverNames()).toEqual(['Ravi Kumar', 'Amit Shah'])

        setSelect(status, 'offline')
        expect(driverNames()).toEqual(['Sunita Devi'])

        setSelect(status, 'on_trip')
        expect(driverNames()).toEqual(['Amit Shah'])

        setSelect(status, 'all')
        expect(driverNames()).toHaveLength(3)
    })

    it('an employment card action is named by the licence number, never by a record id', async () => {
        h.listEmployments.mockResolvedValue([
            {
                id: 'emp-uuid-1234567890', status: 'active', version: 1, licence_number: null,
                licence_expiry: null, licence_class: null, contact_phone: null,
            },
        ])
        await mountPage()
        await waitFor(() => queryOne('[data-testid="employment-card"]') !== null, 'employment card')
        const button = container?.querySelector('[data-testid="employment-card"] button') as HTMLButtonElement
        expect(button.getAttribute('aria-label')).toBe('End employment record')
        expect(container?.innerHTML || '').not.toContain('emp-uuid')
    })
})
