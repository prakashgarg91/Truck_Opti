import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression suite pinning the CURRENT behaviour of DriverEarningsPage:
// driver resolution, balance snapshot maths, per-period trip list, withdrawal
// dialog and exports. The page uses no router hooks, so it is mounted bare.

// FINDING: the page has no "no driver profile" state. When
// driverTripsApi.getDriverIdByUserId() resolves null (or the auth user is
// missing) neither getDeliveredTrips nor getBalanceSnapshot is ever called,
// `loading` stays true and the user sees the spinner forever with no message.
// The fetch-suppression side is pinned below ("does not fetch..."); the
// endless spinner itself is NOT asserted as correct.
// FINDING: the "Amount (₹)" <label> in the withdrawal dialog has no htmlFor/id
// and the input is not nested inside it, so the label is not programmatically
// associated with the field (screen readers will not announce it). The visible
// label text is pinned below; the missing association is not asserted correct.
// FINDING (cosmetic): the withdrawal amount input className contains "pr4"
// instead of "pr-4", so the intended right padding never applies.

const h = vi.hoisted(() => ({
    useAuthStore: vi.fn(),
    getDriverIdByUserId: vi.fn(),
    getDeliveredTrips: vi.fn(),
    getBalanceSnapshot: vi.fn(),
    requestPayout: vi.fn(),
    downloadCsv: vi.fn(),
    downloadJson: vi.fn(),
    downloadXlsx: vi.fn(),
    loggerError: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/supabaseApi', () => ({
    driverEarningsApi: {
        getBalanceSnapshot: h.getBalanceSnapshot,
        requestPayout: h.requestPayout,
    },
    driverTripsApi: {
        getDriverIdByUserId: h.getDriverIdByUserId,
        getDeliveredTrips: h.getDeliveredTrips,
    },
}))

vi.mock('../stores/authStore', () => ({ useAuthStore: h.useAuthStore }))

vi.mock('../utils/logger', () => ({
    logger: { error: h.loggerError, log: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('../utils/dataExport', () => ({
    downloadCsv: h.downloadCsv,
    downloadJson: h.downloadJson,
    downloadXlsx: h.downloadXlsx,
}))

import DriverEarningsPage from './DriverEarningsPage'
import { formatCurrency } from '../utils/formatters'

// React 18 act() support (this project has no vitest setupFiles doing it).
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Only Date is faked so the page's real promise/settling flow keeps running.
const PINNED_NOW = new Date('2026-11-06T10:30:00.000Z')

// Mirrors of the page's own display formats (en-IN), used to build expectations.
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
const enInDate = (v: string | number | Date) =>
    new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

const NOV5 = '2026-11-05T12:00:00.000Z'
const NOV4 = '2026-11-04T12:00:00.000Z'

const TRIP_A = {
    id: 'trip-aaaa1111',
    delivered_at: NOV5,
    status: 'delivered',
    shipments: { shipment_id: 'SHP-1001', origin: 'Mumbai', destination: 'Pune', estimated_cost: 1500 },
}
const TRIP_B = {
    id: 'trip-bbbb2222',
    delivered_at: NOV5,
    status: 'delivered',
    shipments: { shipment_id: 'SHP-1002', origin: 'Delhi', destination: 'Jaipur', estimated_cost: 2600 },
}
const TRIP_C = {
    id: 'trip-cccc3333',
    delivered_at: NOV4,
    status: 'delivered',
    shipments: { shipment_id: 'SHP-1003', origin: 'Pune', destination: 'Nashik', estimated_cost: 1200 },
}

// paid+approved+pending reserve the balance, the rejected payout must not.
const SNAPSHOT = {
    paid: 4500,
    approved: 1500,
    pending: 500,
    totalDelivered: 9000,
    payouts: [
        { amount: 4500, status: 'paid' },
        { amount: 1500, status: 'approved' },
        { amount: 500, status: 'pending' },
        { amount: 300, status: 'rejected' },
    ],
}

let root: Root | null = null
let container: HTMLElement | null = null

const settle = () => new Promise((r) => setTimeout(r, 0))
async function flush(times = 4) {
    for (let i = 0; i < times; i++) await settle()
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(DriverEarningsPage))
        await flush()
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => {
            root!.unmount()
        })
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

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await flush()
    })
}

async function typeAmount(value: string) {
    const input = q('input[type="number"]') as HTMLInputElement
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('DriverEarningsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(PINNED_NOW)
        h.useAuthStore.mockReturnValue({ user: { id: 'user-1' } })
        h.getDriverIdByUserId.mockResolvedValue('driver-1')
        h.getBalanceSnapshot.mockResolvedValue(SNAPSHOT)
        h.getDeliveredTrips.mockResolvedValue([TRIP_A, TRIP_B, TRIP_C])
        h.requestPayout.mockResolvedValue(undefined)
        h.downloadCsv.mockReturnValue(undefined)
        h.downloadJson.mockReturnValue(undefined)
        h.downloadXlsx.mockResolvedValue(undefined)
    })

    it('resolves the driver from the signed-in user and loads week data and the balance snapshot', async () => {
        await mountPage()
        expect(h.getDriverIdByUserId).toHaveBeenCalledTimes(1)
        expect(h.getDriverIdByUserId).toHaveBeenCalledWith('user-1')
        expect(h.getDeliveredTrips).toHaveBeenCalledTimes(1)
        expect(h.getDeliveredTrips).toHaveBeenCalledWith('driver-1', 'week')
        expect(h.getBalanceSnapshot).toHaveBeenCalledTimes(1)
        expect(h.getBalanceSnapshot).toHaveBeenCalledWith('driver-1')
    })

    it('shows the spinner and hides the wallet while trips are loading', async () => {
        h.getDeliveredTrips.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('.animate-spin')).toBeTruthy()
        expect(text()).not.toContain('Wallet Balance')
        expect(text()).not.toContain('Trips Completed')
        expect(text()).toContain('Earnings')
    })

    it('renders the wallet balance with pending/approved chips and all four summary cards', async () => {
        await mountPage()
        const txt = text()
        expect(txt).toContain('Wallet Balance')
        expect(txt).toContain(inr(2500)) // 9000 delivered − (4500 paid + 1500 approved + 500 pending)
        expect(txt).toContain(`Pending: ${inr(500)}`)
        expect(txt).toContain(`Approved: ${inr(1500)}`)
        expect(txt).toContain(formatCurrency(5300)) // Earnings: 1500 + 2600 + 1200
        expect(txt).toContain(formatCurrency(2000)) // In Process: 1500 + 500
        expect(txt).toContain(formatCurrency(4500)) // Withdrawn
        expect(txt).toContain('Trips Completed')
        const withdraw = buttons(/^Withdraw$/)[0]
        expect(withdraw).toBeTruthy()
        expect(withdraw.disabled).toBe(false)
    })

    it('lists each delivered trip with route, shipment ref, date and earning', async () => {
        await mountPage()
        const txt = text()
        expect(txt).toContain('Mumbai → Pune')
        expect(txt).toContain('#SHP-1001')
        expect(txt).toContain(formatCurrency(1500))
        expect(txt).toContain('Delhi → Jaipur')
        expect(txt).toContain('#SHP-1002')
        expect(txt).toContain(formatCurrency(2600))
        expect(txt).toContain(enInDate(NOV5))
        expect(txt).toContain(enInDate(NOV4))
        expect(txt).toContain('Per-Trip Earnings')
    })

    it('groups the daily summary by day with plural and singular trip counts', async () => {
        await mountPage()
        const txt = text()
        expect(txt).toContain('Daily Summary')
        expect(txt).toContain('2 trips')
        expect(txt).toContain(formatCurrency(4100)) // Nov 5: 1500 + 2600
        expect(txt).toContain('1 trip')
        expect(txt).toContain(formatCurrency(1200)) // Nov 4
    })

    it('does not reserve rejected payouts in the available balance', async () => {
        h.getBalanceSnapshot.mockResolvedValue({
            paid: 5000,
            approved: 0,
            pending: 0,
            totalDelivered: 7000,
            payouts: [
                { amount: 5000, status: 'paid' },
                { amount: 777, status: 'rejected' },
            ],
        })
        await mountPage()
        expect(text()).toContain(inr(2000)) // 7000 − 5000 paid; the rejected 777 is ignored
    })

    it('clamps the available balance at zero and disables Withdraw', async () => {
        h.getBalanceSnapshot.mockResolvedValue({
            paid: 2500,
            approved: 100,
            pending: 0,
            totalDelivered: 1000,
            payouts: [
                { amount: 2500, status: 'paid' },
                { amount: 100, status: 'approved' },
            ],
        })
        await mountPage()
        expect(text()).toContain(inr(0))
        expect(buttons(/^Withdraw$/)[0].disabled).toBe(true)
    })

    it('empty period shows both empty states and blocks export', async () => {
        h.getDeliveredTrips.mockResolvedValue([])
        await mountPage()
        const txt = text()
        expect(txt).toContain('No trip earnings in this period')
        expect(txt).toContain('No trips in this period')
        await click(buttons(/^CSV$/)[0])
        expect(h.toastError).toHaveBeenCalledWith('No trip earnings available to export')
        expect(h.downloadCsv).not.toHaveBeenCalled()
    })

    it('a balance snapshot failure toasts and logs, but trips still render', async () => {
        h.getBalanceSnapshot.mockRejectedValue(new Error('payouts table unavailable'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledWith('Failed to load balance')
        expect(h.loggerError.mock.calls[0]?.[0]).toBe('[DriverEarnings] balance:')
        expect(text()).toContain('Mumbai → Pune')
        expect(text()).toContain(inr(0)) // wallet falls back to zero and Withdraw is disabled
        expect(buttons(/^Withdraw$/)[0].disabled).toBe(true)
    })

    it('an earnings fetch failure toasts, clears the spinner and shows the empty list', async () => {
        h.getDeliveredTrips.mockRejectedValue(new Error('job_offers unavailable'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledWith('Failed to load earnings')
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('No trip earnings in this period')
        expect(text()).toContain(inr(2500)) // balance snapshot still succeeds
    })

    it('switching the period refetches with the new period', async () => {
        await mountPage()
        expect(h.getDeliveredTrips).toHaveBeenCalledTimes(1)
        await click(buttons(/This Month/)[0])
        expect(h.getDeliveredTrips).toHaveBeenLastCalledWith('driver-1', 'month')
        await click(buttons(/All Time/)[0])
        expect(h.getDeliveredTrips).toHaveBeenLastCalledWith('driver-1', 'total')
        expect(h.getDeliveredTrips).toHaveBeenCalledTimes(3)
    })

    it('the withdrawal dialog shows the available amount and closes via its labelled button', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        const txt = text()
        expect(txt).toContain('Request Withdrawal')
        expect(txt).toContain(`Available: ${inr(2500)}`)
        expect(txt).toContain('Amount (₹)')
        expect(txt).toContain('usually settle within 1 to 2 business days')
        const close = q('button[aria-label="Close withdrawal dialog"]') as HTMLButtonElement
        expect(close).toBeTruthy()
        await click(close)
        expect(text()).not.toContain('Request Withdrawal')
    })

    it('submit stays disabled until an amount is entered', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        expect(buttons(/Submit Request/)[0].disabled).toBe(true)
        await typeAmount('500')
        expect(buttons(/Submit Request/)[0].disabled).toBe(false)
    })

    it('a non-positive amount is rejected without calling the payout API', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        await typeAmount('-5')
        await click(buttons(/Submit Request/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Please enter a valid amount')
        expect(h.requestPayout).not.toHaveBeenCalled()
        expect(text()).toContain('Request Withdrawal') // dialog stays open
    })

    it('an amount above the balance is rejected without calling the payout API', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        await typeAmount('3000') // balance is 2500
        await click(buttons(/Submit Request/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Amount exceeds available balance')
        expect(h.requestPayout).not.toHaveBeenCalled()
        expect(text()).toContain('Request Withdrawal')
    })

    it('a successful withdrawal submits the numeric amount, closes the dialog, resets the field and refetches', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        await typeAmount('2000')
        await click(buttons(/Submit Request/)[0])
        expect(h.requestPayout).toHaveBeenCalledTimes(1)
        expect(h.requestPayout).toHaveBeenCalledWith('driver-1', 2000) // number, not string
        expect(h.toastSuccess).toHaveBeenCalledWith('Withdrawal request submitted!')
        expect(text()).not.toContain('Request Withdrawal')
        expect(h.getBalanceSnapshot).toHaveBeenCalledTimes(2) // initial + refresh
        expect(h.getDeliveredTrips).toHaveBeenCalledTimes(2)
        await click(buttons(/^Withdraw$/)[0])
        expect((q('input[type="number"]') as HTMLInputElement).value).toBe('')
    })

    it('the submit button shows Submitting… and is disabled while the payout is in flight', async () => {
        let resolvePayout!: () => void
        h.requestPayout.mockReturnValue(new Promise<void>((res) => { resolvePayout = res }))
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        await typeAmount('1000')
        await click(buttons(/Submit Request/)[0])
        const submitting = buttons(/Submitting/)[0]
        expect(submitting).toBeTruthy()
        expect(submitting.disabled).toBe(true)
        expect(h.requestPayout).toHaveBeenCalledTimes(1)
        await act(async () => {
            resolvePayout()
            await flush()
        })
        expect(h.toastSuccess).toHaveBeenCalledWith('Withdrawal request submitted!')
        expect(text()).not.toContain('Request Withdrawal')
    })

    it('a failed payout toasts, keeps the dialog open and re-enables submit', async () => {
        h.requestPayout.mockRejectedValue(new Error('insert failed'))
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        await typeAmount('1000')
        await click(buttons(/Submit Request/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Failed to submit request')
        expect(text()).toContain('Request Withdrawal')
        const submit = buttons(/Submit Request/)[0]
        expect(submit).toBeTruthy()
        expect(submit.disabled).toBe(false)
    })

    it('CSV export receives the rows, the labelled columns and a dated filename', async () => {
        await mountPage()
        await click(buttons(/^CSV$/)[0])
        expect(h.downloadCsv).toHaveBeenCalledTimes(1)
        const [rows, cols, filename] = h.downloadCsv.mock.calls[0]
        expect(filename).toBe('driver-earnings-week-2026-11-06.csv')
        expect(cols.map((c: { label: string }) => c.label)).toEqual([
            'Trip ID',
            'Shipment Ref',
            'Route',
            'Delivered On',
            'Earning (INR)',
        ])
        expect(rows).toHaveLength(3)
        const first = rows.find((r: { tripId: string }) => r.tripId === 'trip-aaaa1111')
        expect(first).toEqual({
            tripId: 'trip-aaaa1111',
            shipmentRef: 'SHP-1001',
            route: 'Mumbai → Pune',
            deliveredOn: enInDate(NOV5),
            earning: 1500,
        })
        const earningCol = cols.find((c: { label: string }) => c.label === 'Earning (INR)')
        expect(earningCol.value(first)).toBe(1500)
        expect(h.toastSuccess).toHaveBeenCalledWith('CSV export ready')
    })

    it('JSON export receives all trip rows and a dated filename', async () => {
        await mountPage()
        await click(buttons(/^JSON$/)[0])
        expect(h.downloadJson).toHaveBeenCalledTimes(1)
        const [rows, filename] = h.downloadJson.mock.calls[0]
        expect(filename).toBe('driver-earnings-week-2026-11-06.json')
        expect(rows).toHaveLength(3)
        expect(h.toastSuccess).toHaveBeenCalledWith('JSON export ready')
    })

    it('XLSX export receives the Trip Earnings sheet name', async () => {
        await mountPage()
        await click(buttons(/^XLSX$/)[0])
        expect(h.downloadXlsx).toHaveBeenCalledTimes(1)
        const [rows, cols, filename, sheet] = h.downloadXlsx.mock.calls[0]
        expect(filename).toBe('driver-earnings-week-2026-11-06.xlsx')
        expect(sheet).toBe('Trip Earnings')
        expect(cols).toHaveLength(5)
        expect(rows).toHaveLength(3)
        expect(h.toastSuccess).toHaveBeenCalledWith('XLSX export ready')
    })

    it('an export failure logs and toasts instead of throwing', async () => {
        h.downloadXlsx.mockRejectedValue(new Error('disk full'))
        await mountPage()
        await click(buttons(/^XLSX$/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Failed to export trip earnings')
        expect(h.loggerError.mock.calls[0]?.[0]).toBe('[DriverEarnings] export failed:')
    })

    it('uses only the first shipment when the job embeds shipments as an array', async () => {
        h.getDeliveredTrips.mockResolvedValue([
            {
                id: 'trip-arr-0001',
                delivered_at: NOV5,
                status: 'delivered',
                shipments: [
                    { shipment_id: 'SHP-2001', origin: 'Chennai', destination: 'Madurai', estimated_cost: 1500 },
                    { shipment_id: 'SHP-2002', origin: 'Kolkata', destination: 'Kochi', estimated_cost: 9999 },
                ],
            },
        ])
        await mountPage()
        const txt = text()
        expect(txt).toContain('Chennai → Madurai')
        expect(txt).toContain(formatCurrency(1500))
        expect(txt).not.toContain('Kolkata')
        expect(txt).not.toContain(formatCurrency(9999))
    })

    it('a job without shipment data falls back to placeholder route, id-based ref and the current date', async () => {
        h.getDeliveredTrips.mockResolvedValue([
            { id: 'job-no-ship-ABCD1234', delivered_at: null, status: 'delivered' },
        ])
        await mountPage()
        const txt = text()
        expect(txt).toContain('— → —')
        expect(txt).toContain('#ABCD1234') // last 8 chars of the job id, uppercased
        expect(txt).toContain(enInDate(PINNED_NOW.getTime())) // null delivered_at pins to "now"
        expect(txt).toContain(formatCurrency(0))
        expect(txt).toContain('Trips Completed')
    })

    it('does not fetch earnings when the user has no driver profile', async () => {
        h.getDriverIdByUserId.mockResolvedValue(null)
        await mountPage()
        expect(h.getDeliveredTrips).not.toHaveBeenCalled()
        expect(h.getBalanceSnapshot).not.toHaveBeenCalled()
    })
})
