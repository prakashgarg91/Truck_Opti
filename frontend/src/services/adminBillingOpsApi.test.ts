import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    limit: vi.fn(),
    range: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
    supabase: { from: h.from },
}))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { adminBillingOpsApi } from './adminSupabaseApi'
import { UserFacingError } from '../utils/userFacingError'

const ROW = {
    id: 'run-1',
    as_of: '2026-11-18T10:00:00Z',
    started_at: '2026-11-18T10:00:02Z',
    finished_at: null,
    trials_expired: 2,
    grace_started: 1,
    grace_expired: 0,
    reminders_created: 4,
    result: { secret: 'must-not-be-read' },
}

describe('adminBillingOpsApi.getSweepRuns', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.limit.mockResolvedValue({ data: [ROW], error: null })
        h.order.mockReturnValue({ limit: h.limit })
        h.select.mockReturnValue({ order: h.order })
        h.from.mockReturnValue({ select: h.select })
    })

    it('reads subscription_sweep_runs with a flat column list, newest first, limited to the requested count', async () => {
        await adminBillingOpsApi.getSweepRuns(20)
        expect(h.from).toHaveBeenCalledWith('subscription_sweep_runs')
        expect(h.select).toHaveBeenCalledWith(
            'id, as_of, started_at, finished_at, trials_expired, grace_started, grace_expired, reminders_created, failed, failures',
        )
        expect(h.order).toHaveBeenCalledWith('started_at', { ascending: false })
        expect(h.limit).toHaveBeenCalledWith(20)
    })

    it('never selects the result payload or any embedded relation', async () => {
        await adminBillingOpsApi.getSweepRuns()
        const columns = String(h.select.mock.calls[0][0])
        expect(columns).not.toContain('result')
        expect(columns).not.toContain('(')
    })

    it('maps rows to camelCase and never returns the result payload', async () => {
        const [run] = await adminBillingOpsApi.getSweepRuns()
        expect(run).toEqual({
            id: 'run-1',
            asOf: '2026-11-18T10:00:00Z',
            startedAt: '2026-11-18T10:00:02Z',
            finishedAt: null,
            trialsExpired: 2,
            graceStarted: 1,
            graceExpired: 0,
            remindersCreated: 4,
            failed: 0,
            failures: [],
        })
        expect(JSON.stringify(run)).not.toContain('must-not-be-read')
    })

    it('returns an empty list when there are no runs', async () => {
        h.limit.mockResolvedValue({ data: [], error: null })
        expect(await adminBillingOpsApi.getSweepRuns()).toEqual([])
    })

    it('hides the raw error behind a user-facing message', async () => {
        h.limit.mockResolvedValue({ data: null, error: { message: 'permission denied for table subscription_sweep_runs' } })
        const failure = adminBillingOpsApi.getSweepRuns()
        await expect(failure).rejects.toThrow('Unable to load sweep runs right now. Please try again.')
        await expect(adminBillingOpsApi.getSweepRuns()).rejects.toBeInstanceOf(UserFacingError)
    })

    it('pages with a range when an offset is given, keeping the same flat select and order', async () => {
        h.range.mockResolvedValue({ data: [ROW], error: null })
        h.order.mockReturnValue({ limit: h.limit, range: h.range })
        const runs = await adminBillingOpsApi.getSweepRuns(20, 40)
        expect(h.range).toHaveBeenCalledWith(40, 59)
        expect(h.limit).not.toHaveBeenCalled()
        expect(h.select).toHaveBeenCalledWith(
            'id, as_of, started_at, finished_at, trials_expired, grace_started, grace_expired, reminders_created, failed, failures',
        )
        expect(runs).toHaveLength(1)
        expect(runs[0].id).toBe('run-1')
    })
})
