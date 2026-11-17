import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-145 Load plan: loading / empty / denied / error states, picking orders and trucks,
// local proposal with capacity meters and unmet demand, save with one idempotency key
// per intent, approve with a supersede confirmation, stale_plan recovery, cancel.

const h = vi.hoisted(() => ({
    listDraftOrders: vi.fn(),
    listOrderLines: vi.fn(),
    listTrucks: vi.fn(),
    listPlans: vi.fn(),
    getPlanDetail: vi.fn(),
    savePlan: vi.fn(),
    approvePlan: vi.fn(),
    cancelPlan: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyLoadPlansApi', async () => {
    const actual = await vi.importActual<typeof import('../services/agencyLoadPlansApi')>('../services/agencyLoadPlansApi')
    return {
        describeProblem: actual.describeProblem,
        agencyLoadPlansApi: {
            listDraftOrders: h.listDraftOrders,
            listOrderLines: h.listOrderLines,
            listTrucks: h.listTrucks,
            listPlans: h.listPlans,
            getPlanDetail: h.getPlanDetail,
            savePlan: h.savePlan,
            approvePlan: h.approvePlan,
            cancelPlan: h.cancelPlan,
        },
    }
})

import AgencyLoadPlanPage from './AgencyLoadPlanPage'
import { UserFacingError } from '../utils/userFacingError'

const order = (id: string, ref: string) => ({
    id, client_order_ref: ref, status: 'draft', version: 1, created_at: '2026-11-10T00:00:00Z',
})
const line = (id: string, orderId: string, lineNo: number, quantity: number, wpu: number | null = 10, unit = 'carton') => ({
    id, order_id: orderId, line_no: lineNo, sku: 'SKU', description: null, quantity, unit,
    weight_per_unit_kg: wpu, pickup_site_id: 'a0000000-0000', drop_site_id: 'b0000000-0000', pickup_to: null,
    stackable: true, fragile: false,
})
const truck = (id: string, rc: string, payload: number | null, extra: Record<string, unknown> = {}) => ({
    id, vehicle_type: 'Tata 407', rc_number: rc, payload_kg: payload, is_available: true, maintenance_blocked: false, ...extra,
})
const plan = (id: string, name: string, status: string, planVersion: number, version = 1) => ({
    id, name, status, plan_version: planVersion, version, approved_at: null, created_at: '2026-11-11T00:00:00Z',
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(AgencyLoadPlanPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    // Order SO-1: 5 x 10 kg = 50 kg and 30 x 10 kg = 300 kg. Order SO-2: 100 x 10 kg = 1000 kg (too heavy for 500).
    h.listDraftOrders.mockResolvedValue([order('o-1', 'SO-1'), order('o-2', 'SO-2')])
    h.listOrderLines.mockResolvedValue([line('l-1', 'o-1', 1, 5), line('l-2', 'o-1', 2, 30), line('l-3', 'o-2', 1, 100)])
    h.listTrucks.mockResolvedValue([
        truck('t-1', 'MH01-1', 500),
        truck('t-2', 'MH01-2', 400),
        truck('t-3', 'MH01-3', 900, { maintenance_blocked: true }),
        truck('t-4', 'MH01-4', null),
    ])
    h.listPlans.mockResolvedValue([])
    h.getPlanDetail.mockResolvedValue({ loads: [], lines: [], unmet: [] })
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

async function click(b: Element | null | undefined) {
    await act(async () => {
        b!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function typeInto(el: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

const checkbox = (testid: string) => q(`[data-testid="${testid}"] input[type="checkbox"]`) as HTMLInputElement

async function pickAndPropose(orders = ['o-1'], trucks = ['t-1', 't-2']) {
    for (const id of orders) await click(checkbox(`loadplan-order-${id}`))
    for (const id of trucks) await click(checkbox(`loadplan-truck-${id}`))
    await click(button(/Propose plan/))
}

describe('AgencyLoadPlanPage', () => {
    it('shows a busy loading state before data arrives', async () => {
        h.listDraftOrders.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="loadplan-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the denied state for a scope refusal', async () => {
        h.listPlans.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="loadplan-denied"]')).not.toBeNull()
    })

    it('shows an error alert with a single-refetch Retry', async () => {
        h.listDraftOrders.mockRejectedValueOnce(new UserFacingError('Failed to load orders'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load orders')
        await click(button(/^Retry/))
        expect(h.listDraftOrders).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
    })

    it('shows empty states for no orders, no trucks and no plans', async () => {
        h.listDraftOrders.mockResolvedValue([])
        h.listOrderLines.mockResolvedValue([])
        h.listTrucks.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="loadplan-no-orders"]')).not.toBeNull()
        expect(q('[data-testid="loadplan-no-trucks"]')).not.toBeNull()
        expect(q('[data-testid="loadplan-empty"]')).not.toBeNull()
    })

    it('disables trucks that are blocked or have no payload, with the reason', async () => {
        await mountPage()
        expect(checkbox('loadplan-truck-t-3').disabled).toBe(true)
        expect(q('[data-testid="loadplan-truck-t-3"]')!.textContent).toContain('Blocked for maintenance')
        expect(checkbox('loadplan-truck-t-4').disabled).toBe(true)
        expect(q('[data-testid="loadplan-truck-t-4"]')!.textContent).toContain('No payload set')
        expect(checkbox('loadplan-truck-t-1').disabled).toBe(false)
    })

    it('asks for picks before proposing', async () => {
        await mountPage()
        await click(button(/Propose plan/))
        expect(q('[data-testid="loadplan-pick-message"]')?.textContent).toContain('Pick at least one')
        expect(q('[data-testid="loadplan-proposal"]')).toBeNull()
    })

    it('proposes loads with a capacity meter and unmet demand with reasons', async () => {
        await mountPage()
        await pickAndPropose(['o-1', 'o-2'], ['t-1', 't-2'])
        const proposal = q('[data-testid="loadplan-proposal"]')!
        // 350 kg of SO-1 on the smaller 400 kg truck: 87.5 %.
        const load = q('[data-testid="loadplan-load-t-2"]')!
        expect(load.textContent).toContain('350 kg of 400 kg')
        const meter = load.querySelector('[role="meter"]')!
        expect(meter.getAttribute('aria-valuenow')).toBe('87.5')
        expect(load.textContent).toContain('87.5% full')
        expect(load.textContent).toContain('Order SO-1 line 2')
        const unmet = q('[data-testid="loadplan-unmet"]')!.textContent!
        expect(unmet).toContain('Order SO-2 line 1')
        expect(unmet).toContain('Heavier than any selected truck can carry')
        expect(proposal.textContent).toContain('Save draft')
    })

    it('lists a line without a weight as left out', async () => {
        h.listOrderLines.mockResolvedValue([line('l-1', 'o-1', 1, 5, null, 'piece')])
        await mountPage()
        await pickAndPropose(['o-1'], ['t-1'])
        expect(q('[data-testid="loadplan-unmet"]')!.textContent).toContain('no weight is known')
        expect(q('[data-testid="loadplan-no-loads"]')).not.toBeNull()
        expect(button(/Save draft/)!.disabled).toBe(true)
    })

    it('saves with the name, whole lines and one key, reusing it after a failure, then refetches once', async () => {
        h.savePlan
            .mockRejectedValueOnce(new UserFacingError('Failed to save the plan'))
            .mockResolvedValueOnce({ ok: true, replay: false, planId: 'p-1', planVersion: 1, status: 'draft', version: 1 })
        await mountPage()
        await pickAndPropose(['o-1'], ['t-1', 't-2'])
        expect(button(/Save draft/)!.disabled).toBe(true)
        await typeInto(q('#plan-name') as HTMLInputElement, 'Mon run')
        await click(button(/Save draft/))
        expect(h.toastError).toHaveBeenCalledWith('Failed to save the plan')
        expect(h.listPlans).toHaveBeenCalledTimes(1)

        await click(button(/Save draft/))
        expect(h.savePlan.mock.calls[1][0].idempotencyKey).toBe(h.savePlan.mock.calls[0][0].idempotencyKey)
        expect(h.savePlan.mock.calls[1][0]).toMatchObject({
            name: 'Mon run',
            loads: [{ truckId: 't-2', lines: [{ orderLineId: 'l-1', quantity: 5 }, { orderLineId: 'l-2', quantity: 30 }] }],
            unmet: [],
        })
        expect(h.toastSuccess).toHaveBeenCalledWith('Plan "Mon run" saved as draft version 1')
        expect(h.listPlans).toHaveBeenCalledTimes(2)
        expect(q('[data-testid="loadplan-proposal"]')).toBeNull()
    })

    it('uses a fresh key for a new proposal and shows the typed refusal with its problems', async () => {
        h.savePlan.mockResolvedValue({
            ok: false, error: 'over_capacity', message: 'A load is heavier than its truck can carry. Reload and propose again.',
            problems: [{ code: 'over_capacity', index: 0, totalKg: 600, payloadKg: 400 }], orderLineIds: [],
        })
        await mountPage()
        await pickAndPropose(['o-1'], ['t-1', 't-2'])
        await typeInto(q('#plan-name') as HTMLInputElement, 'A')
        await click(button(/Save draft/))
        const msg = q('[data-testid="loadplan-save-message"]')!.textContent!
        expect(msg).toContain('heavier than its truck')
        expect(msg).toContain('Load 1 is over capacity: 600 kg on a truck that carries 400 kg.')
        await click(button(/Save draft/))
        expect(h.savePlan.mock.calls[1][0].idempotencyKey).not.toBe(h.savePlan.mock.calls[0][0].idempotencyKey)
    })

    it('shows plans with version and status chips and loads plan details on demand', async () => {
        h.listPlans.mockResolvedValue([
            plan('p-1', 'Mon', 'approved', 1),
            plan('p-2', 'Mon', 'superseded', 0),
            plan('p-3', 'Tue', 'draft', 2),
            plan('p-4', 'Wed', 'cancelled', 1),
        ])
        h.getPlanDetail.mockResolvedValue({
            loads: [{ id: 'pl-1', plan_id: 'p-1', truck_id: 't-1', total_kg: 350, utilization_pct: 70 }],
            lines: [{ id: 'x-1', load_id: 'pl-1', plan_id: 'p-1', order_line_id: 'l-1', quantity: 5 }],
            unmet: [{ id: 'u-1', plan_id: 'p-1', order_line_id: 'l-3', reason: 'no_truck' }],
        })
        await mountPage()
        expect(q('[data-testid="loadplan-plan-p-1"]')!.textContent).toContain('Approved')
        expect(q('[data-testid="loadplan-plan-p-1"]')!.textContent).toContain('Version 1')
        expect(q('[data-testid="loadplan-plan-p-2"]')!.textContent).toContain('Superseded')
        expect(q('[data-testid="loadplan-plan-p-3"]')!.textContent).toContain('Draft')
        expect(q('[data-testid="loadplan-plan-p-4"]')!.textContent).toContain('Cancelled')
        // Only draft plans can be approved; cancelled ones have no actions.
        expect(q('[data-testid="loadplan-plan-p-4"]')!.textContent).not.toContain('Cancel plan')
        expect(q('[data-testid="loadplan-plan-p-2"]')!.textContent).not.toContain('Approve')

        await click(q('[data-testid="loadplan-plan-p-1"] button[aria-expanded]'))
        expect(h.getPlanDetail).toHaveBeenCalledWith('p-1')
        const detail = q('[data-testid="loadplan-detail-p-1"]')!.textContent!
        expect(detail).toContain('Order SO-1 line 1')
        expect(detail).toContain('No free truck was left for this route')
    })

    it('confirms approval, says it supersedes the earlier approved plan of the same name, then approves', async () => {
        h.listPlans.mockResolvedValue([plan('p-1', 'Mon', 'approved', 1, 2), plan('p-2', 'Mon', 'draft', 2, 1)])
        h.approvePlan.mockResolvedValue({ ok: true, state: 'approved', version: 2 })
        await mountPage()
        await click(button(/Approve Mon version 2/))
        expect(h.approvePlan).not.toHaveBeenCalled()
        expect(q('[data-testid="loadplan-confirm-p-2"]')!.textContent).toContain('supersedes the earlier approved plan of the same name (version 1)')
        await click(button(/Confirm approval/))
        expect(h.approvePlan).toHaveBeenCalledWith('p-2', 1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Plan "Mon" approved')
        expect(h.listPlans).toHaveBeenCalledTimes(2)
    })

    it('says nothing is replaced when no earlier plan of the name is approved, and Escape closes the confirm step', async () => {
        h.listPlans.mockResolvedValue([plan('p-2', 'Mon', 'draft', 1)])
        await mountPage()
        await click(button(/Approve Mon/))
        const confirm = q('[data-testid="loadplan-confirm-p-2"]')!
        expect(confirm.textContent).toContain('No earlier approved plan of this name will be replaced')
        await act(async () => {
            confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        })
        expect(q('[data-testid="loadplan-confirm-p-2"]')).toBeNull()
    })

    it('lists the offending lines on stale_plan and re-proposes from refreshed data', async () => {
        h.listPlans.mockResolvedValue([plan('p-2', 'Mon', 'draft', 1)])
        h.approvePlan.mockResolvedValue({
            ok: false, error: 'stale_plan', message: 'Orders or trucks changed since this plan was saved. Propose the plan again.',
            problems: [{ code: 'order_cancelled', orderLineId: 'l-2' }], orderLineIds: ['l-2'],
        })
        await mountPage()
        await pickAndPropose(['o-1'], ['t-1', 't-2'])
        await click(button(/Approve Mon/))
        await click(button(/Confirm approval/))
        const notice = q('[data-testid="loadplan-notice-p-2"]')!
        expect(notice.textContent).toContain('changed since this plan was saved')
        expect(q('[data-testid="loadplan-stale-lines-p-2"]')!.textContent).toContain('Order SO-1 line 2')

        // The order was cancelled meanwhile: the refreshed data no longer has SO-1 line 2's order.
        h.listDraftOrders.mockResolvedValue([order('o-1', 'SO-1')])
        h.listOrderLines.mockResolvedValue([line('l-1', 'o-1', 1, 5)])
        const callsBefore = h.listDraftOrders.mock.calls.length
        await click(button(/Refresh and propose again/))
        expect(h.listDraftOrders).toHaveBeenCalledTimes(callsBefore + 1)
        const proposal = q('[data-testid="loadplan-proposal"]')!.textContent!
        expect(proposal).toContain('50 kg')
        expect(proposal).not.toContain('line 2')
        expect(q('[data-testid="loadplan-notice-p-2"]')).toBeNull()
    })

    it('explains a version conflict in plain language', async () => {
        h.listPlans.mockResolvedValue([plan('p-2', 'Mon', 'draft', 1)])
        h.approvePlan.mockResolvedValue({
            ok: false, error: 'version_conflict', message: 'This plan changed. Reload to continue.', problems: [], orderLineIds: [], currentVersion: 4,
        })
        await mountPage()
        await click(button(/Approve Mon/))
        await click(button(/Confirm approval/))
        expect(q('[data-testid="loadplan-notice-p-2"]')!.textContent).toContain('This plan changed')
        expect(button(/Refresh and propose again/)).toBeUndefined()
    })

    it('cancels only after a confirm step and shows has_consignments', async () => {
        h.listPlans.mockResolvedValue([plan('p-1', 'Mon', 'approved', 1, 3)])
        h.cancelPlan.mockResolvedValue({
            ok: false, error: 'has_consignments', message: 'A GR was already created for an order in this plan, so it cannot be cancelled.', problems: [], orderLineIds: [],
        })
        await mountPage()
        await click(button(/Cancel Mon version 1/))
        expect(h.cancelPlan).not.toHaveBeenCalled()
        await click(button(/Confirm cancel/))
        expect(h.cancelPlan).toHaveBeenCalledWith('p-1', 3)
        expect(q('[data-testid="loadplan-notice-p-1"]')!.textContent).toContain('GR was already created')
    })

    it('disables actions while a request is in flight', async () => {
        h.listPlans.mockResolvedValue([plan('p-2', 'Mon', 'draft', 1), plan('p-3', 'Tue', 'draft', 1)])
        let release: (v: unknown) => void = () => {}
        h.approvePlan.mockReturnValue(new Promise((r) => { release = r }))
        await mountPage()
        await click(button(/Approve Mon/))
        await click(button(/Confirm approval/))
        expect(text()).toContain('Approving…')
        expect(button(/Approve Tue/)!.disabled).toBe(true)
        await act(async () => {
            release({ ok: true, state: 'approved', version: 2 })
            await new Promise((r) => setTimeout(r, 0))
        })
    })
})
