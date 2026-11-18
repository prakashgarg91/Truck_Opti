import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ recordPing: vi.fn(), rpc: vi.fn() }))

vi.mock('./agencyTrackingApi', () => ({ agencyTrackingApi: { recordPing: h.recordPing } }))

vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() } }))

vi.mock('../lib/supabase', () => ({ supabase: { rpc: h.rpc } }))

import { driverTrackingApi } from './driverTrackingApi'

const SAMPLE = { lat: 19.07, lng: 72.87, speedKmph: 36, recordedAt: '2026-11-18T06:30:00.000Z' }

describe('driverTrackingApi.sendPing', () => {
    beforeEach(() => vi.clearAllMocks())

    it('maps the RPC arguments and reports ok', async () => {
        h.recordPing.mockResolvedValue({ ok: true, replay: false, pingId: 'x' })
        expect(await driverTrackingApi.sendPing('job-1', SAMPLE)).toEqual({ kind: 'ok' })
        expect(h.recordPing).toHaveBeenCalledWith({ jobId: 'job-1', lat: 19.07, lng: 72.87, speedKmph: 36, recordedAt: SAMPLE.recordedAt })
    })

    it('passes the typed refusal code through', async () => {
        h.recordPing.mockResolvedValue({ ok: false, error: 'rate_limited', message: 'slow down' })
        expect(await driverTrackingApi.sendPing('job-1', SAMPLE)).toEqual({ kind: 'refused', code: 'rate_limited' })
    })

    it('never throws: a transport failure becomes an error outcome', async () => {
        h.recordPing.mockRejectedValue(new Error('offline'))
        expect(await driverTrackingApi.sendPing('job-1', SAMPLE)).toEqual({ kind: 'error' })
    })
})

describe('driverTrackingApi.resolveAgencyJobId', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls driver_trip_agency_job with the offer id and returns the job id when sharing is possible', async () => {
        h.rpc.mockResolvedValue({
            data: { ok: true, job_id: 'agency-job-9', job_status: 'accepted', can_share_location: true },
            error: null,
        })
        expect(await driverTrackingApi.resolveAgencyJobId('offer-1')).toBe('agency-job-9')
        expect(h.rpc).toHaveBeenCalledWith('driver_trip_agency_job', { p_offer_id: 'offer-1' })
    })

    it('returns null when the agency cannot take location (can_share_location false)', async () => {
        h.rpc.mockResolvedValue({ data: { ok: true, job_id: 'agency-job-9', job_status: 'accepted', can_share_location: false }, error: null })
        expect(await driverTrackingApi.resolveAgencyJobId('offer-1')).toBeNull()
    })

    it.each(['not_found', 'not_assigned', 'job_not_active'])('returns null for the typed refusal %s', async (code) => {
        h.rpc.mockResolvedValue({ data: { ok: false, error: code }, error: null })
        expect(await driverTrackingApi.resolveAgencyJobId('offer-1')).toBeNull()
    })

    it('returns null for an RPC error, a malformed reply, a missing job id, or a thrown failure', async () => {
        h.rpc.mockResolvedValue({ data: null, error: { message: 'denied' } })
        expect(await driverTrackingApi.resolveAgencyJobId('offer-1')).toBeNull()
        h.rpc.mockResolvedValue({ data: null, error: null })
        expect(await driverTrackingApi.resolveAgencyJobId('offer-1')).toBeNull()
        h.rpc.mockResolvedValue({ data: { ok: true, can_share_location: true }, error: null })
        expect(await driverTrackingApi.resolveAgencyJobId('offer-1')).toBeNull()
        h.rpc.mockRejectedValue(new Error('boom'))
        expect(await driverTrackingApi.resolveAgencyJobId('offer-1')).toBeNull()
    })
})
