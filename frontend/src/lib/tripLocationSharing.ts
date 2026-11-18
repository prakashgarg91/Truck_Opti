/**
 * Pure scheduling logic for the opt-in "share live location with your agency"
 * feature of the driver trip page. No React, no timers, no browser APIs: the
 * caller feeds in positions, asks whether a ping is due, and reports the
 * outcome of the send. Everything is a plain function over an immutable state
 * so it can be tested without a device.
 *
 * Server contract (tracking_ping_record, 20261020000000_agency_tracking.sql):
 * only the actively employed, assigned driver, active job only, at least 2 s
 * between distinct recorded_at values, 120 pings per job per hour (server
 * clock), typed refusals rate_limited / too_frequent / ping_conflict /
 * not_assigned / job_not_active / invalid_coordinates / future_timestamp /
 * too_old.
 *
 * Rules implemented here:
 *  - at most one ping per PING_INTERVAL_MS (60 s => 60 per hour, half the cap);
 *  - only the LATEST position is ever held; an older unsent one is replaced;
 *  - recorded_at always comes from the Geolocation position timestamp;
 *  - back-off on rate_limited / too_frequent / transient failures;
 *  - permanent stop on job_not_active / not_assigned / not_found /
 *    agency_not_operational / ping_cap_reached;
 *  - nothing is persisted anywhere on the device.
 */

/** Minimum gap between two sent pings while sharing. */
export const PING_INTERVAL_MS = 60_000
/** Server counts pings per rolling hour; wait out a good part of it. */
export const RATE_LIMITED_BACKOFF_MS = 10 * 60_000
/** too_frequent means our spacing was too tight: widen it. */
export const TOO_FREQUENT_BACKOFF_MS = 2 * PING_INTERVAL_MS
/** Transient failure back-off: PING_INTERVAL_MS * 2^n, capped. */
export const MAX_TRANSIENT_BACKOFF_MS = 5 * 60_000

/** Error codes that end sharing for the rest of the trip. */
export const PERMANENT_STOP_CODES: ReadonlySet<string> = new Set([
    'job_not_active',
    'not_assigned',
    'not_found',
    'agency_not_operational',
    'ping_cap_reached',
])

/** Codes where the sample itself was bad: drop it and try the next one. */
const DROP_SAMPLE_CODES: ReadonlySet<string> = new Set([
    'invalid_coordinates',
    'invalid_speed',
    'future_timestamp',
    'too_old',
    'ping_conflict',
])

export interface PingSample {
    lat: number
    lng: number
    /** km/h, 0 to 250 */
    speedKmph: number
    /** ISO time taken from the Geolocation position, never from Date.now() */
    recordedAt: string
}

export type PingOutcome =
    | { kind: 'ok' }
    | { kind: 'refused'; code: string }
    | { kind: 'error' }

export type StopReason = 'job_not_active' | 'not_assigned' | 'unavailable'

export interface SchedulerState {
    /** Newest unsent position, or null. Never more than one. */
    latest: PingSample | null
    /** recordedAt of the last sample handed to send, to avoid ping_conflict. */
    lastSentRecordedAt: string | null
    /** Earliest time (ms epoch) the next ping may be sent. */
    nextAllowedAt: number
    inFlight: boolean
    consecutiveFailures: number
    stopped: StopReason | null
    /** Last successful send, ms epoch. */
    lastOkAt: number | null
}

export function createSchedulerState(): SchedulerState {
    return {
        latest: null,
        lastSentRecordedAt: null,
        nextAllowedAt: 0,
        inFlight: false,
        consecutiveFailures: 0,
        stopped: null,
        lastOkAt: null,
    }
}

/** Minimal slice of the browser GeolocationPosition we rely on. */
export interface PositionLike {
    coords: { latitude: number; longitude: number; speed: number | null }
    timestamp: number
}

/**
 * Converts a browser position into a ping sample, or null when it is unusable.
 * Unknown speed is sent as 0 (the server rejects null); speed is clamped to the
 * server range.
 */
export function positionToSample(position: PositionLike): PingSample | null {
    const { latitude, longitude, speed } = position.coords
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
    if (!Number.isFinite(position.timestamp)) return null
    const kmph = typeof speed === 'number' && Number.isFinite(speed) && speed > 0 ? speed * 3.6 : 0
    const clamped = Math.min(250, Math.max(0, Math.round(kmph * 10) / 10))
    return {
        lat: latitude,
        lng: longitude,
        speedKmph: clamped,
        recordedAt: new Date(position.timestamp).toISOString(),
    }
}

/** Remember the newest position; replaces any unsent older one. */
export function offerSample(state: SchedulerState, sample: PingSample): SchedulerState {
    if (state.stopped) return state
    if (sample.recordedAt === state.lastSentRecordedAt) return state
    if (state.latest && state.latest.recordedAt > sample.recordedAt) return state
    return { ...state, latest: sample }
}

export function isPingDue(state: SchedulerState, now: number): boolean {
    return !state.stopped && !state.inFlight && state.latest !== null && now >= state.nextAllowedAt
}

/** Takes the pending sample for sending. Marks the state in flight. */
export function takeDueSample(
    state: SchedulerState,
    now: number
): { state: SchedulerState; sample: PingSample } | null {
    if (!isPingDue(state, now) || !state.latest) return null
    const sample = state.latest
    return {
        sample,
        state: { ...state, latest: null, inFlight: true, lastSentRecordedAt: sample.recordedAt },
    }
}

/** Applies the result of a send. */
export function applyOutcome(state: SchedulerState, outcome: PingOutcome, now: number): SchedulerState {
    const settled: SchedulerState = { ...state, inFlight: false }
    if (outcome.kind === 'ok') {
        return { ...settled, consecutiveFailures: 0, nextAllowedAt: now + PING_INTERVAL_MS, lastOkAt: now }
    }
    if (outcome.kind === 'refused') {
        const code = outcome.code
        if (code === 'job_not_active') return { ...settled, latest: null, stopped: 'job_not_active' }
        if (code === 'not_assigned' || code === 'not_found' || code === 'agency_not_operational' || code === 'ping_cap_reached') {
            return { ...settled, latest: null, stopped: code === 'not_assigned' || code === 'not_found' ? 'not_assigned' : 'unavailable' }
        }
        if (code === 'rate_limited') {
            return { ...settled, nextAllowedAt: now + RATE_LIMITED_BACKOFF_MS }
        }
        if (code === 'too_frequent') {
            return { ...settled, nextAllowedAt: now + TOO_FREQUENT_BACKOFF_MS }
        }
        if (DROP_SAMPLE_CODES.has(code)) {
            return { ...settled, nextAllowedAt: now + PING_INTERVAL_MS }
        }
    }
    // Unknown refusal or transport/transient failure: exponential back-off.
    const failures = settled.consecutiveFailures + 1
    const wait = Math.min(MAX_TRANSIENT_BACKOFF_MS, PING_INTERVAL_MS * 2 ** (failures - 1))
    return { ...settled, consecutiveFailures: failures, nextAllowedAt: now + wait }
}

/** Trip statuses (job_offers.status) in which sharing may run. */
const SHARING_TRIP_STATUSES: ReadonlySet<string> = new Set([
    'accepted',
    'pickup_arrived',
    'in_transit',
    'delivery_arrived',
])

export function isTripActiveForSharing(status: string | null | undefined): boolean {
    return !!status && SHARING_TRIP_STATUSES.has(status)
}

/** Calm, plain messages for each way sharing can end or fail to start. */
export const SHARING_MESSAGES = {
    permissionDenied: 'Location permission is blocked, so nothing is being shared. You can allow it in your browser settings and try again.',
    unavailable: 'Your location is not available right now. Sharing will continue when a GPS signal returns.',
    timeout: 'Still waiting for a GPS signal. Sharing will continue when one arrives.',
    unsupported: 'This device or browser cannot share location.',
    notAvailableForTrip: 'Live location sharing is not available for this trip.',
    tripEnded: 'This trip is no longer active, so location sharing has stopped.',
    notAssigned: 'You are not the assigned driver for this job, so location sharing has stopped.',
    agencyUnavailable: 'Your agency cannot receive location updates right now, so sharing has stopped.',
} as const

export function messageForStop(reason: StopReason): string {
    if (reason === 'job_not_active') return SHARING_MESSAGES.tripEnded
    if (reason === 'not_assigned') return SHARING_MESSAGES.notAssigned
    return SHARING_MESSAGES.agencyUnavailable
}
