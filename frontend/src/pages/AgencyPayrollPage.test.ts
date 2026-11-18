import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-150 Driver payroll: loading / empty / denied / error states, rate table and
// expected-version edit, open period, adjustments (reason 3-200), close with a
// final confirm step, closed lines table and the CSV guard.

const h = vi.hoisted(() => ({
    listRates: vi.fn(),
    listEmployedDrivers: vi.fn(),
    listDriverDirectory: vi.fn(),
    listPeriods: vi.fn(),
    listLines: vi.fn(),
    listAdjustments: vi.fn(),
    setRate: vi.fn(),
    openPeriod: vi.fn(),
    closePeriod: vi.fn(),
    adjust: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyPayrollApi', () => ({
    agencyPayrollApi: {
        listRates: h.listRates,
        listEmployedDrivers: h.listEmployedDrivers,
        listDriverDirectory: h.listDriverDirectory,
        listPeriods: h.listPeriods,
        listLines: h.listLines,
        listAdjustments: h.listAdjustments,
        setRate: h.setRate,
        openPeriod: h.openPeriod,
        closePeriod: h.closePeriod,
        adjust: h.adjust,
    },
}))

import AgencyPayrollPage from './AgencyPayrollPage'
import { buildPayrollCsv, csvCell, paiseToPlain } from '../lib/payrollCsv'
import { UserFacingError } from '../utils/userFacingError'
import { withGate, gateFor, sbError, SB002_ERROR } from '../components/billing/testGate'
import type { BillingGate } from '../components/billing/BillingGate'

const D1 = 'aaaaaaaa-1111-1111-1111-111111111111'
const RATE = { driver_id: D1, base_paise: 1500000, per_km_paise: 1250, per_tonne_paise: 40000, version: 2, updated_at: '2026-10-01T00:00:00Z' }
const DRIVER = { driver_id: D1, status: 'active', contact_phone: null }
const OPEN = { id: 'p-open', period_start: '2026-10-01', period_end: '2026-10-31', status: 'open', closed_at: null, version: 1, created_at: '2026-11-01T00:00:00Z' }
const CLOSED = { id: 'p-closed', period_start: '2026-09-01', period_end: '2026-09-30', status: 'closed', closed_at: '2026-10-02T00:00:00Z', version: 2, created_at: '2026-10-01T00:00:00Z' }
const LINE = {
    id: 'l-1', period_id: 'p-closed', driver_id: D1, base_paise: 1500000, trips_paise: 250050, advances_paise: 200000,
    deductions_paise: 50000, net_paise: 1500050, shortfall_paise: 0, carried_in_paise: 0, trip_count: 3,
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(gate?: BillingGate): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(gate ? withGate(createElement(AgencyPayrollPage), gate) : createElement(AgencyPayrollPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    h.listRates.mockResolvedValue([RATE])
    h.listEmployedDrivers.mockResolvedValue([DRIVER])
    h.listDriverDirectory.mockResolvedValue([])
    h.listPeriods.mockResolvedValue([OPEN, CLOSED])
    h.listLines.mockResolvedValue([LINE])
    h.listAdjustments.mockResolvedValue([])
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
    Array.from((container as HTMLElement).querySelectorAll('button')).find((b) => re.test(b.textContent || '') || re.test(b.getAttribute('aria-label') || '')) as HTMLButtonElement | undefined

async function click(b: HTMLButtonElement) {
    await act(async () => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}
async function setValue(el: Element, value: string) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}
async function submit(form: Element) {
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('AgencyPayrollPage', () => {
    it('shows a busy loading state', async () => {
        h.listRates.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="payroll-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows empty states when there are no drivers or periods', async () => {
        h.listRates.mockResolvedValue([])
        h.listEmployedDrivers.mockResolvedValue([])
        h.listPeriods.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="rates-empty"]')).not.toBeNull()
        expect(q('[data-testid="periods-empty"]')).not.toBeNull()
    })

    it('shows the denied state for a scope refusal', async () => {
        h.listRates.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="payroll-denied"]')).not.toBeNull()
    })

    it('shows an error with retry', async () => {
        h.listRates.mockRejectedValueOnce(new UserFacingError('Failed to load driver rates'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load driver rates')
        await click(button(/^Retry/)!)
        expect(q(`[data-testid="rate-row-${D1}"]`)).not.toBeNull()
    })

    it('lists the rate table in rupees', async () => {
        await mountPage()
        const row = q(`[data-testid="rate-row-${D1}"]`)!.textContent!
        expect(row).toContain('₹15,000.00')
        expect(row).toContain('₹12.50')
        expect(row).toContain('₹400.00')
    })

    it('saves an edited rate in exact paise with the expected version', async () => {
        h.setRate.mockResolvedValue({ ok: true, version: 3 })
        await mountPage()
        await click(button(/Edit rate for/)!)
        await setValue(q('#rate-base')!, '16,000.05')
        await setValue(q('#rate-km')!, '12.5')
        await setValue(q('#rate-tonne')!, '400')
        await submit(q('[data-testid="rate-form"]')!)
        expect(h.setRate).toHaveBeenCalledWith({ driverId: D1, basePaise: 1600005, perKmPaise: 1250, perTonnePaise: 40000, expectedVersion: 2 })
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate saved')
        expect(h.listRates).toHaveBeenCalledTimes(2)
    })

    it('blocks a bad rate and shows a version conflict refusal', async () => {
        await mountPage()
        await click(button(/Edit rate for/)!)
        await setValue(q('#rate-km')!, '12.345')
        expect((q('[data-testid="rate-form"] button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
        await submit(q('[data-testid="rate-form"]')!)
        expect(h.setRate).not.toHaveBeenCalled()

        await setValue(q('#rate-km')!, '12.5')
        h.setRate.mockResolvedValue({ ok: false, error: 'version_conflict', message: 'This rate changed since you opened it. Reload to continue.', currentVersion: 4 })
        await submit(q('[data-testid="rate-form"]')!)
        expect(q('[data-testid="rate-refused"]')?.textContent).toContain('changed since you opened it')
    })

    it('opens a period with one key per intent', async () => {
        h.openPeriod.mockResolvedValue({ ok: false, error: 'period_overlap', message: 'These dates overlap another payroll period.' })
        await mountPage()
        await setValue(q('#period-start')!, '2026-11-01')
        await setValue(q('#period-end')!, '2026-11-15')
        await submit(q('[data-testid="open-period-form"]')!)
        await submit(q('[data-testid="open-period-form"]')!)
        expect(h.openPeriod).toHaveBeenCalledTimes(2)
        const [a, b] = h.openPeriod.mock.calls.map((c) => c[0])
        expect(a).toMatchObject({ periodStart: '2026-11-01', periodEnd: '2026-11-15' })
        expect(a.idempotencyKey).toBe(b.idempotencyKey)
        expect(q('[data-testid="open-refused"]')?.textContent).toContain('overlap')
    })

    it('does not open a period with the end before the start', async () => {
        await mountPage()
        await setValue(q('#period-start')!, '2026-11-15')
        await setValue(q('#period-end')!, '2026-11-01')
        await submit(q('[data-testid="open-period-form"]')!)
        expect(h.openPeriod).not.toHaveBeenCalled()
        expect(text()).toContain('cannot be before the first day')
    })

    it('records an advance and enforces a 3 to 200 character reason', async () => {
        h.adjust.mockResolvedValue({ ok: true, adjustmentId: 'a-1' })
        await mountPage()
        await click(button(/Open period 2026-10-01/)!)
        await setValue(q('#adj-driver')!, D1)
        await setValue(q('#adj-amount')!, '2,000.50')
        await setValue(q('#adj-reason')!, 'ab')
        await submit(q('[data-testid="adjust-form"]')!)
        expect(h.adjust).not.toHaveBeenCalled()
        expect(q('[data-testid="adjust-hint"]')?.textContent).toContain('3 to 200')

        await setValue(q('#adj-reason')!, 'x'.repeat(201))
        await submit(q('[data-testid="adjust-form"]')!)
        expect(h.adjust).not.toHaveBeenCalled()

        await setValue(q('#adj-reason')!, '  Diesel advance  ')
        await submit(q('[data-testid="adjust-form"]')!)
        expect(h.adjust).toHaveBeenCalledWith({ periodId: 'p-open', driverId: D1, kind: 'advance', amountPaise: 200050, reason: 'Diesel advance' })
    })

    it('needs a confirm step that says closing is final before closing', async () => {
        h.closePeriod.mockResolvedValue({ ok: true, periodId: 'p-open', replay: false, version: 2, lines: 1 })
        await mountPage()
        await click(button(/Open period 2026-10-01/)!)
        await click(button(/^Close period$/)!)
        expect(h.closePeriod).not.toHaveBeenCalled()
        expect(q('[data-testid="close-confirm"]')?.textContent).toContain('Closing is final')
        await click(button(/Confirm close period/)!)
        expect(h.closePeriod).toHaveBeenCalledTimes(1)
        expect(h.closePeriod.mock.calls[0][0]).toMatchObject({ periodStart: '2026-10-01', periodEnd: '2026-10-31' })
        expect(h.toastSuccess).toHaveBeenCalledWith('Period closed')
    })

    it('shows a close refusal from the server', async () => {
        h.closePeriod.mockResolvedValue({ ok: false, error: 'period_not_finished', message: 'A period can only be closed after its last day has passed.' })
        await mountPage()
        await click(button(/Open period 2026-10-01/)!)
        await click(button(/^Close period$/)!)
        await click(button(/Confirm close period/)!)
        expect(q('[data-testid="close-refused"]')?.textContent).toContain('last day has passed')
        expect(q('[data-testid="close-confirm"]')).toBeNull()
    })

    it('shows the closed lines table with earnings, net and totals', async () => {
        await mountPage()
        await click(button(/Open period 2026-09-01/)!)
        expect(h.listLines).toHaveBeenCalledWith('p-closed')
        const row = q(`[data-testid="line-row-${D1}"]`)!.textContent!
        expect(row).toContain('₹17,500.50')
        expect(row).toContain('₹2,000.00')
        expect(row).toContain('₹15,000.50')
        expect(q('[data-testid="total-net"]')?.textContent).toBe('₹15,000.50')
        expect(button(/Download CSV/)).toBeDefined()
        expect(q('[data-testid="close-section"]')).toBeNull()
    })
})

describe('payroll csv', () => {
    it('prefixes formula-looking cells with a single quote', () => {
        expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
        expect(csvCell('+91 98')).toBe("'+91 98")
        expect(csvCell('-5')).toBe("'-5")
        expect(csvCell('@cmd')).toBe("'@cmd")
        expect(csvCell('plain')).toBe('plain')
    })

    it('quotes commas, quotes and newlines', () => {
        expect(csvCell('a,b')).toBe('"a,b"')
        expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    })

    it('formats paise exactly', () => {
        expect(paiseToPlain(1999)).toBe('19.99')
        expect(paiseToPlain(5)).toBe('0.05')
        expect(paiseToPlain(1500050)).toBe('15000.50')
    })

    it('builds rows with guarded driver labels', () => {
        const csv = buildPayrollCsv([
            { driverLabel: '=HYPERLINK("x")', tripCount: 2, basePaise: 100, tripsPaise: 250, advancesPaise: 0, deductionsPaise: 0, carriedInPaise: 0, netPaise: 350, shortfallPaise: 0 },
        ])
        const [header, row] = csv.split('\r\n')
        expect(header.startsWith('Driver,Trips')).toBe(true)
        expect(row).toBe('"\'=HYPERLINK(""x"")",2,1.00,2.50,3.50,0.00,0.00,0.00,3.50,0.00')
    })
})

describe('AgencyPayrollPage driver names', () => {
    it('shows the directory name and last 4 digits instead of the id text', async () => {
        h.listDriverDirectory.mockResolvedValue([{ driver_id: D1, name: 'Ravi Kumar', phone_last4: '3210' }])
        await mountPage()
        expect(text()).toContain('Ravi Kumar (ends 3210)')
        expect(text()).not.toContain('Driver aaaaaaaa')
    })

    it('shows the name alone when the phone digits are unknown', async () => {
        h.listDriverDirectory.mockResolvedValue([{ driver_id: D1, name: 'Ravi Kumar', phone_last4: null }])
        await mountPage()
        expect(text()).toContain('Ravi Kumar')
        expect(text()).not.toContain('(ends')
    })

    it('falls back to the current Driver <id8> text when the directory is empty', async () => {
        await mountPage()
        expect(text()).toContain('Driver aaaaaaaa')
    })

    it('falls back to the current text, and still renders, when the directory call fails', async () => {
        h.listDriverDirectory.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="payroll-denied"]')).toBeNull()
        expect(text()).toContain('Driver aaaaaaaa')
    })

    it('keeps the fallback phone text for drivers missing from the directory', async () => {
        h.listEmployedDrivers.mockResolvedValue([{ ...DRIVER, contact_phone: '+91 90000 11111' }])
        h.listDriverDirectory.mockResolvedValue([{ driver_id: 'other', name: 'Someone Else', phone_last4: '0000' }])
        await mountPage()
        expect(text()).toContain('Driver aaaaaaaa (+91 90000 11111)')
    })
})

describe('AgencyPayrollPage subscription guard', () => {
    const fillPeriod = async () => {
        await setValue(q('#period-start')!, '2026-11-01')
        await setValue(q('#period-end')!, '2026-11-15')
    }

    it('shows the read-only prompt when open period is refused with SB002', async () => {
        h.openPeriod.mockRejectedValue(sbError(SB002_ERROR))
        await mountPage()
        await fillPeriod()
        await submit(q('[data-testid="open-period-form"]')!)
        expect(q('[role="alert"]')?.textContent).toContain('read-only')
        expect(h.toastError).not.toHaveBeenCalled()
    })

    it('shows the prompt when close period is refused with SB002', async () => {
        h.closePeriod.mockRejectedValue(sbError(SB002_ERROR))
        await mountPage()
        await click(button(/Open period 2026-10-01/)!)
        await click(button(/^Close period$/)!)
        await click(button(/Confirm close period/)!)
        expect(q('[role="alert"]')?.textContent).toContain('read-only')
    })

    it('record_add: open period and rate set are disabled in grace', async () => {
        await mountPage(gateFor('grace'))
        const open = q('[data-testid="open-period-form"] button[type="submit"]') as HTMLButtonElement
        expect(open.title).toContain('read-only')
        await fillPeriod()
        expect(open.disabled).toBe(true)
        const edit = button(/Edit rate for/)!
        expect(edit.disabled).toBe(true)
        expect(edit.title).toContain('read-only')
    })

    it('settle: close and adjust stay open in grace and lock in expired', async () => {
        await mountPage(gateFor('grace'))
        await click(button(/Open period 2026-10-01/)!)
        expect(button(/^Close period$/)!.disabled).toBe(false)
        expect(button(/Record adjustment/)!.title).toBe('')
        await act(async () => root!.unmount())
        container?.remove()
        await mountPage(gateFor('expired'))
        await click(button(/Open period 2026-10-01/)!)
        expect(button(/^Close period$/)!.disabled).toBe(true)
        expect(button(/^Close period$/)!.title).toContain('expired')
        expect(button(/Record adjustment/)!.disabled).toBe(true)
    })
})
