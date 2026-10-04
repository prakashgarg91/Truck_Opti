import { supabase } from '../lib/supabase'

/** Server result codes for the trip progress RPC (TO-130). */
export const JOB_PROGRESS_RESULT_OK = 'OK'
export const JOB_PROGRESS_RESULT_OTP_INCORRECT = 'OTP_INCORRECT'
export const JOB_PROGRESS_RESULT_OTP_LOCKED = 'OTP_LOCKED'

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
    /** Server-authoritative outcome: OK, OTP_INCORRECT or OTP_LOCKED. */
    result_code: string
    /** Remaining guesses for the code used in this call, when applicable. */
    otp_attempts_remaining: number | null
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

/**
 * True only for the server's explicit success code. Anything else (including
 * an empty payload) is a rejection: the OTP failure path returns the unchanged
 * row with a non-OK code so its durable attempt counter survives.
 */
export function isJobProgressOk(result: JobProgressResult | null): boolean {
    return !!result && result.result_code === JOB_PROGRESS_RESULT_OK
}

/** Bounded user-facing copy for server rejections (raw server text never shown). */
export function resolveJobProgressFailureMessage(result: JobProgressResult | null): string {
    if (!result) {
        return 'Failed to update trip status.'
    }

    switch (result.result_code) {
        case JOB_PROGRESS_RESULT_OTP_INCORRECT:
            return typeof result.otp_attempts_remaining === 'number' && result.otp_attempts_remaining > 0
                ? `Incorrect OTP. ${result.otp_attempts_remaining} attempt${result.otp_attempts_remaining === 1 ? '' : 's'} remaining.`
                : 'Incorrect OTP.'
        case JOB_PROGRESS_RESULT_OTP_LOCKED:
            return 'Too many incorrect OTP attempts. Please try again in 15 minutes.'
        default:
            return 'Failed to update trip status.'
    }
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
