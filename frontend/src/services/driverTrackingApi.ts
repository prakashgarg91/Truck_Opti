import { supabase } from '../lib/supabase'
import { agencyTrackingApi } from './agencyTrackingApi'
import type { PingOutcome, PingSample } from '../lib/tripLocationSharing'
import { logger } from '../utils/logger'

/**
 * Driver-side wrapper around the agency tracking RPC tracking_ping_record.
 *
 * Note on ids: tracking_ping_record takes an agency_jobs.id, while the driver
 * trip page works with a job_offers.id. Drivers cannot read agency_jobs under
 * RLS, so the id is resolved by the server RPC driver_trip_agency_job, which
 * answers only for the calling driver's own offer. Anything other than an
 * explicit "ok and can_share_location" yields null; the UI treats null as
 * "sharing not available for this trip" and never guesses.
 */

type RpcClient = {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
}

export const driverTrackingApi = {
    /**
     * Resolves the agency job for this offer through driver_trip_agency_job.
     * Returns null for every refusal (not_found, not_assigned, job_not_active),
     * when the agency cannot take location, and on any failure.
     */
    async resolveAgencyJobId(offerId: string): Promise<string | null> {
        // Called as a client method (the client relies on `this`).
        const client = supabase as unknown as RpcClient
        try {
            const { data, error } = await client.rpc('driver_trip_agency_job', { p_offer_id: offerId })
            if (error) return null
            const envelope = (Array.isArray(data) ? data[0] : data) as
                | { ok?: unknown; job_id?: unknown; can_share_location?: unknown }
                | null
                | undefined
            if (!envelope || envelope.ok !== true || envelope.can_share_location !== true) return null
            return typeof envelope.job_id === 'string' && envelope.job_id ? envelope.job_id : null
        } catch (error) {
            logger.error('[driverTrackingApi] agency job lookup failed', error)
            return null
        }
    },

    /** Sends one ping through tracking_ping_record; never throws. */
    async sendPing(agencyJobId: string, sample: PingSample): Promise<PingOutcome> {
        try {
            const result = await agencyTrackingApi.recordPing({
                jobId: agencyJobId,
                lat: sample.lat,
                lng: sample.lng,
                speedKmph: sample.speedKmph,
                recordedAt: sample.recordedAt,
            })
            if (result.ok) return { kind: 'ok' }
            return { kind: 'refused', code: result.error }
        } catch (error) {
            logger.error('[driverTrackingApi] ping failed', error)
            return { kind: 'error' }
        }
    },
}
