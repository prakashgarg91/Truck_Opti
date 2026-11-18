import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-147 Trip tracking: loading / empty / denied / error states, active jobs with
// last ping, stale badge, ETA and open incident count; job detail with pings and
// Google Maps links; open / acknowledge / resolve incidents with one key per
// intent and a single refetch.

const h = vi.hoisted(() => ({
    listActiveJobs: vi.fn(),
    listPings: vi.fn(),
    listIncidents: vi.fn(),
    getTripLive: vi.fn(),
    openIncident: vi.fn(),
    updateIncident: vi.fn(),
    jobsList: vi.fn(),
    listDriverDirectory: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyTrackingApi', async () => {
    const actual = await vi.importActual<typeof import('../services/agencyTrackingApi')>('../services/agencyTrackingApi').catch(() => null)
    return {
        INCIDENT_KINDS: actual?.INCIDENT_KINDS ?? ['long_halt', 'overspeed', 'route_deviation', 'breakdown', 'accident', 'other'],
        agencyTrackingApi: {
            listActiveJobs: h.listActiveJobs,
            listPings: h.listPings,
            listIncidents: h.listIncidents,
            getTripLive: h.getTripLive,
            openIncident: h.openIncident,
            updateIncident: h.updateIncident,
        },
    }
})
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../services/agencyPortalApi', () => ({ agencyJobsApi: { list: h.jobsList } }))
vi.mock('../services/agencyPayrollApi', () => ({ agencyPayrollApi: { listDriverDirectory: h.listDriverDirectory } }))

import AgencyTrackingPage from './AgencyTrackingPage'
import { UserFacingError } from '../utils/userFacingError'

const job = (id: string, status = 'in_transit') => ({ id, status, driver_id: 'd-1', notes: null, created_at: '2026-11-10T00:00:00Z' })
const liveOk = (lastIso: string | null, open = 0, speed: number | null = 40) => ({
    ok: true,
    lastPing: lastIso ? { recordedAt: lastIso, lat: 28.6, lng: 77.2, speedKmph: speed } : null,
    pingCount: lastIso ? 5 : 0,
    openIncidents: open,
})
const ping = (id: string, lat = 28.6139, lng = 77.209) => ({ id, job_id: 'j-1111111111', recorded_at: '2026-11-10T10:00:00Z', lat, lng, speed_kmph: 42 })
const incident = (id: string, status: string, version = 1, kind = 'breakdown') => ({
    id, job_id: 'j-1111111111', kind, status, details: { note: 'Tyre burst' }, version,
    resolution_note: status === 'resolved' ? 'Fixed' : null, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z',
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(AgencyTrackingPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

const recent = () => new Date(Date.now() - 5 * 60_000).toISOString()
const old = () => new Date(Date.now() - 3 * 3_600_000).toISOString()

beforeEach(() => {
    vi.clearAllMocks()
    h.listActiveJobs.mockResolvedValue([job('j-1111111111')])
    h.getTripLive.mockResolvedValue(liveOk(recent(), 1))
    h.listPings.mockResolvedValue([ping('p-1')])
    h.listIncidents.mockResolvedValue([])
    h.jobsList.mockResolvedValue([])
    h.listDriverDirectory.mockResolvedValue([])
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

async function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
}

async function submit(form: HTMLFormElement) {
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function openDetail() {
    await click(button(/View details for /)!)
}

describe('AgencyTrackingPage', () => {
    it('shows a busy loading state before data arrives', async () => {
        h.listActiveJobs.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="tracking-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the denied state for a scope refusal on the list', async () => {
        h.listActiveJobs.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="tracking-denied"]')).not.toBeNull()
    })

    it('shows the denied state when the live summary is refused', async () => {
        h.getTripLive.mockRejectedValue(new UserFacingError('Agency approval is required.'))
        await mountPage()
        expect(q('[data-testid="tracking-denied"]')).not.toBeNull()
    })

    it('shows an error alert with a single-refetch Retry', async () => {
        h.listActiveJobs.mockRejectedValueOnce(new UserFacingError('Failed to load active jobs'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load active jobs')
        await click(button(/^Retry/)!)
        expect(h.listActiveJobs).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
    })

    it('shows the empty state when no jobs are active', async () => {
        h.listActiveJobs.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="tracking-empty"]')).not.toBeNull()
    })

    it('shows last ping time, a reporting badge and the open incident count', async () => {
        await mountPage()
        const row = q('[data-testid="tracking-job-j-1111111111"]')!.textContent!
        expect(row).toContain('Last ping')
        expect(row).toContain('Reporting')
        expect(row).not.toContain('Stale ping')
        expect(row).toContain('1 open incident')
        expect(row).toContain('In transit')
    })

    it('flags a stale ping and a job with no location yet', async () => {
        h.listActiveJobs.mockResolvedValue([job('j-1111111111'), job('j-2222222222', 'accepted')])
        h.getTripLive.mockImplementation(async (id: string) => (id === 'j-1111111111' ? liveOk(old(), 0) : liveOk(null, 0)))
        await mountPage()
        const a = q('[data-testid="tracking-job-j-1111111111"]')!.textContent!
        expect(a).toContain('Stale ping')
        expect(a).toContain('0 open incidents')
        const b = q('[data-testid="tracking-job-j-2222222222"]')!.textContent!
        expect(b).toContain('No location received yet')
        expect(b).toContain('No pings')
    })

    it('keeps the list usable when one live summary is unavailable', async () => {
        h.getTripLive.mockResolvedValue({ ok: false, error: 'not_found', message: 'This trip or incident could not be found. Reload to continue.' })
        await mountPage()
        expect(q('[data-testid="tracking-last-j-1111111111"]')?.textContent).toContain('could not be found')
    })

    it('estimates an ETA once a destination is entered', async () => {
        await mountPage()
        expect(q('[data-testid="tracking-eta-j-1111111111"]')?.textContent).toContain('set a destination')
        await openDetail()
        await setValue(q('#dest-lat-j-1111111111') as HTMLInputElement, '19.07')
        await setValue(q('#dest-lng-j-1111111111') as HTMLInputElement, '72.87')
        expect(q('[data-testid="tracking-eta-j-1111111111"]')?.textContent).toMatch(/^ETA /)
        await setValue(q('#dest-lat-j-1111111111') as HTMLInputElement, '999')
        expect(q('[data-testid="tracking-eta-j-1111111111"]')?.textContent).toContain('set a destination')
    })

    it('shows pings with lat/lng and an Open in Google Maps link', async () => {
        await mountPage()
        await openDetail()
        expect(h.listPings).toHaveBeenCalledWith('j-1111111111')
        const detail = q('[data-testid="tracking-detail-j-1111111111"]')!
        expect(detail.textContent).toContain('Lat 28.613900, Lng 77.209000')
        const link = detail.querySelector('a') as HTMLAnchorElement
        expect(link.textContent).toContain('Open in Google Maps')
        expect(link.getAttribute('href')).toBe('https://www.google.com/maps?q=28.6139,77.209')
        expect(link.getAttribute('rel')).toContain('noopener')
        expect(link.getAttribute('target')).toBe('_blank')
    })

    it('shows empty states for no pings and no incidents', async () => {
        h.listPings.mockResolvedValue([])
        await mountPage()
        await openDetail()
        expect(q('[data-testid="tracking-no-pings"]')).not.toBeNull()
        expect(q('[data-testid="tracking-no-incidents"]')).not.toBeNull()
    })

    it('shows a loading state, then an error with retry for the detail', async () => {
        h.listPings.mockRejectedValueOnce(new UserFacingError('Failed to load locations'))
        await mountPage()
        await openDetail()
        expect(q('[data-testid="tracking-detail-j-1111111111"] [role="alert"]')?.textContent).toContain('Failed to load locations')
        await click(button(/Retry details/)!)
        expect(h.listPings).toHaveBeenCalledTimes(2)
        expect(q('[data-testid="tracking-pings"]')).not.toBeNull()

        h.listPings.mockReturnValueOnce(new Promise(() => {}))
        await click(button(/Hide details/)!)
        await openDetail()
        expect(q('[data-testid="tracking-detail-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('opens an incident with one key, refetches once, and reuses the key after a failure', async () => {
        h.openIncident
            .mockRejectedValueOnce(new UserFacingError('Failed to open the incident'))
            .mockResolvedValueOnce({ ok: true, replay: false, incidentId: 'i-1' })
        await mountPage()
        await openDetail()
        const details = q('#incident-details-j-1111111111') as HTMLTextAreaElement
        await setValue(q('#incident-kind-j-1111111111') as HTMLSelectElement, 'accident')
        await setValue(details, 'Truck hit a divider')
        await submit(q('[data-testid="tracking-open-form"]') as HTMLFormElement)
        expect(h.toastError).toHaveBeenCalledWith('Failed to open the incident')
        expect(q('[data-testid="tracking-open-form"] [role="alert"]')?.textContent).toContain('Failed to open the incident')
        expect(h.listActiveJobs).toHaveBeenCalledTimes(1)

        await submit(q('[data-testid="tracking-open-form"]') as HTMLFormElement)
        const [first, second] = h.openIncident.mock.calls.map((c) => c[0])
        expect(second.idempotencyKey).toBe(first.idempotencyKey)
        expect(first).toMatchObject({ jobId: 'j-1111111111', kind: 'accident', details: { note: 'Truck hit a divider' } })
        expect(h.toastSuccess).toHaveBeenCalledWith('Incident opened')
        expect(h.listActiveJobs).toHaveBeenCalledTimes(2)
        expect(h.listIncidents).toHaveBeenCalledTimes(2)
        expect((q('#incident-details-j-1111111111') as HTMLTextAreaElement).value).toBe('')
    })

    it('blocks an open-incident form with too-short details', async () => {
        await mountPage()
        await openDetail()
        await setValue(q('#incident-details-j-1111111111') as HTMLTextAreaElement, 'ab')
        await submit(q('[data-testid="tracking-open-form"]') as HTMLFormElement)
        expect(h.openIncident).not.toHaveBeenCalled()
        expect(q('[data-testid="tracking-open-form"] [role="alert"]')?.textContent).toContain('3 to 500')
    })

    it('shows a typed refusal when opening an incident', async () => {
        h.openIncident.mockResolvedValue({ ok: false, error: 'too_many_open_incidents', message: 'This job already has 50 open incidents. Resolve some before adding more.' })
        await mountPage()
        await openDetail()
        await setValue(q('#incident-details-j-1111111111') as HTMLTextAreaElement, 'Another halt')
        await submit(q('[data-testid="tracking-open-form"]') as HTMLFormElement)
        expect(q('[data-testid="tracking-open-form"] [role="alert"]')?.textContent).toContain('50 open incidents')
    })

    it('offers acknowledge only on open incidents and sends the expected version', async () => {
        h.listIncidents.mockResolvedValue([incident('i-1', 'open', 2), incident('i-2', 'acknowledged', 3), incident('i-3', 'resolved', 4)])
        h.updateIncident.mockResolvedValue({ ok: true, state: 'acknowledged', version: 3 })
        await mountPage()
        await openDetail()
        const i1 = q('[data-testid="incident-i-1"]')!
        const i2 = q('[data-testid="incident-i-2"]')!
        const i3 = q('[data-testid="incident-i-3"]')!
        const labels = (el: Element) => Array.from(el.querySelectorAll('button')).map((b) => b.textContent)
        expect(labels(i1)).toEqual(['Acknowledge', 'Resolve'])
        expect(labels(i2)).toEqual(['Resolve'])
        expect(labels(i3)).toEqual([])
        expect(i3.textContent).toContain('Resolution: Fixed')

        await click(Array.from(i1.querySelectorAll('button')).find((b) => /Acknowledge/.test(b.textContent || ''))!)
        expect(h.updateIncident).toHaveBeenCalledWith({ incidentId: 'i-1', toStatus: 'acknowledged', expectedVersion: 2, note: null })
        expect(h.toastSuccess).toHaveBeenCalledWith('Incident acknowledged')
        expect(h.listActiveJobs).toHaveBeenCalledTimes(2)
        expect(h.listIncidents).toHaveBeenCalledTimes(2)
    })

    it('requires a 3 to 500 character note to resolve, then resolves', async () => {
        h.listIncidents.mockResolvedValue([incident('i-1', 'open', 1)])
        h.updateIncident.mockResolvedValue({ ok: true, state: 'resolved', version: 2 })
        await mountPage()
        await openDetail()
        const card = () => q('[data-testid="incident-i-1"]')!
        await click(Array.from(card().querySelectorAll('button')).find((b) => b.textContent === 'Resolve')!)
        await setValue(q('#resolve-note-i-1') as HTMLTextAreaElement, 'ab')
        await click(button(/Confirm resolved/)!)
        expect(h.updateIncident).not.toHaveBeenCalled()
        expect(card().querySelector('[role="alert"]')?.textContent).toContain('3 to 500')

        await setValue(q('#resolve-note-i-1') as HTMLTextAreaElement, '  Tyre replaced  ')
        await click(button(/Confirm resolved/)!)
        expect(h.updateIncident).toHaveBeenCalledWith({ incidentId: 'i-1', toStatus: 'resolved', expectedVersion: 1, note: 'Tyre replaced' })
        expect(h.toastSuccess).toHaveBeenCalledWith('Incident resolved')
        expect(q('#resolve-note-i-1')).toBeNull()
    })

    it('shows a version conflict on the incident', async () => {
        h.listIncidents.mockResolvedValue([incident('i-1', 'open', 1)])
        h.updateIncident.mockResolvedValue({ ok: false, error: 'version_conflict', message: 'This incident changed. Reload to continue.', currentVersion: 2 })
        await mountPage()
        await openDetail()
        await click(button(/^Acknowledge/)!)
        expect(q('[data-testid="incident-i-1"] [role="alert"]')?.textContent).toContain('This incident changed')
    })

    it('shows a plain message when an update throws', async () => {
        h.listIncidents.mockResolvedValue([incident('i-1', 'open', 1)])
        h.updateIncident.mockRejectedValue(new UserFacingError('Failed to update the incident'))
        await mountPage()
        await openDetail()
        await click(button(/^Acknowledge/)!)
        expect(h.toastError).toHaveBeenCalledWith('Failed to update the incident')
        expect(q('[data-testid="incident-i-1"] [role="alert"]')?.textContent).toContain('Failed to update the incident')
    })

    it('uses 44px targets and a focus ring on the buttons', async () => {
        await mountPage()
        const b = button(/View details for /)!
        expect(b.className).toContain('min-h-[44px]')
        expect(b.className).toContain('focus-visible:ring-2')
        expect(b.getAttribute('aria-expanded')).toBe('false')
    })

    it('names each job by its route and driver instead of an id fragment', async () => {
        h.jobsList.mockResolvedValue([{ id: 'j-1111111111', shipments: { origin: 'Mumbai', destination: 'Pune' } }])
        h.listDriverDirectory.mockResolvedValue([{ driver_id: 'd-1', name: 'Ravi Kumar', phone_last4: '1234' }])
        await mountPage()
        const card = q('[data-testid="tracking-job-j-1111111111"]')!
        expect(card.textContent).toContain('Mumbai → Pune · In transit')
        expect(card.textContent).toContain('Ravi Kumar')
        expect(card.textContent).not.toContain('j-1111')
        expect(button(/View details for Mumbai → Pune/)).not.toBeNull()
    })

    it('falls back to Trip and Driver assigned when the route and directory lookups fail', async () => {
        h.jobsList.mockRejectedValue(new Error('down'))
        h.listDriverDirectory.mockRejectedValue(new Error('down'))
        await mountPage()
        const card = q('[data-testid="tracking-job-j-1111111111"]')!
        expect(card.textContent).toContain('Trip · In transit')
        expect(card.textContent).toContain('Driver assigned')
        expect(card.textContent).not.toContain('j-1111')
    })

    it('refreshes the job list and open details every 15 seconds', async () => {
        vi.useFakeTimers()
        try {
            container = document.createElement('div')
            document.body.appendChild(container)
            root = createRoot(container)
            await act(async () => {
                root!.render(createElement(AgencyTrackingPage))
                await vi.advanceTimersByTimeAsync(0)
            })
            expect(h.listActiveJobs).toHaveBeenCalledTimes(1)
            await act(async () => {
                ;(q('[data-testid="tracking-job-j-1111111111"] button[aria-expanded]') as HTMLButtonElement).click()
                await vi.advanceTimersByTimeAsync(0)
            })
            expect(h.listPings).toHaveBeenCalledTimes(1)
            await act(async () => {
                await vi.advanceTimersByTimeAsync(15000)
            })
            expect(h.listActiveJobs).toHaveBeenCalledTimes(2)
            expect(h.listPings).toHaveBeenCalledTimes(2)
        } finally {
            vi.useRealTimers()
        }
    })
})
