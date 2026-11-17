import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-151 ERP connections: loading / empty / denied / error states, create with one idempotency
// key per intent, the one-time secret panel (copy, dismiss, never logged or toasted), confirmed
// pause/resume/revoke, rotate, events table with expandable problems and the how-to block.

const h = vi.hoisted(() => ({
    listConnections: vi.fn(),
    listAgreements: vi.fn(),
    listRecentEvents: vi.fn(),
    listEvents: vi.fn(),
    createConnection: vi.fn(),
    setStatus: vi.fn(),
    rotateSecret: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    logError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: h.logError, warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyErpApi', () => ({
    agencyErpApi: {
        listConnections: h.listConnections,
        listAgreements: h.listAgreements,
        listRecentEvents: h.listRecentEvents,
        listEvents: h.listEvents,
        createConnection: h.createConnection,
        setStatus: h.setStatus,
        rotateSecret: h.rotateSecret,
    },
}))

import AgencyErpPage from './AgencyErpPage'
import { UserFacingError } from '../utils/userFacingError'

const SECRET = 'erpk_0123456789abcdef0123456789abcdef'

const conn = (id: string, name: string, status = 'active', version = 1) => ({
    id, agreement_id: 'ag-1', client_id: 'ag-1', name, kind: 'webhook', status, secret_hint: 'cdef', version,
    created_at: '2026-11-10T00:00:00Z',
})
const ev = (id: string, connectionId: string, outcome: string, problems: unknown = null) => ({
    id, connection_id: connectionId, external_event_id: `EXT-${id}`, outcome, problems, batch_id: null,
    received_at: '2026-11-12T10:00:00Z',
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(AgencyErpPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    h.listConnections.mockResolvedValue([])
    h.listAgreements.mockResolvedValue([
        { id: 'ag-1', client_name: 'Acme Steel', status: 'active' },
        { id: 'ag-2', client_name: 'Old Client', status: 'ended' },
    ])
    h.listRecentEvents.mockResolvedValue([])
    h.listEvents.mockResolvedValue([])
})

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const button = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).find(
        (b) => re.test(b.textContent || '') || re.test(b.getAttribute('aria-label') || '')
    ) as HTMLButtonElement | undefined

async function click(b: HTMLButtonElement) {
    await act(async () => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
    await act(async () => {
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
}

async function fillAndSubmit(name = 'Tally feed') {
    await setValue(q('#erp-agreement') as HTMLSelectElement, 'ag-1')
    await setValue(q('#erp-name') as HTMLInputElement, name)
    await click(button(/Create connection/)!)
}

describe('AgencyErpPage', () => {
    it('shows a busy loading state before data arrives', async () => {
        h.listConnections.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="erp-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the denied state for a scope refusal', async () => {
        h.listConnections.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="erp-denied"]')).not.toBeNull()
    })

    it('shows an error alert with a single-refetch Retry', async () => {
        h.listConnections.mockRejectedValueOnce(new UserFacingError('Failed to load connections'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load connections')
        await click(button(/^Retry/)!)
        expect(h.listConnections).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
    })

    it('shows the empty state and only active agreements in the picker', async () => {
        await mountPage()
        expect(q('[data-testid="erp-empty"]')).not.toBeNull()
        const options = Array.from((q('#erp-agreement') as HTMLSelectElement).options).map((o) => o.textContent)
        expect(options).toContain('Acme Steel')
        expect(options).not.toContain('Old Client')
    })

    it('explains when there is no active agreement', async () => {
        h.listAgreements.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="erp-no-agreements"]')).not.toBeNull()
        expect(q('#erp-agreement')).toBeNull()
    })

    it('lists a connection with client, name, kind, status chip, secret hint and last event', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed'), conn('c-2', 'Quiet feed', 'paused')])
        h.listRecentEvents.mockResolvedValue([ev('e-2', 'c-1', 'rejected'), ev('e-1', 'c-1', 'accepted')])
        await mountPage()
        const c1 = q('[data-testid="erp-connection-c-1"]')!.textContent!
        expect(c1).toContain('Tally feed')
        expect(c1).toContain('Acme Steel')
        expect(c1).toContain('Webhook')
        expect(c1).toContain('Active')
        expect(c1).toContain('…cdef')
        expect(q('[data-testid="erp-last-c-1"]')!.textContent).toContain('Rejected')
        expect(q('[data-testid="erp-last-c-2"]')!.textContent).toContain('No events yet')
        expect(q('[data-testid="erp-connection-c-2"]')!.textContent).toContain('Paused')
    })

    it('validates the form before calling the database', async () => {
        await mountPage()
        await click(button(/Create connection/)!)
        expect(q('[role="alert"]')?.textContent).toContain('Choose a client agreement')
        await setValue(q('#erp-agreement') as HTMLSelectElement, 'ag-1')
        await click(button(/Create connection/)!)
        expect(q('[role="alert"]')?.textContent).toContain('Enter a connection name')
        expect(h.createConnection).not.toHaveBeenCalled()
    })

    it('creates a connection and shows the secret once with a warning and copy button', async () => {
        h.createConnection.mockResolvedValue({ ok: true, replay: false, connectionId: 'c-1', secret: SECRET })
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        await mountPage()
        await fillAndSubmit()
        expect(h.createConnection).toHaveBeenCalledWith(
            expect.objectContaining({ agreementId: 'ag-1', name: 'Tally feed', kind: 'webhook' })
        )
        expect(typeof h.createConnection.mock.calls[0][0].idempotencyKey).toBe('string')
        expect(h.listConnections).toHaveBeenCalledTimes(2)
        const panel = q('[data-testid="erp-secret-panel"]')!
        expect(panel.querySelector('[data-testid="erp-secret-value"]')?.textContent).toBe(SECRET)
        expect(panel.textContent).toMatch(/will not be shown again/)
        await click(button(/Copy secret/)!)
        expect(writeText).toHaveBeenCalledWith(SECRET)
    })

    it('removes the secret from the page when dismissed', async () => {
        h.createConnection.mockResolvedValue({ ok: true, replay: false, connectionId: 'c-1', secret: SECRET })
        await mountPage()
        await fillAndSubmit()
        expect(text()).toContain(SECRET)
        await click(button(/I have saved it/)!)
        expect(q('[data-testid="erp-secret-panel"]')).toBeNull()
        expect(text()).not.toContain(SECRET)
        expect((container as HTMLElement).innerHTML).not.toContain(SECRET)
    })

    it('never logs or toasts the secret, and never puts it in the URL', async () => {
        h.createConnection.mockResolvedValue({ ok: true, replay: false, connectionId: 'c-1', secret: SECRET })
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error(SECRET)) }, configurable: true })
        await mountPage()
        await fillAndSubmit()
        await click(button(/Copy secret/)!)
        const seen = JSON.stringify([h.toastError.mock.calls, h.toastSuccess.mock.calls, h.logError.mock.calls])
        expect(seen).not.toContain(SECRET)
        expect(h.toastError).toHaveBeenCalledWith(expect.stringContaining('Could not copy'))
        expect(window.location.href).not.toContain(SECRET)
    })

    it('blocks creating or rotating another secret while one is on screen', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed')])
        h.createConnection.mockResolvedValue({ ok: true, replay: false, connectionId: 'c-2', secret: SECRET })
        await mountPage()
        await fillAndSubmit('Second feed')
        expect(button(/Create connection/)!.disabled).toBe(true)
        expect(button(/Rotate secret for Tally feed/)!.disabled).toBe(true)
    })

    it('explains a replay that has no secret to show', async () => {
        h.createConnection.mockResolvedValue({ ok: true, replay: true, connectionId: 'c-1', secret: null })
        await mountPage()
        await fillAndSubmit()
        expect(q('[data-testid="erp-secret-panel"]')).toBeNull()
        expect(q('[data-testid="erp-create"] [role="alert"]')?.textContent).toContain('shown only once')
    })

    it('reuses the same idempotency key after a failure and starts a new one after completion', async () => {
        h.createConnection
            .mockRejectedValueOnce(new UserFacingError('Failed to create the connection'))
            .mockResolvedValueOnce({ ok: false, error: 'name_exists', message: 'A connection with this name already exists. Choose a different name.' })
            .mockResolvedValueOnce({ ok: true, replay: false, connectionId: 'c-1', secret: SECRET })
        await mountPage()
        await fillAndSubmit()
        expect(h.toastError).toHaveBeenCalledWith('Failed to create the connection')
        await click(button(/Create connection/)!)
        expect(h.createConnection.mock.calls[1][0].idempotencyKey).toBe(h.createConnection.mock.calls[0][0].idempotencyKey)
        expect(q('[data-testid="erp-create"] [role="alert"]')?.textContent).toContain('already exists')
        await click(button(/Create connection/)!)
        expect(h.createConnection.mock.calls[2][0].idempotencyKey).not.toBe(h.createConnection.mock.calls[0][0].idempotencyKey)
    })

    it('asks for confirmation before pausing, then pauses with the expected version', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed', 'active', 4)])
        h.setStatus.mockResolvedValue({ ok: true, status: 'paused', version: 5 })
        await mountPage()
        await click(button(/^Pause Tally feed/)!)
        expect(h.setStatus).not.toHaveBeenCalled()
        expect(q('[data-testid="erp-confirm-c-1"]')).not.toBeNull()
        await click(button(/Pause connection/)!)
        expect(h.setStatus).toHaveBeenCalledWith('c-1', 'paused', 4)
        expect(h.toastSuccess).toHaveBeenCalledWith('Connection paused')
        expect(h.listConnections).toHaveBeenCalledTimes(2)
        expect(q('[data-testid="erp-confirm-c-1"]')).toBeNull()
    })

    it('offers Resume for a paused connection', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed', 'paused', 2)])
        h.setStatus.mockResolvedValue({ ok: true, status: 'active', version: 3 })
        await mountPage()
        await click(button(/^Resume Tally feed/)!)
        await click(button(/Resume connection/)!)
        expect(h.setStatus).toHaveBeenCalledWith('c-1', 'active', 2)
    })

    it('warns that revoke is final, can be cancelled, and then hides every action', async () => {
        h.listConnections.mockResolvedValueOnce([conn('c-1', 'Tally feed', 'active', 1)])
        h.setStatus.mockResolvedValue({ ok: true, status: 'revoked', version: 2 })
        await mountPage()
        await click(button(/^Revoke Tally feed/)!)
        expect(q('[data-testid="erp-confirm-c-1"]')!.textContent).toContain('Revoking is final')
        await click(button(/^Cancel/)!)
        expect(h.setStatus).not.toHaveBeenCalled()
        await click(button(/^Revoke Tally feed/)!)
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed', 'revoked', 2)])
        await click(button(/Revoke permanently/)!)
        expect(h.setStatus).toHaveBeenCalledWith('c-1', 'revoked', 1)
        expect(button(/Rotate secret for/)).toBeUndefined()
        expect(button(/^Resume/)).toBeUndefined()
        expect(q('[data-testid="erp-connection-c-1"]')!.textContent).toContain('cannot be changed or resumed')
    })

    it('shows a typed refusal on the connection', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed')])
        h.setStatus.mockResolvedValue({ ok: false, error: 'version_conflict', message: 'This connection changed. Reload to continue.', currentVersion: 3 })
        await mountPage()
        await click(button(/^Pause Tally feed/)!)
        await click(button(/Pause connection/)!)
        expect(q('[data-testid="erp-connection-c-1"] [role="alert"]')?.textContent).toContain('This connection changed')
    })

    it('rotates the secret after confirmation and shows the new secret once', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed', 'active', 3)])
        h.rotateSecret.mockResolvedValue({ ok: true, secret: SECRET, version: 4 })
        await mountPage()
        await click(button(/Rotate secret for Tally feed/)!)
        expect(h.rotateSecret).not.toHaveBeenCalled()
        expect(q('[data-testid="erp-confirm-c-1"]')!.textContent).toContain('stops working immediately')
        await click(button(/^Rotate secret$/)!)
        expect(h.rotateSecret).toHaveBeenCalledWith('c-1', 3)
        expect(q('[data-testid="erp-secret-value"]')?.textContent).toBe(SECRET)
        await click(button(/I have saved it/)!)
        expect(text()).not.toContain(SECRET)
    })

    it('shows an error and no secret when rotate fails', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed')])
        h.rotateSecret.mockRejectedValue(new UserFacingError('Failed to rotate the secret'))
        await mountPage()
        await click(button(/Rotate secret for Tally feed/)!)
        await click(button(/^Rotate secret$/)!)
        expect(q('[data-testid="erp-connection-c-1"] [role="alert"]')?.textContent).toContain('Failed to rotate the secret')
        expect(q('[data-testid="erp-secret-panel"]')).toBeNull()
    })

    it('shows the events table with outcome chips and expandable problems', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed')])
        h.listEvents.mockResolvedValue([
            ev('e-2', 'c-1', 'rejected', [{ row: 3, message: 'Unknown pincode' }]),
            ev('e-1', 'c-1', 'accepted'),
        ])
        await mountPage()
        await click(button(/Show events for Tally feed/)!)
        expect(h.listEvents).toHaveBeenCalledWith('c-1')
        const table = q('[data-testid="erp-events-c-1"] table')!
        expect(table.textContent).toContain('EXT-e-2')
        expect(table.textContent).toContain('Rejected')
        expect(table.textContent).toContain('Accepted')
        expect(table.textContent).not.toContain('Unknown pincode')
        await click(button(/Show problems for event EXT-e-2/)!)
        expect(table.textContent).toContain('Unknown pincode')
        expect(button(/problems for event EXT-e-1/)).toBeUndefined()
    })

    it('shows empty and error states for events', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed')])
        h.listEvents.mockRejectedValueOnce(new UserFacingError('Failed to load connection events'))
        await mountPage()
        await click(button(/Show events for Tally feed/)!)
        expect(q('[data-testid="erp-events-c-1"] [role="alert"]')?.textContent).toContain('Failed to load connection events')
        await click(q('[data-testid="erp-events-c-1"] button') as HTMLButtonElement)
        expect(q('[data-testid="erp-events-c-1"]')!.textContent).toContain('No events yet')
    })

    it('shows the read-only How to connect block without inventing an endpoint', async () => {
        await mountPage()
        const how = q('[data-testid="erp-how"]')!.textContent!
        expect(how).toContain('How to connect')
        expect(how).toContain('provided by your account manager')
        expect(how).toMatch(/connection id/)
        expect(how).toMatch(/secret/)
        expect(how).not.toMatch(/https?:\/\//)
        expect(q('[data-testid="erp-how"] button, [data-testid="erp-how"] input')).toBeNull()
    })

    it('disables actions while a request is in flight', async () => {
        h.listConnections.mockResolvedValue([conn('c-1', 'Tally feed')])
        let release: (v: unknown) => void = () => {}
        h.setStatus.mockReturnValue(new Promise((r) => { release = r }))
        await mountPage()
        await click(button(/^Pause Tally feed/)!)
        await click(button(/Pause connection/)!)
        expect(text()).toContain('Pausing…')
        expect(button(/Revoke Tally feed/)!.disabled).toBe(true)
        await act(async () => {
            release({ ok: true, status: 'paused', version: 2 })
            await new Promise((r) => setTimeout(r, 0))
        })
    })
})
