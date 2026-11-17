import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

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

import { agencyTrackingApi } from './agencyTrackingApi'
import { UserFacingError } from '../utils/userFacingError'

function mockChain(rows: unknown, error: unknown = null) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error })
    const chain: Record<string, unknown> = {}
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.in = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = limit
    const select = vi.fn().mockReturnValue(chain)
    fromMock.mockReturnValue({ select })
    return { select, chain, limit }
}

describe('agencyTrackingApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('reads', () => {
        it('lists active jobs only', async () => {
            const { chain, select } = mockChain([{ id: 'j-1' }])
            const rows = await agencyTrackingApi.listActiveJobs()
            expect(fromMock).toHaveBeenCalledWith('agency_jobs')
            expect(select).toHaveBeenCalledWith('id,status,driver_id,notes,created_at')
            expect(chain.in).toHaveBeenCalledWith('status', ['pending', 'accepted', 'in_transit'])
            expect(rows).toEqual([{ id: 'j-1' }])
        })

        it('lists pings newest first and coerces numeric strings, dropping malformed rows', async () => {
            const { chain } = mockChain([
                { id: 'p-1', job_id: 'j-1', recorded_at: '2026-11-10T10:00:00Z', lat: '28.6139', lng: 77.209, speed_kmph: null },
                { id: 'p-2', job_id: 'j-1', recorded_at: '2026-11-10T09:00:00Z', lat: 'bad', lng: 77, speed_kmph: 10 },
            ])
            const rows = await agencyTrackingApi.listPings('j-1')
            expect(fromMock).toHaveBeenCalledWith('agency_tracking_pings')
            expect(chain.eq).toHaveBeenCalledWith('job_id', 'j-1')
            expect(chain.order).toHaveBeenCalledWith('recorded_at', { ascending: false })
            expect(rows).toEqual([{ id: 'p-1', job_id: 'j-1', recorded_at: '2026-11-10T10:00:00Z', lat: 28.6139, lng: 77.209, speed_kmph: null }])
        })

        it('lists incidents and drops rows with unknown kind or status', async () => {
            mockChain([
                { id: 'i-1', kind: 'breakdown', status: 'open' },
                { id: 'i-2', kind: 'weird', status: 'open' },
                { id: 'i-3', kind: 'other', status: 'weird' },
            ])
            const rows = await agencyTrackingApi.listIncidents('j-1')
            expect(fromMock).toHaveBeenCalledWith('agency_incidents')
            expect(rows.map((r) => r.id)).toEqual(['i-1'])
        })

        it('turns a read error into a plain message', async () => {
            mockChain(null, { message: 'permission denied for table x' })
            await expect(agencyTrackingApi.listPings('j-1')).rejects.toThrow('Failed to load locations')
            await expect(agencyTrackingApi.listIncidents('j-1')).rejects.toThrow('Failed to load incidents')
            await expect(agencyTrackingApi.listActiveJobs()).rejects.toThrow('Failed to load active jobs')
        })
    })

    describe('getTripLive', () => {
        it('sends the exact args and returns typed data', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, last_ping: { recorded_at: '2026-11-10T10:00:00Z', lat: 12.5, lng: '77.5', speed_kmph: 40, driver_id: 'd' }, ping_count: 3, open_incidents: 1 },
                error: null,
            })
            const result = await agencyTrackingApi.getTripLive('j-1')
            expect(rpcMock).toHaveBeenCalledWith('agency_trip_live', { p_job_id: 'j-1' })
            expect(result).toEqual({
                ok: true,
                lastPing: { recordedAt: '2026-11-10T10:00:00Z', lat: 12.5, lng: 77.5, speedKmph: 40 },
                pingCount: 3,
                openIncidents: 1,
            })
        })

        it('allows a job with no pings', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, last_ping: null, ping_count: 0, open_incidents: 0 }, error: null })
            expect(await agencyTrackingApi.getTripLive('j-1')).toMatchObject({ ok: true, lastPing: null, pingCount: 0 })
        })

        it('maps not_found and rejects malformed payloads', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'not_found' }, error: null })
            expect(await agencyTrackingApi.getTripLive('j-1')).toMatchObject({ ok: false, error: 'not_found' })
            rpcMock.mockResolvedValueOnce({ data: { ok: true, ping_count: 'x', open_incidents: 0 }, error: null })
            await expect(agencyTrackingApi.getTripLive('j-1')).rejects.toBeInstanceOf(UserFacingError)
            rpcMock.mockResolvedValueOnce({ data: { ok: true, last_ping: { lat: 1 }, ping_count: 1, open_incidents: 0 }, error: null })
            await expect(agencyTrackingApi.getTripLive('j-1')).rejects.toBeInstanceOf(UserFacingError)
        })
    })

    describe('recordPing', () => {
        const input = { jobId: 'j-1', lat: 1, lng: 2, speedKmph: 30, recordedAt: '2026-11-10T10:00:00Z' }

        it('sends the exact args', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, replay: false, ping_id: 'p-1' }, error: null })
            const result = await agencyTrackingApi.recordPing(input)
            expect(rpcMock).toHaveBeenCalledWith('tracking_ping_record', {
                p_job_id: 'j-1', p_lat: 1, p_lng: 2, p_speed_kmph: 30, p_recorded_at: '2026-11-10T10:00:00Z',
            })
            expect(result).toEqual({ ok: true, replay: false, pingId: 'p-1' })
        })

        it.each([
            ['not_assigned', /not the driver/],
            ['not_found', /could not be found/],
            ['agency_not_operational', /not active/],
            ['job_not_active', /no longer active/],
            ['invalid_coordinates', /latitude/],
            ['invalid_speed', /speed/],
            ['future_timestamp', /future/],
            ['too_old', /24 hours/],
            ['ping_conflict', /different location/],
            ['ping_cap_reached', /limit/],
            ['rate_limited', /Too many/],
            ['too_frequent', /too close/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyTrackingApi.recordPing(input)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })
    })

    describe('openIncident', () => {
        const input = { jobId: 'j-1', kind: 'breakdown' as const, details: { note: 'Tyre burst' }, idempotencyKey: 'k-1' }

        it('sends the exact args, using the key as dedupe key', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, replay: false, incident_id: 'i-1', version: 1 }, error: null })
            const result = await agencyTrackingApi.openIncident(input)
            expect(rpcMock).toHaveBeenCalledWith('agency_incident_open', {
                p_job_id: 'j-1', p_kind: 'breakdown', p_details: { note: 'Tyre burst' }, p_dedupe_key: 'k-1',
            })
            expect(result).toEqual({ ok: true, replay: false, incidentId: 'i-1' })
        })

        it('flags a replay and rejects a success without an id', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: true, replay: true, incident_id: 'i-1' }, error: null })
            expect(await agencyTrackingApi.openIncident(input)).toMatchObject({ ok: true, replay: true })
            rpcMock.mockResolvedValueOnce({ data: { ok: true }, error: null })
            await expect(agencyTrackingApi.openIncident(input)).rejects.toThrow('Failed to open the incident')
        })

        it.each([
            ['invalid_kind', /valid incident type/],
            ['dedupe_key_required', /Reload the page/],
            ['dedupe_key_too_long', /Reload the page/],
            ['invalid_details', /not valid/],
            ['details_too_large', /too long/],
            ['not_found', /could not be found/],
            ['idempotency_key_reused', /already used/],
            ['too_many_open_incidents', /50 open/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyTrackingApi.openIncident(input)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })
    })

    describe('updateIncident', () => {
        it('sends the exact args and returns the new state', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'resolved', version: 3 }, error: null })
            const result = await agencyTrackingApi.updateIncident({ incidentId: 'i-1', toStatus: 'resolved', expectedVersion: 2, note: 'Tyre changed' })
            expect(rpcMock).toHaveBeenCalledWith('agency_incident_update', {
                p_incident_id: 'i-1', p_to_status: 'resolved', p_expected_version: 2, p_note: 'Tyre changed',
            })
            expect(result).toEqual({ ok: true, state: 'resolved', version: 3 })
        })

        it('sends a null note when none is given', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'acknowledged', version: 2 }, error: null })
            await agencyTrackingApi.updateIncident({ incidentId: 'i-1', toStatus: 'acknowledged', expectedVersion: 1 })
            expect(rpcMock).toHaveBeenCalledWith('agency_incident_update', expect.objectContaining({ p_note: null }))
        })

        it.each([
            ['invalid_status', /not recognised/],
            ['not_found', /could not be found/],
            ['version_conflict', /changed/],
            ['illegal_transition', /not allowed/],
            ['note_required', /3 to 500/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code, current_version: 5 }, error: null })
            const result = await agencyTrackingApi.updateIncident({ incidentId: 'i-1', toStatus: 'resolved', expectedVersion: 1, note: 'abc' })
            expect(result).toMatchObject({ ok: false, error: code, currentVersion: 5 })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('maps an unknown refusal to the fallback and rejects a malformed success', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyTrackingApi.updateIncident({ incidentId: 'i', toStatus: 'acknowledged', expectedVersion: 1 })).toEqual({
                ok: false, error: 'unknown', message: 'Failed to update the incident',
            })
            rpcMock.mockResolvedValueOnce({ data: { ok: true, state: 'bogus', version: 2 }, error: null })
            await expect(agencyTrackingApi.updateIncident({ incidentId: 'i', toStatus: 'acknowledged', expectedVersion: 1 })).rejects.toBeInstanceOf(UserFacingError)
        })
    })

    describe('exceptions and envelopes', () => {
        it('surfaces approved exceptions and redacts the rest', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Agency approval is required.' } })
            await expect(agencyTrackingApi.getTripLive('j')).rejects.toThrow('Agency approval is required.')
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist' } })
            await expect(agencyTrackingApi.getTripLive('j')).rejects.toThrow('Failed to load live trip data')
        })

        it('rejects a malformed envelope and accepts a one-row array', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: null })
            await expect(agencyTrackingApi.openIncident({ jobId: 'j', kind: 'other', details: {}, idempotencyKey: 'k' })).rejects.toBeInstanceOf(UserFacingError)
            rpcMock.mockResolvedValueOnce({ data: [{ ok: true, last_ping: null, ping_count: 0, open_incidents: 0 }], error: null })
            expect(await agencyTrackingApi.getTripLive('j')).toMatchObject({ ok: true })
        })
    })
})
