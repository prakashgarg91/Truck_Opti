import { supabase } from '../lib/supabase'

export interface JobProgressResult {
    job_offer_id: string
    status: string
    pickup_arrived_at: string | null
    journey_started_at: string | null
    delivery_arrived_at: string | null
    delivered_at: string | null
    photo_loading_url: string | null
    photo_delivery_url: string | null
    total_trips: number
}

interface PersistDriverJobProgressParams {
    jobOfferId: string
    newStatus?: string | null
    extra?: Record<string, unknown>
}

interface JobProgressStatePatch {
    jobPatch: Pick<
        JobProgressResult,
        | 'status'
        | 'pickup_arrived_at'
        | 'journey_started_at'
        | 'delivery_arrived_at'
        | 'delivered_at'
        | 'photo_loading_url'
        | 'photo_delivery_url'
    >
    driverPatch: {
        total_trips: number
        active_job_id?: null
    }
}

export function normalizeJobProgressResult(data: unknown): JobProgressResult | null {
    const result = Array.isArray(data) ? data[0] : data
    return (result as JobProgressResult | null) ?? null
}

export async function persistDriverJobProgressRpc({
    jobOfferId,
    newStatus = null,
    extra = {},
}: PersistDriverJobProgressParams): Promise<{ data: JobProgressResult | null; error: unknown }> {
    const { data, error } = await supabase.rpc('persist_driver_job_offer_progress', {
        p_job_offer_id: jobOfferId,
        p_status: newStatus,
        p_extra: extra,
    })

    return {
        data: normalizeJobProgressResult(data),
        error,
    }
}

export function buildJobProgressStatePatch(result: JobProgressResult): JobProgressStatePatch {
    const driverPatch: JobProgressStatePatch['driverPatch'] = {
        total_trips: result.total_trips,
    }

    if (result.status === 'delivered') {
        driverPatch.active_job_id = null
    }

    return {
        jobPatch: {
            status: result.status,
            pickup_arrived_at: result.pickup_arrived_at,
            journey_started_at: result.journey_started_at,
            delivery_arrived_at: result.delivery_arrived_at,
            delivered_at: result.delivered_at,
            photo_loading_url: result.photo_loading_url,
            photo_delivery_url: result.photo_delivery_url,
        },
        driverPatch,
    }
}