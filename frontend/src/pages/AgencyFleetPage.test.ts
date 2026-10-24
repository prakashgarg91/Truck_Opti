import { act } from 'react'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Agency Fleet refresh (2f54d59c → screen cfafbe06, 2026-10-24) on top of the
// TO-144-D1 fleet foundation: the five operational states, the create-vehicle
// form fields, the labelled availability toggle, the single-refetch
// version-conflict toast and the richer document-expiry alert are pinned here
// against the mocked agencyFleetApi (RLS path, not the legacy Edge client).

const h = vi.hoisted(() => ({
    listVehicles: vi.fn(),
    createVehicle: vi.fn(),
    updateVehicle: vi.fn(),
    isAgencyDenial: vi.fn((e: unknown) => !!(e as { isDenial?: boolean })?.isDenial),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
    default: {
        error: h.toastError,
        success: h.toastSuccess,
    },
}))

vi.mock('../services/agencyPortalApi', () => ({
    agencyFleetApi: {
        listVehicles: h.listVehicles,
        createVehicle: h.createVehicle,
        updateVehicle: h.updateVehicle,
    },
    isAgencyDenial: h.isAgencyDenial,
}))

import AgencyFleetPage from './AgencyFleetPage'
import { UserFacingError } from '../utils/userFacingError'

const VEHICLE = {
    id: 'veh-1',
    agency_id: 'agency-1',
    vehicle_type: 'bharatbenz_32ft',
    rc_number: 'MH12AB1234',
    insurance_expiry: '2027-01-15',
    fitness_expiry: '2026-11-05',
    permit_expiry: '2027-03-01',
    puc_expiry: null,
    payload_kg: 15000,
    body_length_m: 32,
    body_width_m: 8,
    body_height_m: 10,
    is_available: true,
    maintenance_blocked: false,
    maintenance_block_reason: null,
    maintenance_blocked_until: null,
    driver_id: null,
    notes: null,
    version: 3,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
}

let container: HTMLElement | null = null
let root: Root | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    const page = createElement(AgencyFleetPage) as ReactElement
    await act(async () => {
        root = createRoot(container as HTMLElement)
        root.render(createElement(MemoryRouter, null, page))
    })
    return container as HTMLElement
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (predicate()) return
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25))
        })
    }
    throw new Error(`timed out waiting for ${label}`)
}

function queryOne(selector: string): Element | null {
    return (container as HTMLElement).querySelector(selector)
}

function findButtons(matcher: RegExp): HTMLButtonElement[] {
    return Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) =>
        matcher.test(b.textContent || '')
    )
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AgencyFleetPage fleet foundation states and wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.listVehicles.mockResolvedValue([VEHICLE])
        h.createVehicle.mockResolvedValue({
            ok: true,
            state: 'created',
            vehicle: { ...VEHICLE, rc_number: 'KA05EK1111' },
            version: 1,
        })
        h.updateVehicle.mockResolvedValue({
            ok: true,
            state: 'updated',
            vehicle: { ...VEHICLE, is_available: false },
            version: 4,
        })
    })

    it('loading renders a busy status region with the fleet-loading hook', async () => {
        h.listVehicles.mockReturnValue(new Promise(() => {}))
        const view = await mountPage()

        const loading = view.querySelector('[data-testid="fleet-loading"]')
        expect(loading).not.toBeNull()
        expect(loading?.getAttribute('role')).toBe('status')
        expect(loading?.getAttribute('aria-busy')).toBe('true')
    })

    it('a loaded vehicle card shows status chip text, RC, payload/body dims, driver line and expiry alert', async () => {
        await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-vehicle-card"]') !== null, 'vehicle card')
        const card = queryOne('[data-testid="fleet-vehicle-card"]') as HTMLElement
        expect(card.textContent || '').toContain('BharatBenz 32ft (15T)')
        expect(card.textContent || '').toContain('RC: MH12AB1234')
        expect(card.textContent || '').toContain('Payload: 15000kg')
        expect(card.textContent || '').toContain('Body: 32×8×10m')
        expect(card.textContent || '').toContain('Available')
        expect(card.textContent || '').toContain('Unassigned')
        // Fitness 2026-11-05 is 12 days out: named alert, not a bare warning.
        expect(card.textContent || '').toContain('Fitness expires in 12 days')
        // All four document chips render with icons (svg) + label.
        for (const label of ['Insurance', 'Fitness', 'Permit', 'PUC']) {
            const chip = Array.from(card.querySelectorAll('div')).find((d) => d.textContent === `${label}` || (d.textContent || '').startsWith(label))
            expect(chip).toBeDefined()
            expect(chip?.querySelector('svg')).not.toBeNull()
        }
        const toggle = card.querySelector('button[aria-label="Mark BharatBenz 32ft (15T) (MH12AB1234) unavailable"]')
        expect(toggle).not.toBeNull()
    })

    it('an empty fleet renders the empty state', async () => {
        h.listVehicles.mockResolvedValue([])
        const view = await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-empty"]') !== null, 'empty state')
        expect(view.textContent || '').toContain('No vehicles added yet. Add your first truck to get started.')
    })

    it('a load failure renders the error alert and Retry refetches once', async () => {
        h.listVehicles.mockRejectedValueOnce(new Error('network down'))
        await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-error"]') !== null, 'error state')
        const error = queryOne('[data-testid="fleet-error"]') as HTMLElement
        expect(error.getAttribute('role')).toBe('alert')
        expect(error.textContent || '').toContain("We couldn't load your fleet.")

        h.listVehicles.mockResolvedValue([VEHICLE])
        const retry = findButtons(/Retry/)[0]
        await clickButton(retry)

        await waitFor(() => queryOne('[data-testid="fleet-vehicle-card"]') !== null, 'fleet after retry')
        expect(h.listVehicles).toHaveBeenCalledTimes(2)
    })

    it('a controlled agency denial renders the denied alert with the bounded message', async () => {
        // isAgencyDenial recognises the service's denial marker; the bounded
        // UserFacingError message is what the banner shows.
        h.listVehicles.mockRejectedValueOnce(
            Object.assign(new UserFacingError('Agency approval required.'), { isDenial: true })
        )
        await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-denied"]') !== null, 'denied state')
        const denied = queryOne('[data-testid="fleet-denied"]') as HTMLElement
        expect(denied.getAttribute('role')).toBe('alert')
        expect(denied.textContent || '').toContain('Agency approval required.')
    })

    it('the create form exposes all six labeled fields and submits through createVehicle', async () => {
        const view = await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-vehicle-card"]') !== null, 'fleet loaded')
        await clickButton(findButtons(/Add Truck/)[0])

        await waitFor(() => queryOne('#fleet-rc-number') !== null, 'create form open')
        for (const id of ['fleet-vehicle-type', 'fleet-rc-number', 'fleet-insurance', 'fleet-fitness', 'fleet-permit', 'fleet-puc']) {
            const field = queryOne(`#${id}`)
            expect(field, `field #${id}`).not.toBeNull()
            const label = view.querySelector(`label[for="${id}"]`)
            expect(label, `label for #${id}`).not.toBeNull()
        }

        await act(async () => {
            setInputValue(queryOne('#fleet-rc-number') as HTMLInputElement, 'KA05EK1111')
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        // The submit button is the second "Add Truck" (the first opens the form).
        await clickButton(findButtons(/Add Truck/)[1])

        await waitFor(() => h.createVehicle.mock.calls.length === 1, 'createVehicle called')
        expect(h.createVehicle.mock.calls[0][0]).toMatchObject({ rc_number: 'KA05EK1111', vehicle_type: 'eicher_14ft' })
        await waitFor(() => h.toastSuccess.mock.calls.some((c) => c[0] === 'Truck added to fleet'), 'success toast')
        await waitFor(() => queryOne('#fleet-rc-number') === null, 'form closed after save')
        expect(h.listVehicles).toHaveBeenCalledTimes(2)
    })

    it('an idempotent create replay surfaces the already-in-fleet copy', async () => {
        h.createVehicle.mockResolvedValue({ ok: true, state: 'idempotent_replay', vehicle: VEHICLE, version: 3 })
        await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-vehicle-card"]') !== null, 'fleet loaded')
        await clickButton(findButtons(/Add Truck/)[0])
        await waitFor(() => queryOne('#fleet-rc-number') !== null, 'create form open')
        await act(async () => {
            setInputValue(queryOne('#fleet-rc-number') as HTMLInputElement, 'MH12AB1234')
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        await clickButton(findButtons(/Add Truck/)[1])

        await waitFor(() => h.toastSuccess.mock.calls.some((c) => c[0] === 'This vehicle is already in your fleet'), 'replay copy')
    })

    it('the availability toggle runs the versioned RPC and toasts with the RC', async () => {
        await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-vehicle-card"]') !== null, 'fleet loaded')
        const toggle = queryOne('button[aria-label="Mark BharatBenz 32ft (15T) (MH12AB1234) unavailable"]') as HTMLButtonElement
        await clickButton(toggle)

        await waitFor(() => h.updateVehicle.mock.calls.length === 1, 'updateVehicle called')
        expect(h.updateVehicle.mock.calls[0]).toEqual(['veh-1', 3, { is_available: false }])
        await waitFor(
            () => h.toastSuccess.mock.calls.some((c) => c[0] === 'Vehicle MH12AB1234 marked unavailable'),
            'rc-named success toast'
        )
        // Single refetch after the command.
        expect(h.listVehicles).toHaveBeenCalledTimes(2)
    })

    it('a version conflict toasts the single-refetch message without retrying the command', async () => {
        h.updateVehicle.mockResolvedValue({ ok: false, error: 'version_conflict', currentVersion: 4 })
        await mountPage()

        await waitFor(() => queryOne('[data-testid="fleet-vehicle-card"]') !== null, 'fleet loaded')
        const toggle = queryOne('button[aria-label="Mark BharatBenz 32ft (15T) (MH12AB1234) unavailable"]') as HTMLButtonElement
        await clickButton(toggle)

        await waitFor(
            () => h.toastError.mock.calls.some((c) => c[0] === 'This vehicle was updated elsewhere. Showing the latest version.'),
            'conflict toast'
        )
        expect(h.updateVehicle).toHaveBeenCalledTimes(1)
        // Exactly one refetch — never an auto-retry loop (TO-144-D1 contract).
        expect(h.listVehicles).toHaveBeenCalledTimes(2)
    })
})
