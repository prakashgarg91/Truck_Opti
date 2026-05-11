import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: rpcMock,
    },
}))

import {
    buildJobProgressStatePatch,
    persistDriverJobProgressRpc,
    type JobProgressResult,
} from './driverTripProgress'

describe('driverTripProgress', () => {
    beforeEach(() => {
        rpcMock.mockReset()
    })

    it('calls the progress RPC and normalizes array payloads', async () => {
        const progressResult: JobProgressResult = {
            job_offer_id: 'job_1',
            status: 'in_transit',
            pickup_arrived_at: '2026-05-11T10:00:00.000Z',
            journey_started_at: '2026-05-11T10:05:00.000Z',
            delivery_arrived_at: null,
            delivered_at: null,
            photo_loading_url: null,
            photo_delivery_url: null,
            total_trips: 12,
        }

        rpcMock.mockResolvedValue({
            data: [progressResult],
            error: null,
        })

        const result = await persistDriverJobProgressRpc({
            jobOfferId: 'job_1',
            newStatus: 'in_transit',
            extra: {
                journey_started_at: '2026-05-11T10:05:00.000Z',
            },
        })

        expect(rpcMock).toHaveBeenCalledWith('persist_driver_job_offer_progress', {
            p_job_offer_id: 'job_1',
            p_status: 'in_transit',
            p_extra: {
                journey_started_at: '2026-05-11T10:05:00.000Z',
            },
        })
        expect(result).toEqual({
            data: progressResult,
            error: null,
        })
    })

    it('builds a delivered-state patch that clears the active job', () => {
        const progressResult: JobProgressResult = {
            job_offer_id: 'job_1',
            status: 'delivered',
            pickup_arrived_at: '2026-05-11T10:00:00.000Z',
            journey_started_at: '2026-05-11T10:05:00.000Z',
            delivery_arrived_at: '2026-05-11T12:00:00.000Z',
            delivered_at: '2026-05-11T12:10:00.000Z',
            photo_loading_url: 'https://example.com/load.jpg',
            photo_delivery_url: 'https://example.com/delivery.jpg',
            total_trips: 13,
        }

        const patch = buildJobProgressStatePatch(progressResult)

        expect(patch.jobPatch).toEqual({
            status: 'delivered',
            pickup_arrived_at: '2026-05-11T10:00:00.000Z',
            journey_started_at: '2026-05-11T10:05:00.000Z',
            delivery_arrived_at: '2026-05-11T12:00:00.000Z',
            delivered_at: '2026-05-11T12:10:00.000Z',
            photo_loading_url: 'https://example.com/load.jpg',
            photo_delivery_url: 'https://example.com/delivery.jpg',
        })
        expect(patch.driverPatch).toEqual({
            active_job_id: null,
            total_trips: 13,
        })
    })

    it('preserves the active job for non-delivered states', () => {
        const patch = buildJobProgressStatePatch({
            job_offer_id: 'job_1',
            status: 'pickup_arrived',
            pickup_arrived_at: '2026-05-11T10:00:00.000Z',
            journey_started_at: null,
            delivery_arrived_at: null,
            delivered_at: null,
            photo_loading_url: null,
            photo_delivery_url: null,
            total_trips: 12,
        })

        expect(patch.driverPatch).toEqual({
            total_trips: 12,
        })
    })
})