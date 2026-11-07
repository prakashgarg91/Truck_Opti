import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Regression suite for AgencyJobsPage (agency job board: list, filters,
// customer authorizations, offers and status actions).
//
// Pins the CURRENT behaviour of the page against its two service clients:
//   - agencyJobsApi from ../services/agencyPortalApi (Edge-function client):
//     list / updateStatus / assignDriver / getAssignableDrivers /
//     getDriverLatestLocation
//   - agencyJobsApi from ../services/agencySupabaseApi (direct RLS client,
//     TO-143-D1 consent-gated job creation): listAuthorizations / createJob
//
// FINDING (recorded, not fixed, not asserted as correct): if the page ever
// mounts while the auth user is not hydrated (user?.id == null), fetchAgency()
// returns before setLoading(false), so the page stays on the loading spinner
// forever instead of showing a signed-out/empty state. Unreachable through
// App.tsx today because the agency routes sit behind ProtectedRoute; the
// loading test below uses a never-resolving list() instead of pinning this.
//
// FINDING (pinned deliberately): opening "Track Live" fetches the driver
// location twice — once in openTrackModal and once in the polling effect's
// immediate call. The tracking test asserts exactly two calls so anyone
// fixing the double fetch must consciously update the pin.
// ============================================================================

const h = vi.hoisted(() => ({
    // Edge-function client (../services/agencyPortalApi)
    list: vi.fn(),
    updateStatus: vi.fn(),
    assignDriver: vi.fn(),
    getAssignableDrivers: vi.fn(),
    getDriverLatestLocation: vi.fn(),
    // Direct RLS client (../services/agencySupabaseApi)
    listAuthorizations: vi.fn(),
    createJob: vi.fn(),
    // react-hot-toast
    toastPlain: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    authState: { user: { id: 'agency-user-1' } },
}))

vi.mock('react-hot-toast', () => ({
    default: Object.assign(h.toastPlain, { error: h.toastError, success: h.toastSuccess }),
}))

vi.mock('../services/agencyPortalApi', () => ({
    agencyJobsApi: {
        list: h.list,
        updateStatus: h.updateStatus,
        assignDriver: h.assignDriver,
        getAssignableDrivers: h.getAssignableDrivers,
        getDriverLatestLocation: h.getDriverLatestLocation,
    },
}))

vi.mock('../services/agencySupabaseApi', () => ({
    agencyJobsApi: {
        listAuthorizations: h.listAuthorizations,
        createJob: h.createJob,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => h.authState,
}))

// The real wrapper lazy-loads Leaflet/Google map views; replace it so the
// suite never touches a map stack and can assert what the page passes in.
vi.mock('../components/MapViewWrapper', () => ({
    default: (props: { markers?: Array<{ id: string; label?: string }>; center?: number[] }) =>
        createElement(
            'div',
            {
                'data-testid': 'map-view',
                'data-center': (props.center ?? []).join(','),
            },
            (props.markers ?? []).map((m) => `${m.id}:${m.label ?? ''}`).join('|'),
        ),
}))

import AgencyJobsPage from './AgencyJobsPage'

;(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Pinned clock: only Date is faked, so the helpers' setTimeout(0) flush stays
// real and no test ever waits out the page's real 15s polling interval.
const NOW = new Date('2026-11-06T09:15:00Z')
const JOB_AT = '2026-11-05T12:00:00Z'
const AUTH_AT = '2026-11-01T00:00:00Z'
const LOC_AT = '2026-11-06T06:30:00Z'
const AUTH_SHIPMENT_ID = '11111111-2222-3333-4444-555555555555'
const JOB_SHIPMENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

type Row = Record<string, unknown>

// Raw job_offers join the agency-portal-jobs edge function returns from GET.
const row = (over: Row = {}): Row => ({
    id: 'job-1',
    shipment_id: JOB_SHIPMENT_ID,
    status: 'pending',
    fare: 1500,
    driver_id: null,
    created_at: JOB_AT,
    updated_at: JOB_AT,
    shipments: {
        shipment_id: 'SHIP-REF-1',
        origin: 'Mumbai',
        destination: 'Pune',
        total_weight: 1200,
        estimated_cost: 999,
    },
    ...over,
})

const TRUCK_RAVI: Row = {
    id: 'truck-1',
    vehicle_type: 'Open Truck',
    rc_number: 'RC-123',
    driver_id: 'driver-1',
    drivers: { id: 'driver-1', full_name: 'Ravi Kumar', phone: '9876543210', rating: 4.9 },
}
const TRUCK_MEENA: Row = {
    id: 'truck-2',
    vehicle_type: 'Pickup',
    rc_number: 'RC-456',
    driver_id: 'driver-2',
    drivers: { id: 'driver-2', full_name: 'Meena Singh', phone: '9812345678', rating: 0 },
}
const TRUCK_UNSTAFFED: Row = {
    id: 'truck-3',
    vehicle_type: 'Tempo',
    rc_number: 'RC-789',
    driver_id: null,
    drivers: null,
}

const AUTHORIZATION = {
    shipment_id: AUTH_SHIPMENT_ID,
    granted_via: 'agency_id',
    created_at: AUTH_AT,
}

// The page renders dates through fixed en-IN formats; mirror the exact
// options so assertions stay timezone-independent but still pin the format.
const fmtJobStamp = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtAuthStamp = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
const fmtLocClock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
const inr = (n: number) => n.toLocaleString('en-IN')

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(AgencyJobsPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    h.list.mockResolvedValue([])
    h.listAuthorizations.mockResolvedValue([])
    h.updateStatus.mockResolvedValue(undefined)
    h.assignDriver.mockResolvedValue(undefined)
    h.getAssignableDrivers.mockResolvedValue([])
    h.getDriverLatestLocation.mockResolvedValue(null)
    h.createJob.mockResolvedValue({ job: null, alreadyExists: false })
})

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
    document.title = ''
    vi.useRealTimers()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(button: Element) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function type(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

const fareInput = () => q(`input[aria-label="Fare for shipment ${AUTH_SHIPMENT_ID}"]`) as HTMLInputElement

describe('AgencyJobsPage', () => {
    it('renders only the centered spinner while the first job list is pending', async () => {
        h.list.mockReturnValue(new Promise(() => {}))
        h.listAuthorizations.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('h1')).toBeNull()
        expect((container as HTMLElement).querySelectorAll('button')).toHaveLength(0)
        expect(q('svg.animate-spin')).not.toBeNull()
        expect(h.list).toHaveBeenCalledTimes(1)
    })

    it('empty state: zero jobs shown, empty-board copy and empty-authorizations copy', async () => {
        await mountPage()
        expect(text()).toContain('Jobs')
        expect(text()).toContain('0 jobs shown')
        expect(text()).toContain('No jobs found')
        expect(text()).toContain('Jobs will appear here once you start receiving bookings.')
        expect(text()).toContain('No customer authorizations yet')
        // anchored so the Accepted/... status filter tabs do not match
        expect(buttons(/^(Accept|Decline|Assign Driver|Track Live|Confirm Delivery)$/)).toHaveLength(0)
    })

    it('list failure shows one error toast, falls back to the empty board, and offers no Retry button', async () => {
        h.list.mockRejectedValueOnce(new Error('edge function down'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load jobs')
        expect(q('h1')).not.toBeNull()
        expect(text()).toContain('No jobs found')
        expect(buttons(/Retry/)).toHaveLength(0)
    })

    it('authorizations failure renders the role=alert retry copy while jobs still load', async () => {
        h.listAuthorizations.mockRejectedValueOnce(new Error('rls denied'))
        h.list.mockResolvedValue([row()])
        await mountPage()
        const alert = q('[role="alert"]')
        expect(alert?.textContent).toContain('Failed to load authorizations. Refresh the page to retry.')
        expect(text()).not.toContain('No customer authorizations yet')
        expect(text()).toContain('Mumbai')
        expect(h.toastError).not.toHaveBeenCalled()
    })

    it('happy path: maps edge rows into cards for every status, with counts and the page title', async () => {
        h.list.mockResolvedValue([
            row({ id: 'job-p', status: 'pending' }),
            row({ id: 'job-a', status: 'accepted' }),
            row({ id: 'job-t', status: 'in_transit', driver_id: 'driver-1' }),
            row({ id: 'job-d', status: 'delivered' }),
            row({ id: 'job-c', status: 'cancelled' }),
        ])
        await mountPage()
        expect(document.title).toBe('Agency Jobs - TruckOpti')
        expect(text()).toContain('5 jobs shown')
        expect(text()).toContain('#' + JOB_SHIPMENT_ID.slice(-8))
        expect(text()).toContain('Mumbai')
        expect(text()).toContain('Pune')
        expect(text()).toContain('1200 kg')
        expect(text()).toContain('₹' + inr(1500))
        expect(text()).toContain(fmtJobStamp(JOB_AT))
        for (const label of ['Pending', 'Accepted', 'In Transit', 'Delivered', 'Cancelled']) {
            expect(text()).toContain(label)
        }
        // filter tabs carry per-status counts of the unfiltered list (no
        // space between label and count in the rendered text)
        const pendingTab = buttons(/^Pending/)[0]
        expect(pendingTab?.textContent).toBe('Pending(1)')
        expect(buttons(/^Accept$/)).toHaveLength(1)
        expect(buttons(/^Decline$/)).toHaveLength(1)
        expect(buttons(/Assign Driver/)).toHaveLength(1)
        expect(buttons(/Track Live/)).toHaveLength(1)
        expect(buttons(/Confirm Delivery/)).toHaveLength(1)
    })

    it('mapping fallbacks: a row without shipment join shows em-dash route, 0 kg and no fare', async () => {
        h.list.mockResolvedValue([row({ shipments: null, fare: null })])
        await mountPage()
        expect(text()).toContain('#' + JOB_SHIPMENT_ID.slice(-8))
        expect(text()).toContain('—')
        expect(text()).toContain('0 kg')
        expect(text()).not.toContain('₹')
    })

    it('fare falls back to the shipment estimated cost when the job fare is null', async () => {
        h.list.mockResolvedValue([row({ fare: null })])
        await mountPage()
        expect(text()).toContain('₹' + inr(999))
    })

    it('a shipments array join is unwrapped to its first element', async () => {
        h.list.mockResolvedValue([
            row({
                shipments: [{ shipment_id: 'SHIP-ARR', origin: 'Delhi', destination: 'Agra', total_weight: 500, estimated_cost: 50 }],
            }),
        ])
        await mountPage()
        expect(text()).toContain('Delhi')
        expect(text()).toContain('Agra')
        expect(text()).toContain('500 kg')
        expect(text()).not.toContain('Mumbai')
    })

    it('filter tabs narrow the board by status and All restores it', async () => {
        const transitShipments = { shipment_id: 'SHIP-TRANSIT', origin: 'Delhi', destination: 'Jaipur', total_weight: 800, estimated_cost: 800 }
        h.list.mockResolvedValue([
            row({ id: 'job-p', status: 'pending' }),
            row({ id: 'job-t1', status: 'in_transit', driver_id: 'driver-1', shipments: transitShipments }),
            row({ id: 'job-t2', status: 'in_transit', driver_id: 'driver-2', shipments: transitShipments }),
        ])
        await mountPage()
        const transitTab = buttons(/^In Transit/)[0]
        expect(transitTab?.textContent).toBe('In Transit(2)')
        await click(transitTab as HTMLButtonElement)
        expect(text()).toContain('2 jobs shown')
        expect(text()).toContain('Jaipur')
        expect(text()).not.toContain('Mumbai')
        await click(buttons(/^All$/)[0])
        expect(text()).toContain('3 jobs shown')
        expect(text()).toContain('Mumbai')
    })

    it('Accept sends updateStatus(job, accepted), flips the card optimistically and drops the pending actions', async () => {
        h.list.mockResolvedValue([row({ id: 'job-p', status: 'pending' })])
        await mountPage()
        await click(buttons(/^Accept$/)[0])
        expect(h.updateStatus).toHaveBeenCalledTimes(1)
        expect(h.updateStatus).toHaveBeenCalledWith('job-p', 'accepted')
        expect(h.toastSuccess).toHaveBeenCalledWith('Job accepted!')
        expect(buttons(/^Accept$/)).toHaveLength(0)
        expect(buttons(/^Decline$/)).toHaveLength(0)
        expect(buttons(/Assign Driver/)).toHaveLength(1)
    })

    it('Decline sends updateStatus(job, cancelled) and re-labels the card', async () => {
        h.list.mockResolvedValue([row({ id: 'job-p', status: 'pending' })])
        await mountPage()
        await click(buttons(/^Decline$/)[0])
        expect(h.updateStatus).toHaveBeenCalledWith('job-p', 'cancelled')
        expect(h.toastSuccess).toHaveBeenCalledWith('Job declined')
        expect(buttons(/^Accept$/)).toHaveLength(0)
        expect(buttons(/^Decline$/)).toHaveLength(0)
    })

    it('a failed Accept toasts once and leaves the job pending with working actions', async () => {
        h.updateStatus.mockRejectedValueOnce(new Error('edge down'))
        h.list.mockResolvedValue([row({ id: 'job-p', status: 'pending' })])
        await mountPage()
        await click(buttons(/^Accept$/)[0])
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to accept job')
        expect(text()).toContain('Pending')
        expect(buttons(/^Accept$/)).toHaveLength(1)
        const accept = buttons(/^Accept$/)[0] as HTMLButtonElement
        expect(accept.disabled).toBe(false)
    })

    it('Assign Driver opens the modal, lists staffed trucks only, with ratings when present', async () => {
        h.list.mockResolvedValue([row({ id: 'job-a', status: 'accepted' })])
        h.getAssignableDrivers.mockResolvedValue([TRUCK_RAVI, TRUCK_MEENA, TRUCK_UNSTAFFED])
        await mountPage()
        await click(buttons(/Assign Driver/)[0])
        expect(h.getAssignableDrivers).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Ravi Kumar')
        expect(text()).toContain('Open Truck • RC-123')
        expect(text()).toContain('⭐ 4.9')
        expect(text()).toContain('Meena Singh')
        expect(text()).not.toContain('⭐ 0.0')
        expect(text()).not.toContain('Tempo')
        expect(text()).not.toContain('RC-789')
    })

    it('choosing a driver calls assignDriver(job, driver), toasts, closes the modal and refetches once', async () => {
        h.list.mockResolvedValue([row({ id: 'job-a', status: 'accepted' })])
        h.getAssignableDrivers.mockResolvedValue([TRUCK_RAVI])
        await mountPage()
        await click(buttons(/Assign Driver/)[0])
        await click(buttons(/Ravi Kumar/)[0])
        expect(h.assignDriver).toHaveBeenCalledTimes(1)
        expect(h.assignDriver).toHaveBeenCalledWith('job-a', 'driver-1')
        expect(h.toastSuccess).toHaveBeenCalledWith('Driver Ravi Kumar assigned!')
        expect(q('button[aria-label="Close assign driver dialog"]')).toBeNull()
        expect(h.list).toHaveBeenCalledTimes(2)
    })

    it('a failed assignment toasts and keeps the modal open for another try', async () => {
        h.assignDriver.mockRejectedValueOnce(new Error('edge down'))
        h.list.mockResolvedValue([row({ id: 'job-a', status: 'accepted' })])
        h.getAssignableDrivers.mockResolvedValue([TRUCK_RAVI])
        await mountPage()
        await click(buttons(/Assign Driver/)[0])
        await click(buttons(/Ravi Kumar/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Failed to assign driver')
        expect(q('button[aria-label="Close assign driver dialog"]')).not.toBeNull()
        expect(text()).toContain('Ravi Kumar')
    })

    it('a failed assignable-drivers load toasts and shows the no-drivers copy', async () => {
        h.list.mockResolvedValue([row({ id: 'job-a', status: 'accepted' })])
        h.getAssignableDrivers.mockRejectedValueOnce(new Error('edge down'))
        await mountPage()
        await click(buttons(/Assign Driver/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Failed to load drivers')
        expect(text()).toContain('No available drivers. Add drivers to your trucks first.')
    })

    it('an accepted job that already has a driver shows the assigned box instead of the assign action', async () => {
        h.list.mockResolvedValue([row({ id: 'job-a', status: 'accepted', driver_id: 'driver-9' })])
        await mountPage()
        expect(text()).toContain('Assigned: Driver assigned')
        expect(buttons(/Assign Driver/)).toHaveLength(0)
    })

    it('Track Live without a location: driver fallbacks, waiting copy, close aria-label, two initial fetches', async () => {
        h.list.mockResolvedValue([row({ id: 'job-t', status: 'in_transit', driver_id: 'driver-1' })])
        await mountPage()
        await click(buttons(/Track Live/)[0])
        expect(text()).toContain('Live Tracking')
        expect(text()).toContain('Mumbai → Pune')
        expect(text()).toContain('Driver')
        expect(text()).toContain('Phone not available')
        expect(text()).toContain('Waiting for driver location...')
        expect(text()).toContain("Driver hasn't started sharing location yet")
        expect(q('button[aria-label="Close tracking dialog"]')).not.toBeNull()
        expect(q('[data-testid="map-view"]')).toBeNull()
        // openTrackModal fetches once, then the polling effect fetches again
        expect(h.getDriverLatestLocation).toHaveBeenCalledTimes(2)
        expect(h.getDriverLatestLocation).toHaveBeenCalledWith('job-t')
    })

    it('Track Live with coordinates renders the map, the truck marker, the Live badge and the update time', async () => {
        h.list.mockResolvedValue([row({ id: 'job-t', status: 'in_transit', driver_id: 'driver-1' })])
        h.getDriverLatestLocation.mockResolvedValue({ lat: 19.07, lng: 72.87, updated_at: LOC_AT, speed_kmh: 42 })
        await mountPage()
        await click(buttons(/Track Live/)[0])
        const map = q('[data-testid="map-view"]')
        expect(map).not.toBeNull()
        expect(map?.textContent).toContain('driver:🚚')
        expect(map?.getAttribute('data-center')).toBe('19.07,72.87')
        expect(text()).toContain('● Live')
        expect(text()).toContain('Updated: ' + fmtLocClock(LOC_AT))
        expect(text()).not.toContain('Waiting for driver location...')
    })

    it('Confirm Delivery sends updateStatus(job, delivered), toasts and removes the in-transit actions', async () => {
        h.list.mockResolvedValue([row({ id: 'job-t', status: 'in_transit', driver_id: 'driver-1' })])
        await mountPage()
        await click(buttons(/Confirm Delivery/)[0])
        expect(h.updateStatus).toHaveBeenCalledTimes(1)
        expect(h.updateStatus).toHaveBeenCalledWith('job-t', 'delivered')
        expect(h.toastSuccess).toHaveBeenCalledWith('Job marked as delivered')
        expect(buttons(/Track Live/)).toHaveLength(0)
        expect(buttons(/Confirm Delivery/)).toHaveLength(0)
    })

    it('Create Job validates the fare: empty and zero fares toast and never call createJob', async () => {
        h.listAuthorizations.mockResolvedValue([AUTHORIZATION])
        await mountPage()
        expect(text()).toContain(AUTH_SHIPMENT_ID)
        expect(text()).toContain('Authorized ' + fmtAuthStamp(AUTH_AT))
        await click(buttons(/Create Job/)[0])
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid fare')
        await type(fareInput(), '0')
        await click(buttons(/Create Job/)[0])
        expect(h.toastError).toHaveBeenCalledTimes(2)
        expect(h.createJob).not.toHaveBeenCalled()
    })

    it('Create Job success sends (shipment, numeric fare), toasts, refetches and clears the input', async () => {
        h.listAuthorizations.mockResolvedValue([AUTHORIZATION])
        await mountPage()
        await type(fareInput(), '1500')
        await click(buttons(/Create Job/)[0])
        expect(h.createJob).toHaveBeenCalledTimes(1)
        expect(h.createJob).toHaveBeenCalledWith(AUTH_SHIPMENT_ID, 1500)
        expect(h.toastSuccess).toHaveBeenCalledWith('Dispatch job created!')
        expect(h.list).toHaveBeenCalledTimes(2)
        expect(fareInput().value).toBe('')
    })

    it('an already-existing job shows the info toast, skips the success toast and does not refetch', async () => {
        h.createJob.mockResolvedValue({ job: null, alreadyExists: true })
        h.listAuthorizations.mockResolvedValue([AUTHORIZATION])
        await mountPage()
        await type(fareInput(), '1500')
        await click(buttons(/Create Job/)[0])
        expect(h.toastPlain).toHaveBeenCalledTimes(1)
        expect(h.toastPlain).toHaveBeenCalledWith('A job already exists for this shipment.', { icon: 'ℹ️' })
        expect(h.toastSuccess).not.toHaveBeenCalled()
        expect(h.list).toHaveBeenCalledTimes(1)
        expect(fareInput().value).toBe('')
    })

    it('a thrown createJob error surfaces its message and keeps the typed fare', async () => {
        h.createJob.mockRejectedValueOnce(new Error('Agency profile not found'))
        h.listAuthorizations.mockResolvedValue([AUTHORIZATION])
        await mountPage()
        await type(fareInput(), '1500')
        await click(buttons(/Create Job/)[0])
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Agency profile not found')
        expect(fareInput().value).toBe('1500')
    })

    it('accessibility hooks: per-shipment fare input label and labelled dialog close buttons', async () => {
        h.listAuthorizations.mockResolvedValue([AUTHORIZATION])
        h.list.mockResolvedValue([row({ id: 'job-a', status: 'accepted' })])
        h.getAssignableDrivers.mockResolvedValue([TRUCK_RAVI])
        await mountPage()
        expect(fareInput()).not.toBeNull()
        expect(fareInput().getAttribute('type')).toBe('number')
        await click(buttons(/Assign Driver/)[0])
        expect(q('button[aria-label="Close assign driver dialog"]')).not.toBeNull()
    })
})
