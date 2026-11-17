import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-149 Expenses, Fuel and Maintenance: loading / denied / error / empty
// states, expense form (rupees to integer paise, required truck, one key per
// intent), live fuel mileage and anomaly warning, maintenance status chips and
// the Service done action, typed refusals and the single refetch after a write.

const h = vi.hoisted(() => ({
    listTrucks: vi.fn(),
    listExpenses: vi.fn(),
    listFuelFills: vi.fn(),
    listMaintenanceItems: vi.fn(),
    expenseSummary: vi.fn(),
    recordExpense: vi.fn(),
    recordFuelFill: vi.fn(),
    upsertMaintenanceItem: vi.fn(),
    markServiceDone: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyExpensesApi', async () => {
    const actual = await vi.importActual<typeof import('../services/agencyExpensesApi')>('../services/agencyExpensesApi')
    return {
        EXPENSE_CATEGORIES: actual.EXPENSE_CATEGORIES,
        agencyExpensesApi: {
            listTrucks: h.listTrucks,
            listExpenses: h.listExpenses,
            listFuelFills: h.listFuelFills,
            listMaintenanceItems: h.listMaintenanceItems,
            expenseSummary: h.expenseSummary,
            recordExpense: h.recordExpense,
            recordFuelFill: h.recordFuelFill,
            upsertMaintenanceItem: h.upsertMaintenanceItem,
            markServiceDone: h.markServiceDone,
        },
    }
})

import AgencyExpensesPage from './AgencyExpensesPage'
import { UserFacingError } from '../utils/userFacingError'
import { formatPaise, optionalRupeesToPaise, rupeesToPaise } from '../lib/rupees'

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const TRUCKS = [
    { id: 't-1', rc_number: 'MH12AB1234', vehicle_type: 'Tipper' },
    { id: 't-2', rc_number: 'KA01CD5678', vehicle_type: 'Trailer' },
]
const FILLS = [
    { id: 'f-1', truck_id: 't-1', odometer_km: 1000, litres: 40, full_tank: true, expense_id: 'e-1', filled_on: '2026-11-01', created_at: '2026-11-01T00:00:00Z' },
    { id: 'f-2', truck_id: 't-1', odometer_km: 1400, litres: 50, full_tank: true, expense_id: 'e-2', filled_on: '2026-11-05', created_at: '2026-11-05T00:00:00Z' },
]
const SUMMARY = {
    ok: true,
    totalPaise: 1_500_050,
    byCategory: [{ category: 'fuel', totalPaise: 1_000_000 }, { category: 'toll', totalPaise: 500_050 }],
    byTruck: [{ truckId: 't-1', totalPaise: 1_500_050 }],
}
const baseItem = { truck_id: 't-1', interval_km: null, interval_days: null, last_service_km: 1000, last_service_on: isoDaysAgo(1), version: 2, created_at: '2026-10-01T00:00:00Z' }
const ITEMS = [
    { ...baseItem, id: 'i-ok', name: 'Engine oil', interval_km: 10000, interval_days: 365 },
    { ...baseItem, id: 'i-soon', name: 'Brake pads', interval_days: 30, last_service_on: isoDaysAgo(20) },
    { ...baseItem, id: 'i-late', name: 'Tyre rotation', interval_km: 200, last_service_km: 100 },
]

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(AgencyExpensesPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    h.listTrucks.mockResolvedValue(TRUCKS)
    h.listExpenses.mockResolvedValue([])
    h.listFuelFills.mockResolvedValue(FILLS)
    h.listMaintenanceItems.mockResolvedValue(ITEMS)
    h.expenseSummary.mockResolvedValue(SUMMARY)
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
    Array.from((container as HTMLElement).querySelectorAll('button')).find((b) => re.test(b.textContent || '')) as HTMLButtonElement | undefined

async function setValue(el: Element | null, value: string) {
    const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function click(b: Element | null | undefined) {
    await act(async () => {
        b!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

const openTab = (label: RegExp) => click(Array.from((container as HTMLElement).querySelectorAll('[role="tab"]')).find((t) => label.test(t.textContent || '')))

describe('rupees helpers', () => {
    it('converts rupees to integer paise without float error', () => {
        expect(rupeesToPaise('19.99')).toBe(1999)
        expect(rupeesToPaise('1,250.5')).toBe(125050)
        expect(rupeesToPaise('0.29')).toBe(29)
        expect(rupeesToPaise('1.1')).toBe(110)
        expect(rupeesToPaise('1000000')).toBe(100_000_000)
    })
    it('rejects bad input', () => {
        for (const bad of ['', '0', '-5', '1.234', 'abc', '1e3', '1000000.01', '12.']) expect(rupeesToPaise(bad)).toBeNull()
    })
    it('treats a blank optional cost as zero and formats paise', () => {
        expect(optionalRupeesToPaise('')).toBe(0)
        expect(optionalRupeesToPaise('x')).toBeNull()
        expect(formatPaise(1_500_050)).toBe('₹15,000.50')
    })
})

describe('AgencyExpensesPage', () => {
    it('shows a busy loading state first', async () => {
        h.listTrucks.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="expenses-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the denied state for a scope refusal', async () => {
        h.listExpenses.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="expenses-denied"]')).not.toBeNull()
    })

    it('shows an error alert with a Retry that refetches once', async () => {
        h.listTrucks.mockRejectedValueOnce(new UserFacingError('Failed to load trucks'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load trucks')
        await click(button(/Retry/))
        expect(h.listTrucks).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
    })

    it('shows empty states and the summary when there is nothing recorded', async () => {
        h.expenseSummary.mockResolvedValue({ ok: true, totalPaise: 0, byCategory: [], byTruck: [] })
        await mountPage()
        expect(q('[data-testid="expense-list-empty"]')).not.toBeNull()
        expect(q('[data-testid="expense-summary-empty"]')).not.toBeNull()
    })

    it('shows the period summary by category and by truck', async () => {
        h.listExpenses.mockResolvedValue([
            { id: 'e-1', truck_id: 't-1', category: 'toll', amount_paise: 500050, spent_on: '2026-11-03', note: 'NH48', created_at: '2026-11-03T00:00:00Z' },
        ])
        await mountPage()
        expect(q('[data-testid="expense-total"]')?.textContent).toBe('₹15,000.50')
        expect(q('[aria-label="Total by category"]')?.textContent).toContain('Fuel₹10,000.00')
        expect(q('[aria-label="Total by truck"]')?.textContent).toContain('MH12AB1234 · Tipper₹15,000.50')
        expect(q('[data-testid="expense-list"]')?.textContent).toContain('NH48')
    })

    it('shows a summary error without hiding the page', async () => {
        h.expenseSummary.mockResolvedValue({ ok: false, error: 'range_too_large', message: 'Choose a period of at most 366 days.' })
        await mountPage()
        expect(q('#summary-heading')).not.toBeNull()
        expect(text()).toContain('Choose a period of at most 366 days.')
    })

    it('adds an expense as integer paise with one key and a single refetch', async () => {
        h.recordExpense.mockResolvedValue({ ok: true, expenseId: 'e-9', replay: false })
        await mountPage()
        await setValue(q('#expense-category'), 'toll')
        await setValue(q('#expense-truck'), 't-1')
        await setValue(q('#expense-amount'), '19.99')
        await setValue(q('#expense-note'), 'NH48 toll')
        await click(button(/Save expense/))
        expect(h.recordExpense).toHaveBeenCalledTimes(1)
        const arg = h.recordExpense.mock.calls[0][0]
        expect(arg).toMatchObject({ truckId: 't-1', category: 'toll', amountPaise: 1999, note: 'NH48 toll' })
        expect(arg.spentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(typeof arg.idempotencyKey).toBe('string')
        expect(h.toastSuccess).toHaveBeenCalledWith('Expense saved')
        // Initial load plus exactly one refetch.
        expect(h.listExpenses).toHaveBeenCalledTimes(2)
        expect((q('#expense-amount') as HTMLInputElement).value).toBe('')
    })

    it('blocks a bad amount and a missing required truck before calling the server', async () => {
        await mountPage()
        await setValue(q('#expense-amount'), '10.123')
        await click(button(/Save expense/))
        expect(q('[data-testid="expense-form"] [role="alert"]')?.textContent).toContain('Enter the amount in rupees')
        await setValue(q('#expense-amount'), '10')
        await click(button(/Save expense/))
        expect(q('[data-testid="expense-form"] [role="alert"]')?.textContent).toContain('Choose a truck')
        expect(h.recordExpense).not.toHaveBeenCalled()
    })

    it('keeps the same key when retrying unchanged details and uses a new one after an edit', async () => {
        h.recordExpense
            .mockResolvedValueOnce({ ok: false, error: 'forbidden_scope', message: 'Only fleet managers and finance can record or change this. You can view it.' })
            .mockResolvedValue({ ok: false, error: 'future_date', message: 'The date cannot be in the future.' })
        await mountPage()
        await setValue(q('#expense-truck'), 't-1')
        await setValue(q('#expense-amount'), '500')
        await click(button(/Save expense/))
        expect(q('[data-testid="expense-form"] [role="alert"]')?.textContent).toContain('You can view it')
        expect(h.toastError).toHaveBeenCalledTimes(1)
        await click(button(/Save expense/))
        expect(h.recordExpense.mock.calls[1][0].idempotencyKey).toBe(h.recordExpense.mock.calls[0][0].idempotencyKey)
        await setValue(q('#expense-amount'), '501')
        await click(button(/Save expense/))
        expect(h.recordExpense.mock.calls[2][0].idempotencyKey).not.toBe(h.recordExpense.mock.calls[0][0].idempotencyKey)
        // A refusal triggers no refetch.
        expect(h.listExpenses).toHaveBeenCalledTimes(1)
    })

    it('disables Save while submitting', async () => {
        let release: (v: unknown) => void = () => {}
        h.recordExpense.mockReturnValue(new Promise((r) => { release = r }))
        await mountPage()
        await setValue(q('#expense-truck'), 't-1')
        await setValue(q('#expense-amount'), '500')
        await click(button(/Save expense/))
        expect(button(/Saving/)!.disabled).toBe(true)
        await click(button(/Saving/))
        expect(h.recordExpense).toHaveBeenCalledTimes(1)
        await act(async () => {
            release({ ok: true, expenseId: 'e', replay: false })
            await new Promise((r) => setTimeout(r, 0))
        })
    })

    it('moves between tabs with the arrow keys', async () => {
        await mountPage()
        const first = q('#tab-expenses') as HTMLButtonElement
        expect(first.getAttribute('aria-selected')).toBe('true')
        await act(async () => {
            first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(q('#tab-fuel')?.getAttribute('aria-selected')).toBe('true')
        expect(q('#panel-fuel')).not.toBeNull()
        expect(q('#panel-expenses')).toBeNull()
    })

    it('shows live mileage and warns about an implausible fill', async () => {
        await mountPage()
        await openTab(/Fuel/)
        await setValue(q('#fuel-truck'), 't-1')
        expect(q('[data-testid="fuel-mileage"]')?.textContent).toContain('8 km per litre')
        expect(text()).toContain('Last fill: 1,400 km')

        await setValue(q('#fuel-odometer'), '1800')
        await setValue(q('#fuel-litres'), '40')
        expect(q('[data-testid="fuel-mileage"]')?.textContent).toContain('8.89 km per litre')
        expect(q('[data-testid="fuel-warning"]')).toBeNull()

        await setValue(q('#fuel-odometer'), '1500')
        await setValue(q('#fuel-litres'), '500')
        expect(q('[data-testid="fuel-warning"]')?.textContent).toContain('unusual mileage')

        await setValue(q('#fuel-odometer'), '1300')
        await setValue(q('#fuel-litres'), '40')
        expect(q('[data-testid="fuel-warning"]')?.textContent).toContain('lower than the previous fill')
    })

    it('saves a fuel fill with the exact values and refetches once', async () => {
        h.recordFuelFill.mockResolvedValue({ ok: true, expenseId: 'e', fillId: 'f', replay: false })
        await mountPage()
        await openTab(/Fuel/)
        await setValue(q('#fuel-truck'), 't-1')
        await setValue(q('#fuel-odometer'), '1800')
        await setValue(q('#fuel-litres'), '40.5')
        await setValue(q('#fuel-amount'), '4,050.75')
        await click(q('#fuel-full'))
        await click(button(/Save fuel fill/))
        expect(h.recordFuelFill).toHaveBeenCalledWith(
            expect.objectContaining({ truckId: 't-1', odometerKm: 1800, litres: 40.5, fullTank: false, amountPaise: 405075 })
        )
        expect(h.listFuelFills).toHaveBeenCalledTimes(2)
        expect(h.toastSuccess).toHaveBeenCalledWith('Fuel fill saved')
    })

    it('shows the server odometer refusal in plain language', async () => {
        h.recordFuelFill.mockResolvedValue({ ok: false, error: 'odometer_not_increasing', message: 'The odometer must be higher than the last fill (1,400 km).', previousKm: 1400 })
        await mountPage()
        await openTab(/Fuel/)
        await setValue(q('#fuel-truck'), 't-1')
        await setValue(q('#fuel-odometer'), '1300')
        await setValue(q('#fuel-litres'), '40')
        await setValue(q('#fuel-amount'), '4000')
        await click(button(/Save fuel fill/))
        expect(q('[data-testid="fuel-form"] [role="alert"]')?.textContent).toContain('higher than the last fill (1,400 km)')
    })

    it('shows empty states for fuel and maintenance', async () => {
        h.listFuelFills.mockResolvedValue([])
        h.listMaintenanceItems.mockResolvedValue([])
        await mountPage()
        await openTab(/Fuel/)
        expect(q('[data-testid="fuel-empty"]')).not.toBeNull()
        await openTab(/Maintenance/)
        expect(q('[data-testid="maint-empty"]')).not.toBeNull()
    })

    it('shows ok, due soon and overdue chips', async () => {
        await mountPage()
        await openTab(/Maintenance/)
        expect(q('[data-testid="maint-item-i-ok"]')?.textContent).toContain('OK')
        expect(q('[data-testid="maint-item-i-soon"]')?.textContent).toContain('Due soon')
        expect(q('[data-testid="maint-item-i-late"]')?.textContent).toContain('Overdue')
        expect(q('[data-testid="maint-item-i-late"]')?.textContent).toContain('over')
    })

    it('records a service with the expected version, cost in paise and one key', async () => {
        h.markServiceDone.mockResolvedValue({ ok: true, replay: false, expenseId: 'e', version: 3 })
        await mountPage()
        await openTab(/Maintenance/)
        await click(q('[data-testid="maint-item-i-ok"] button'))
        expect((q('#svc-km-i-ok') as HTMLInputElement).value).toBe('1400')
        await setValue(q('#svc-cost-i-ok'), '2500.50')
        await click(button(/Save service/))
        expect(h.markServiceDone).toHaveBeenCalledWith(
            expect.objectContaining({ itemId: 'i-ok', serviceKm: 1400, expectedVersion: 2, costPaise: 250050 })
        )
        expect(h.toastSuccess).toHaveBeenCalledWith('Service recorded')
        expect(h.listMaintenanceItems).toHaveBeenCalledTimes(2)
        expect(q('#svc-km-i-ok')).toBeNull()
    })

    it('shows a version conflict from Service done and keeps the form open', async () => {
        h.markServiceDone.mockResolvedValue({ ok: false, error: 'version_conflict', message: 'This item changed. Reload to continue.', currentVersion: 3 })
        await mountPage()
        await openTab(/Maintenance/)
        await click(q('[data-testid="maint-item-i-ok"] button'))
        await click(button(/Save service/))
        expect(q('#svc-km-i-ok')).not.toBeNull()
        expect(text()).toContain('This item changed. Reload to continue.')
        expect(h.listMaintenanceItems).toHaveBeenCalledTimes(1)
    })

    it('adds a maintenance item after validating the interval', async () => {
        h.upsertMaintenanceItem.mockResolvedValue({ ok: true, itemId: 'i-new', version: 1 })
        await mountPage()
        await openTab(/Maintenance/)
        await setValue(q('#maint-truck'), 't-2')
        await setValue(q('#maint-name'), 'Air filter')
        await click(button(/Add item/))
        expect(q('[data-testid="maint-form"] [role="alert"]')?.textContent).toContain('service interval')
        expect(h.upsertMaintenanceItem).not.toHaveBeenCalled()
        await setValue(q('#maint-interval-km'), '15000')
        await click(button(/Add item/))
        expect(h.upsertMaintenanceItem).toHaveBeenCalledWith({
            truckId: 't-2', name: 'Air filter', intervalKm: 15000, intervalDays: null, lastServiceKm: null, lastServiceOn: null, expectedVersion: null,
        })
    })
})
