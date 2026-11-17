import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

// The real SupabaseClient methods depend on `this`; a detached call crashes in the
// browser. These wrappers fail loudly unless the service calls them as methods.
vi.mock('../lib/supabase', () => {
    const client: Record<string, unknown> = {}
    client.rpc = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.rpc called without its client as this')
        return rpcMock(...args)
    }
    client.from = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.from called without its client as this')
        return fromMock(...args)
    }
    return { supabase: client }
})

import { agencyLoadPlansApi, describeProblem } from './agencyLoadPlansApi'
import { UserFacingError } from '../utils/userFacingError'

// A chainable, awaitable query: every builder method returns the same object.
function mockQuery(rows: unknown[], error: unknown = null) {
    const calls: Record<string, unknown[][]> = { eq: [], in: [], order: [] }
    const result = { data: rows, error }
    const query: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    for (const name of ['eq', 'in', 'order']) {
        query[name] = (...args: unknown[]) => {
            calls[name].push(args)
            return query
        }
    }
    const select = vi.fn().mockReturnValue(query)
    fromMock.mockReturnValue({ select })
    return { select, calls }
}

const saveInput = {
    name: 'Mon run',
    loads: [{ truckId: 't-1', lines: [{ orderLineId: 'l-1', quantity: 5 }] }],
    unmet: [{ orderLineId: 'l-2', reason: 'too_heavy' as const }],
    idempotencyKey: 'k-1',
}

describe('agencyLoadPlansApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('savePlan', () => {
        it('sends the exact RPC arguments and returns the typed success', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, plan_id: 'p-1', plan_version: 2, status: 'draft', version: 1, replay: false }, error: null })
            const result = await agencyLoadPlansApi.savePlan(saveInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_load_plan_save', {
                p_name: 'Mon run',
                p_batch_id: null,
                p_loads: [{ truck_id: 't-1', lines: [{ order_line_id: 'l-1', quantity: 5 }] }],
                p_unmet: [{ order_line_id: 'l-2', reason: 'too_heavy' }],
                p_idempotency_key: 'k-1',
            })
            expect(result).toEqual({ ok: true, replay: false, planId: 'p-1', planVersion: 2, status: 'draft', version: 1 })
        })

        it('flags a replay', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, plan_id: 'p-1', plan_version: 1, status: 'draft', version: 1, replay: true }, error: null })
            expect(await agencyLoadPlansApi.savePlan(saveInput)).toMatchObject({ ok: true, replay: true })
        })

        it.each([
            ['forbidden_scope', /role does not allow/],
            ['idempotency_key_required', /Reload the page/],
            ['key_too_long', /Reload the page/],
            ['invalid_name', /1 to 80 characters/],
            ['invalid_payload', /without a truck or lines/],
            ['invalid_unmet', /unplaced lines/],
            ['too_large', /too large/],
            ['idempotency_key_reused', /already used/],
            ['batch_not_found', /batch could not be found/],
            ['truck_used_twice', /more than one load/],
            ['truck_not_found', /blocked for maintenance/],
            ['order_line_not_found', /could not be found/],
            ['order_cancelled', /cancelled/],
            ['line_allocated_twice', /more than one load/],
            ['line_allocated_and_unmet', /both placed on a load and listed as unplaced/],
            ['over_allocated', /more than its order quantity/],
            ['weight_missing', /no weight/],
            ['over_capacity', /heavier than its truck/],
            ['concurrent_conflict', /same moment/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyLoadPlansApi.savePlan(saveInput)
            expect(result).toMatchObject({ ok: false, error: code, problems: [], orderLineIds: [] })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('parses the problems array with their indexes', async () => {
            rpcMock.mockResolvedValue({
                data: {
                    ok: false,
                    error: 'over_capacity',
                    problems: [
                        { code: 'over_capacity', index: 1, total_kg: 1200, payload_kg: 1000 },
                        { code: 'weight_missing', index: 0, load_index: 2, order_line_id: 'l-9' },
                        'junk',
                        { index: 4 },
                    ],
                },
                error: null,
            })
            const result = await agencyLoadPlansApi.savePlan(saveInput)
            expect(result.ok === false && result.problems).toEqual([
                { code: 'over_capacity', index: 1, totalKg: 1200, payloadKg: 1000 },
                { code: 'weight_missing', index: 0, loadIndex: 2, orderLineId: 'l-9' },
            ])
        })

        it('maps an unknown refusal to the fallback message', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyLoadPlansApi.savePlan(saveInput)).toMatchObject({
                ok: false, error: 'unknown', message: 'Failed to save the plan',
            })
        })

        it('surfaces approved exceptions, redacts the rest and rejects malformed envelopes', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Agency approval is required.' } })
            await expect(agencyLoadPlansApi.savePlan(saveInput)).rejects.toThrow('Agency approval is required.')
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist' } })
            const err = await agencyLoadPlansApi.savePlan(saveInput).catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to save the plan')
            rpcMock.mockResolvedValueOnce({ data: { ok: true, plan_id: 'p-1' }, error: null })
            await expect(agencyLoadPlansApi.savePlan(saveInput)).rejects.toThrow('Failed to save the plan')
        })
    })

    describe('approvePlan / cancelPlan', () => {
        it('sends the exact RPC arguments and returns the new version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'approved', version: 3 }, error: null })
            expect(await agencyLoadPlansApi.approvePlan('p-1', 2)).toEqual({ ok: true, state: 'approved', version: 3 })
            expect(rpcMock).toHaveBeenCalledWith('agency_load_plan_approve', { p_plan_id: 'p-1', p_expected_version: 2 })

            rpcMock.mockResolvedValue({ data: { ok: true, state: 'cancelled', version: 2 }, error: null })
            expect(await agencyLoadPlansApi.cancelPlan('p-1', 1)).toEqual({ ok: true, state: 'cancelled', version: 2 })
            expect(rpcMock).toHaveBeenLastCalledWith('agency_load_plan_cancel', { p_plan_id: 'p-1', p_expected_version: 1 })
        })

        it('returns stale_plan with the offending lines and problems', async () => {
            rpcMock.mockResolvedValue({
                data: {
                    ok: false,
                    error: 'stale_plan',
                    order_line_ids: ['l-1', 'l-2'],
                    problems: [{ code: 'order_cancelled', order_line_id: 'l-1' }, { code: 'truck_unavailable', truck_id: 't-1' }],
                },
                error: null,
            })
            const result = await agencyLoadPlansApi.approvePlan('p-1', 1)
            expect(result).toMatchObject({
                ok: false,
                error: 'stale_plan',
                orderLineIds: ['l-1', 'l-2'],
                problems: [{ code: 'order_cancelled', orderLineId: 'l-1' }, { code: 'truck_unavailable', truckId: 't-1' }],
            })
            expect(result.ok === false && result.message).toMatch(/Propose the plan again/)
        })

        it('returns version_conflict with the current version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'version_conflict', current_version: 5 }, error: null })
            expect(await agencyLoadPlansApi.approvePlan('p-1', 1)).toMatchObject({
                ok: false, error: 'version_conflict', currentVersion: 5, message: 'This plan changed. Reload to continue.',
            })
        })

        it.each([
            ['not_found', /could not be found/],
            ['illegal_transition', /not allowed/],
            ['empty_plan', /no loads/],
            ['line_already_planned', /another approved plan/],
            ['has_consignments', /GR was already created/],
            ['forbidden_scope', /role does not allow/],
            ['concurrent_conflict', /same moment/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code, order_line_ids: ['l-1'] }, error: null })
            const result = await agencyLoadPlansApi.cancelPlan('p-1', 1)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('rejects a success envelope with the wrong state', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'cancelled', version: 2 }, error: null })
            await expect(agencyLoadPlansApi.approvePlan('p-1', 1)).rejects.toThrow('Failed to approve the plan')
        })
    })

    describe('reads', () => {
        it('lists draft orders, newest first', async () => {
            const { calls } = mockQuery([{ id: 'o-1' }])
            expect(await agencyLoadPlansApi.listDraftOrders()).toEqual([{ id: 'o-1' }])
            expect(fromMock).toHaveBeenCalledWith('agency_orders')
            expect(calls.eq[0]).toEqual(['status', 'draft'])
            expect(calls.order[0]).toEqual(['created_at', { ascending: false }])
        })

        it('lists lines for the given orders and normalises numeric strings', async () => {
            const { calls } = mockQuery([{ id: 'l-1', quantity: '12.5', weight_per_unit_kg: '2' }, { id: 'l-2', quantity: 1, weight_per_unit_kg: null }])
            const rows = await agencyLoadPlansApi.listOrderLines(['o-1'])
            expect(fromMock).toHaveBeenCalledWith('agency_order_lines')
            expect(calls.in[0]).toEqual(['order_id', ['o-1']])
            expect(rows[0]).toMatchObject({ quantity: 12.5, weight_per_unit_kg: 2 })
            expect(rows[1].weight_per_unit_kg).toBeNull()
        })

        it('skips the lines query when there are no orders', async () => {
            expect(await agencyLoadPlansApi.listOrderLines([])).toEqual([])
            expect(fromMock).not.toHaveBeenCalled()
        })

        it('lists trucks with payload_kg', async () => {
            const { select } = mockQuery([{ id: 't-1', payload_kg: '9000.00' }])
            expect(await agencyLoadPlansApi.listTrucks()).toEqual([{ id: 't-1', payload_kg: 9000 }])
            expect(fromMock).toHaveBeenCalledWith('agency_trucks')
            expect(select.mock.calls[0][0]).toContain('payload_kg')
        })

        it('lists plans and loads plan details by plan id', async () => {
            mockQuery([{ id: 'p-1' }])
            expect(await agencyLoadPlansApi.listPlans()).toEqual([{ id: 'p-1' }])
            expect(fromMock).toHaveBeenCalledWith('agency_load_plans')

            const { calls } = mockQuery([])
            await agencyLoadPlansApi.getPlanDetail('p-1')
            expect(fromMock).toHaveBeenCalledWith('agency_load_plan_loads')
            expect(fromMock).toHaveBeenCalledWith('agency_load_plan_lines')
            expect(fromMock).toHaveBeenCalledWith('agency_load_plan_unmet')
            expect(calls.eq).toEqual([['plan_id', 'p-1'], ['plan_id', 'p-1'], ['plan_id', 'p-1']])
        })

        it('throws the fallback when a read fails', async () => {
            mockQuery([], { message: 'raw detail' })
            await expect(agencyLoadPlansApi.listPlans()).rejects.toThrow('Failed to load plans')
        })
    })

    describe('describeProblem line_allocated_and_unmet', () => {
        it('names the line and the conflict', () => {
            expect(describeProblem({ code: 'line_allocated_and_unmet', loadIndex: 0, index: 1 })).toBe(
                'Load 1, line 2: this line is placed on a load and also listed as unplaced.',
            )
        })
    })

    describe('describeProblem', () => {
        it('writes 1-based plain sentences', () => {
            expect(describeProblem({ code: 'over_capacity', index: 0, totalKg: 1200, payloadKg: 1000 })).toBe(
                'Load 1 is over capacity: 1,200 kg on a truck that carries 1,000 kg.'
            )
            expect(describeProblem({ code: 'order_cancelled', index: 2, loadIndex: 1 })).toBe('Load 2, line 3: its order was cancelled.')
            expect(describeProblem({ code: 'order_line_not_found', unmetIndex: 0 })).toMatch(/^Unplaced line 1/)
            expect(describeProblem({ code: 'invalid_payload', index: 0, lineIndex: 1 })).toMatch(/^Load 1, line 2/)
            expect(describeProblem({ code: 'truck_unavailable', truckId: 't-1' })).toMatch(/maintenance/)
            expect(describeProblem({ code: 'whatever' })).toMatch(/Propose the plan again/)
        })
    })
})
