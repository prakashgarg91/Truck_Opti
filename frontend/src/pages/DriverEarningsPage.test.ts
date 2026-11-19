import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression suite pinning the CURRENT behaviour of DriverEarningsPage:
// driver resolution, balance snapshot maths, per-period trip list, withdrawal
// dialog and exports. The page uses no router hooks, so it is mounted bare.

// Re-checked 2026-11-18 against DriverEarningsPage.tsx. Fixed since the
// earlier findings, and pinned below: the "No driver profile yet" state
// (noProfile branch), the withdrawal "Amount (₹)" label linked to its input
// via htmlFor/id, and the "pr-4" padding class on the amount input.
//
// Fixed 2026-11-19 and pinned by the tests in the last describe block:
// - Overlapping period fetches: only the latest request writes the trip list.
// - Zero advances and deductions print "₹0.00", never "-₹0.00".
// - Signed out: a sign-in prompt with a link to /login, never zeroed earnings.

const h = vi.hoisted(() => ({
    useAuthStore: vi.fn(),
    getDriverIdByUserId: vi.fn(),
    getDeliveredTrips: vi.fn(),
    getBalanceSnapshot: vi.fn(),
    requestPayout: vi.fn(),
    listMyLines: vi.fn(),
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

vi.mock('../services/driverPayrollApi', () => ({
    driverPayrollApi: { listMyLines: h.listMyLines },
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
import { formatPaise } from '../lib/rupees'

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
        h.listMyLines.mockResolvedValue([])
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
        expect(text()).not.toContain('Available to withdraw')
        expect(text()).not.toContain('Trips Completed')
        expect(text()).toContain('Earnings')
    })

    it('renders the wallet balance with pending/approved chips and all four summary cards', async () => {
        await mountPage()
        const txt = text()
        expect(txt).toContain('Available to withdraw (estimate)')
        expect(txt).not.toContain('Wallet Balance')
        expect(txt).toContain('Based on customer quotes')
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
        expect(txt).toContain('Delivered trips (customer quote)')
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
        expect(h.loggerError.mock.calls.map((c) => c[0])).toContain('[DriverEarnings] balance:')
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
            'Shipment Ref',
            'Route',
            'Delivered On',
            'Customer quote (INR)',
        ])
        expect(rows).toHaveLength(3)
        const first = rows.find((r: { shipmentRef: string }) => r.shipmentRef === 'SHP-1001')
        expect(first).toEqual({
            shipmentRef: 'SHP-1001',
            route: 'Mumbai → Pune',
            deliveredOn: enInDate(NOV5),
            earning: 1500,
        })
        const earningCol = cols.find((c: { label: string }) => c.label === 'Customer quote (INR)')
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
        expect(cols).toHaveLength(4)
        expect(rows).toHaveLength(3)
        expect(h.toastSuccess).toHaveBeenCalledWith('XLSX export ready')
    })

    it('an export failure logs and toasts instead of throwing', async () => {
        h.downloadXlsx.mockRejectedValue(new Error('disk full'))
        await mountPage()
        await click(buttons(/^XLSX$/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Failed to export trip earnings')
        expect(h.loggerError.mock.calls.map((c) => c[0])).toContain('[DriverEarnings] export failed:')
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

    it('a job without shipment data falls back to the placeholder route, hides the raw id and uses the current date', async () => {
        h.getDeliveredTrips.mockResolvedValue([
            { id: 'job-no-ship-ABCD1234', delivered_at: null, status: 'delivered' },
        ])
        await mountPage()
        const txt = text()
        expect(txt).toContain('— → —')
        expect(txt).not.toContain('ABCD1234') // raw ids are never shown to the driver
        expect(txt).toContain(enInDate(PINNED_NOW.getTime())) // null delivered_at pins to "now"
        expect(txt).toContain(formatCurrency(0))
        expect(txt).toContain('Trips Completed')
    })

    it('does not fetch earnings when the user has no driver profile, and shows an empty state instead of a spinner', async () => {
        h.getDriverIdByUserId.mockResolvedValue(null)
        await mountPage()
        expect(h.getDeliveredTrips).not.toHaveBeenCalled()
        expect(h.getBalanceSnapshot).not.toHaveBeenCalled()
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('No driver profile yet')
    })

    it('a failed driver lookup clears the spinner and shows an error with Retry that recovers', async () => {
        h.getDriverIdByUserId.mockRejectedValueOnce(new Error('network down')).mockResolvedValue('driver-1')
        await mountPage()
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('Could not load your earnings')
        expect(q('[role="alert"]')).toBeTruthy()
        await click(buttons(/^Retry$/)[0])
        expect(h.getDeliveredTrips).toHaveBeenCalledWith('driver-1', 'week')
        expect(text()).toContain('Mumbai → Pune')
        expect(text()).not.toContain('Could not load your earnings')
    })

    it('a failed trip fetch shows a Retry banner while keeping the page usable', async () => {
        h.getDeliveredTrips.mockRejectedValueOnce(new Error('job_offers unavailable')).mockResolvedValue([TRIP_A])
        await mountPage()
        expect(text()).toContain('Could not load your trips')
        await click(buttons(/^Retry$/)[0])
        expect(h.getDeliveredTrips).toHaveBeenCalledTimes(2)
        expect(text()).not.toContain('Could not load your trips')
        expect(text()).toContain('Mumbai → Pune')
    })

    it('period tabs are 44px targets and expose the selected state', async () => {
        await mountPage()
        const week = buttons(/This Week/)[0]
        expect(week.className).toContain('min-h-[44px]')
        expect(week.getAttribute('aria-pressed')).toBe('true')
        expect(buttons(/This Month/)[0].getAttribute('aria-pressed')).toBe('false')
    })

    it('the withdrawal amount label is associated with its input', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        const label = q('label[for="withdraw-amount"]')
        expect(label?.textContent).toContain('Amount')
        expect(q('#withdraw-amount')).toBe(q('input[type="number"]'))
        expect(q('[role="dialog"]')).toBeTruthy()
    })

    describe('My pay (agency payroll statements)', () => {
        const LINE = {
            periodId: 'p1',
            periodStart: '2026-10-01',
            periodEnd: '2026-10-31',
            basePaise: 1500000,
            tripsPaise: 420050,
            advancesPaise: 200000,
            deductionsPaise: 5000,
            netPaise: 1715050,
            shortfallPaise: 0,
            carriedInPaise: 0,
            tripCount: 7,
        }

        it('shows the closed pay lines with net and the breakdown in rupees', async () => {
            h.listMyLines.mockResolvedValue([LINE])
            await mountPage()
            const txt = text()
            expect(txt).toContain('My pay')
            expect(txt).toContain('7 trips')
            expect(txt).toContain('Net ₹17,150.50')
            expect(txt).toContain('₹15,000.00') // base
            expect(txt).toContain('₹4,200.50') // trips
            expect(txt).toContain('-₹2,000.00') // advances
            expect(txt).toContain('-₹50.00') // deductions
        })

        it('shows a calm empty state when no period has been closed', async () => {
            await mountPage()
            expect(text()).toContain('No pay statements yet')
        })

        it('shows an error with Retry when the statements cannot be loaded, and recovers', async () => {
            h.listMyLines.mockRejectedValueOnce(new Error('rpc failed')).mockResolvedValue([LINE])
            await mountPage()
            expect(text()).toContain('Could not load your pay statements')
            await click(buttons(/^Retry$/)[0])
            expect(h.listMyLines).toHaveBeenCalledTimes(2)
            expect(text()).toContain('Net ₹17,150.50')
        })
    })
})

describe('DriverEarningsPage: pay statements, periods and edge states', () => {
    const SHORTFALL_LINE = {
        periodId: 'p2',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        basePaise: 1000000,
        tripsPaise: 0,
        advancesPaise: 0,
        deductionsPaise: 0,
        netPaise: 0,
        shortfallPaise: 120000,
        carriedInPaise: 50000,
        tripCount: 1,
    }
    const PLAIN_LINE = {
        periodId: 'p3',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        basePaise: 100000,
        tripsPaise: 200000,
        advancesPaise: 0,
        deductionsPaise: 0,
        netPaise: 300000,
        shortfallPaise: 0,
        carriedInPaise: 0,
        tripCount: 1,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(PINNED_NOW)
        h.useAuthStore.mockReturnValue({ user: { id: 'user-1' } })
        h.getDriverIdByUserId.mockResolvedValue('driver-1')
        h.getBalanceSnapshot.mockResolvedValue(SNAPSHOT)
        h.getDeliveredTrips.mockResolvedValue([TRIP_A, TRIP_B, TRIP_C])
        h.requestPayout.mockResolvedValue(undefined)
        h.listMyLines.mockResolvedValue([])
    })

    it('shows the carried-in and carried-forward (shortfall) rows when they are non-zero', async () => {
        h.listMyLines.mockResolvedValue([SHORTFALL_LINE])
        await mountPage()
        const txt = text()
        expect(txt).toContain('Carried in')
        expect(txt).toContain(formatPaise(50000)) // ₹500.00
        expect(txt).toContain('Carried forward')
        expect(txt).toContain(formatPaise(120000)) // ₹1,200.00
        expect(txt).toContain('1 trip') // singular label
    })

    it('hides the carried-in and carried-forward rows when they are zero', async () => {
        h.listMyLines.mockResolvedValue([PLAIN_LINE])
        await mountPage()
        expect(text()).not.toContain('Carried in')
        expect(text()).not.toContain('Carried forward')
        expect(text()).toContain('Net ₹3,000.00')
    })

    it('renders several closed statements in the order the server returned them', async () => {
        h.listMyLines.mockResolvedValue([SHORTFALL_LINE, PLAIN_LINE])
        await mountPage()
        const txt = text()
        const sep = txt.indexOf(formatPeriodLabel('2026-09-01'))
        const aug = txt.indexOf(formatPeriodLabel('2026-08-01'))
        expect(sep).toBeGreaterThan(-1)
        expect(aug).toBeGreaterThan(sep)
    })

    it('shows a spinner in My pay while statements are still loading', async () => {
        h.listMyLines.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const status = Array.from(container!.querySelectorAll('[role="status"]'))
        expect(status.some((el) => el.textContent?.includes('Loading pay statements'))).toBe(true)
        expect(text()).not.toContain('No pay statements yet')
    })

    it('a pay statement failure leaves the wallet and trip list intact', async () => {
        h.listMyLines.mockRejectedValue(new Error('rpc failed'))
        await mountPage()
        expect(text()).toContain('Could not load your pay statements')
        expect(text()).toContain('Available to withdraw (estimate)')
        expect(text()).toContain('Mumbai → Pune')
        expect(h.toastError).not.toHaveBeenCalled()
    })

    it('My pay is not shown when the user has no driver profile, but statements are still requested', async () => {
        h.getDriverIdByUserId.mockResolvedValue(null)
        await mountPage()
        expect(h.listMyLines).toHaveBeenCalledTimes(1)
        expect(text()).toContain('No driver profile yet')
        expect(text()).not.toContain('My pay')
    })

    it('the period tabs stay visible and in place while trips are loading', async () => {
        h.getDeliveredTrips.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const tabs = buttons(/This Week|This Month|All Time/)
        expect(tabs).toHaveLength(3)
        expect(tabs.every((b) => b.tagName === 'BUTTON' && b.className.includes('min-h-[44px]'))).toBe(true)
    })

    it('aria-pressed moves to the newly selected period tab', async () => {
        await mountPage()
        await click(buttons(/All Time/)[0])
        expect(buttons(/All Time/)[0].getAttribute('aria-pressed')).toBe('true')
        expect(buttons(/This Week/)[0].getAttribute('aria-pressed')).toBe('false')
        expect(buttons(/This Month/)[0].getAttribute('aria-pressed')).toBe('false')
    })

    it('the withdrawal close button meets the 44px target', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        const close = q('button[aria-label="Close withdrawal dialog"]') as HTMLButtonElement
        expect(close.className).toContain('min-h-[44px]')
        expect(close.className).toContain('min-w-[44px]')
    })

    it('a withdrawal for exactly the available balance is allowed', async () => {
        await mountPage()
        await click(buttons(/^Withdraw$/)[0])
        await typeAmount('2500') // available is 2500
        await click(buttons(/Submit Request/)[0])
        expect(h.toastError).not.toHaveBeenCalledWith('Amount exceeds available balance')
        expect(h.requestPayout).toHaveBeenCalledWith('driver-1', 2500)
    })

    it('the wallet and trip labels say these are estimates and customer quotes, not final pay', async () => {
        await mountPage()
        const txt = text()
        expect(txt).toContain('Available to withdraw (estimate)')
        expect(txt).toContain('Based on customer quotes for your delivered trips')
        expect(txt).toContain('Customer quote total')
        expect(txt).toContain('Delivered trips (customer quote)')
    })

    it('the Daily Summary shows at most ten days while the trip list keeps every trip', async () => {
        const trips = Array.from({ length: 12 }, (_, i) => ({
            id: `trip-day-${i}`,
            delivered_at: `2026-11-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
            status: 'delivered',
            shipments: { shipment_id: `SHP-${3000 + i}`, origin: `Origin ${i}`, destination: `Dest ${i}`, estimated_cost: 100 },
        }))
        h.getDeliveredTrips.mockResolvedValue(trips)
        await mountPage()
        const dayRows = Array.from(container!.querySelectorAll('p')).filter((p) => p.textContent === '1 trip')
        expect(dayRows).toHaveLength(10)
        expect(text()).toContain('Origin 11 → Dest 11') // the last trip is still listed
    })

    it('after switching to This Month, the list shows only that period response', async () => {
        h.getDeliveredTrips.mockImplementation((_id: string, period: string) =>
            Promise.resolve(period === 'month' ? [TRIP_C] : [TRIP_A, TRIP_B, TRIP_C]),
        )
        await mountPage()
        await click(buttons(/This Month/)[0])
        expect(text()).toContain('Pune → Nashik')
        expect(text()).not.toContain('Mumbai → Pune')
        expect(text()).toContain('Trips Completed')
    })
})

describe('DriverEarningsPage: race, zero amounts and signed-out state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(PINNED_NOW)
        h.useAuthStore.mockReturnValue({ user: { id: 'user-1' }, isLoading: false })
        h.getDriverIdByUserId.mockResolvedValue('driver-1')
        h.getBalanceSnapshot.mockResolvedValue(SNAPSHOT)
        h.getDeliveredTrips.mockResolvedValue([TRIP_A, TRIP_B, TRIP_C])
        h.requestPayout.mockResolvedValue(undefined)
        h.listMyLines.mockResolvedValue([])
    })

    it('a slow earlier period response never overwrites the period the driver selected', async () => {
        let resolveWeek!: (rows: unknown[]) => void
        h.getDeliveredTrips
            .mockImplementationOnce(() => new Promise((resolve) => { resolveWeek = resolve }))
            .mockResolvedValue([TRIP_C])
        await mountPage()
        await click(buttons(/All Time/)[0])
        expect(text()).toContain('Pune → Nashik')
        await act(async () => {
            resolveWeek([TRIP_A, TRIP_B])
            await flush()
        })
        expect(text()).toContain('Pune → Nashik')
        expect(text()).not.toContain('Mumbai → Pune')
        expect(buttons(/All Time/)[0].getAttribute('aria-pressed')).toBe('true')
    })

    it('a zero advance or deduction prints as ₹0.00 with no minus sign', async () => {
        h.listMyLines.mockResolvedValue([{
            periodId: 'p4',
            periodStart: '2026-07-01',
            periodEnd: '2026-07-31',
            basePaise: 100000,
            tripsPaise: 200000,
            advancesPaise: 0,
            deductionsPaise: 0,
            netPaise: 300000,
            shortfallPaise: 0,
            carriedInPaise: 0,
            tripCount: 1,
        }])
        await mountPage()
        expect(text()).not.toContain('-₹0.00')
        const amounts = Array.from(container!.querySelectorAll('dd')).map((dd) => dd.textContent)
        expect(amounts.filter((a) => a === '₹0.00')).toHaveLength(2) // advances and deductions
    })

    it('signed out: shows a sign-in prompt with a link to /login and no zeroed earnings', async () => {
        h.useAuthStore.mockReturnValue({ user: null, isLoading: false })
        await mountPage()
        expect(h.getDriverIdByUserId).not.toHaveBeenCalled()
        expect(h.getDeliveredTrips).not.toHaveBeenCalled()
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('Sign in to see your earnings')
        expect((q('a[href="/login"]') as HTMLAnchorElement | null)?.textContent).toContain('Sign in')
        expect(text()).not.toContain('Available to withdraw')
        expect(text()).not.toContain('Trips Completed')
    })

    it('while the session is still resolving, the page keeps its spinner and does not claim signed out', async () => {
        h.useAuthStore.mockReturnValue({ user: null, isLoading: true })
        await mountPage()
        expect(q('.animate-spin')).toBeTruthy()
        expect(text()).not.toContain('Sign in to see your earnings')
        expect(h.getDriverIdByUserId).not.toHaveBeenCalled()
    })
})

function formatPeriodLabel(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
