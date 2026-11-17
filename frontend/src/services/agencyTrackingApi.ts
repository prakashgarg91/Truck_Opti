import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

/**
 * Agency trip tracking and incidents (TO-147): reads over RLS plus the SECURITY
 * DEFINER commands tracking_ping_record / agency_incident_open /
 * agency_incident_update / agency_trip_live of 20261020000000_agency_tracking.sql.
 *
 * Result contract (same as agencyConsignmentsApi): a business refusal is a typed
 * RESULT, never an exception; controlled database exceptions surface an approved
 * plain message; anything else collapses to the caller's fallback.
 * supabase.rpc / supabase.from are always called as client methods.
 */

export type JobStatus = 'pending' | 'accepted' | 'in_transit'
export type IncidentKind = 'long_halt' | 'overspeed' | 'route_deviation' | 'breakdown' | 'accident' | 'other'
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved'

export const INCIDENT_KINDS: readonly IncidentKind[] = ['long_halt', 'overspeed', 'route_deviation', 'breakdown', 'accident', 'other']

export interface ActiveJobRow {
    id: string
    status: JobStatus
    driver_id: string | null
    notes: string | null
    created_at: string
}

export interface PingRow {
    id: string
    job_id: string
    recorded_at: string
    lat: number
    lng: number
    speed_kmph: number | null
}

export interface IncidentRow {
    id: string
    job_id: string
    kind: IncidentKind
    status: IncidentStatus
    details: Record<string, unknown>
    version: number
    resolution_note: string | null
    created_at: string
    updated_at: string
}

export interface TripLive {
    lastPing: { recordedAt: string; lat: number; lng: number; speedKmph: number | null } | null
    pingCount: number
    openIncidents: number
}

export type TrackingErrorCode =
    | 'not_assigned'
    | 'not_found'
    | 'agency_not_operational'
    | 'job_not_active'
    | 'invalid_coordinates'
    | 'invalid_speed'
    | 'future_timestamp'
    | 'too_old'
    | 'ping_conflict'
    | 'ping_cap_reached'
    | 'rate_limited'
    | 'too_frequent'
    | 'invalid_kind'
    | 'dedupe_key_required'
    | 'dedupe_key_too_long'
    | 'invalid_details'
    | 'details_too_large'
    | 'idempotency_key_reused'
    | 'too_many_open_incidents'
    | 'invalid_status'
    | 'version_conflict'
    | 'illegal_transition'
    | 'note_required'
    | 'unknown'

type Refusal = { ok: false; error: TrackingErrorCode; message: string; currentVersion?: number }

export type PingResult = { ok: true; replay: boolean; pingId: string | null } | Refusal
export type OpenIncidentResult = { ok: true; replay: boolean; incidentId: string } | Refusal
export type UpdateIncidentResult = { ok: true; state: IncidentStatus; version: number } | Refusal
export type TripLiveResult = ({ ok: true } & TripLive) | Refusal

const ERROR_MESSAGES: Readonly<Record<Exclude<TrackingErrorCode, 'unknown'>, string>> = Object.freeze({
    not_assigned: 'You are not the driver assigned to this job.',
    not_found: 'This trip or incident could not be found. Reload to continue.',
    agency_not_operational: 'Your agency is not active right now, so this cannot be saved.',
    job_not_active: 'This job is no longer active, so location updates are closed.',
    invalid_coordinates: 'The location is not valid. Check the latitude and longitude.',
    invalid_speed: 'The speed is not valid. It must be between 0 and 250 km/h.',
    future_timestamp: 'The time of this location is in the future. Check the device clock.',
    too_old: 'This location is more than 24 hours old and was not saved.',
    ping_conflict: 'A different location was already saved for that exact time.',
    ping_cap_reached: 'This job has reached its limit of saved locations.',
    rate_limited: 'Too many location updates were sent in the last hour. Try again later.',
    too_frequent: 'Location updates are too close together. Wait a few seconds.',
    invalid_kind: 'Choose a valid incident type.',
    dedupe_key_required: 'This request could not be sent. Reload the page and try again.',
    dedupe_key_too_long: 'This request could not be sent. Reload the page and try again.',
    invalid_details: 'The incident details are not valid. Reload the page and try again.',
    details_too_large: 'The incident details are too long. Keep them under 500 characters.',
    idempotency_key_reused: 'This request was already used for something else. Try the action again.',
    too_many_open_incidents: 'This job already has 50 open incidents. Resolve some before adding more.',
    invalid_status: 'That update is not recognised. Reload the page and try again.',
    version_conflict: 'This incident changed. Reload to continue.',
    illegal_transition: 'That update is not allowed for this incident at its current stage.',
    note_required: 'Add a resolution note of 3 to 500 characters.',
})

/** Controlled RAISE EXCEPTION texts; anything else is redacted to the fallback. */
const CONTROLLED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'Agency approval is required.',
    'Your access scope does not allow this action.',
    'No agency profile found for this account.',
    'Multiple agency profiles found for this account.',
    'Sign-in is required.',
])

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(ERROR_MESSAGES))
const KIND_SET: ReadonlySet<string> = new Set(INCIDENT_KINDS)
const STATUS_SET: ReadonlySet<string> = new Set(['open', 'acknowledged', 'resolved'])

interface Envelope {
    ok?: unknown
    error?: unknown
    [key: string]: unknown
}

type RpcClient = {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: unknown } | null }>
}

async function callRpc(name: string, args: Record<string, unknown>, fallback: string): Promise<Envelope> {
    // Call as a method: the client's rpc() relies on `this`; a detached call crashes.
    const client = supabase as unknown as RpcClient
    const { data, error } = await client.rpc(name, args)
    if (error) {
        const message = error.message
        throw new UserFacingError(typeof message === 'string' && CONTROLLED_EXCEPTIONS.has(message) ? message : fallback)
    }
    const envelope = (Array.isArray(data) ? data[0] : data) as Envelope | null | undefined
    if (!envelope || typeof envelope.ok !== 'boolean') throw new UserFacingError(fallback)
    return envelope
}

function refusal(envelope: Envelope, fallback: string): Refusal {
    const raw = envelope.error
    const code: TrackingErrorCode = typeof raw === 'string' && KNOWN_CODES.has(raw) ? (raw as TrackingErrorCode) : 'unknown'
    return {
        ok: false,
        error: code,
        message: code === 'unknown' ? fallback : ERROR_MESSAGES[code as Exclude<TrackingErrorCode, 'unknown'>],
        ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
    }
}

const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
    return null
}

type Chain = {
    eq: (c: string, v: string) => Chain
    in: (c: string, v: string[]) => Chain
    order: (col: string, opts: { ascending: boolean }) => Chain
    limit: (n: number) => Promise<{ data: unknown; error: unknown }>
}

async function read<T>(
    table: string,
    columns: string,
    fallback: string,
    build: (q: Chain) => Promise<{ data: unknown; error: unknown }>
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => unknown } }
    const query = client.from(table).select(columns) as Chain
    const { data, error } = await build(query)
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

const PING_LIMIT = 100
const JOB_LIMIT = 50

function normalisePing(r: Record<string, unknown>): PingRow | null {
    const lat = num(r.lat)
    const lng = num(r.lng)
    if (typeof r.id !== 'string' || typeof r.recorded_at !== 'string' || lat === null || lng === null) return null
    return {
        id: r.id,
        job_id: String(r.job_id ?? ''),
        recorded_at: r.recorded_at,
        lat,
        lng,
        speed_kmph: num(r.speed_kmph),
    }
}

export const agencyTrackingApi = {
    /** Active jobs only (pending, accepted, in transit), newest first. */
    listActiveJobs: () =>
        read<ActiveJobRow>('agency_jobs', 'id,status,driver_id,notes,created_at', 'Failed to load active jobs', (q) =>
            q.in('status', ['pending', 'accepted', 'in_transit']).order('created_at', { ascending: false }).limit(JOB_LIMIT)
        ),

    /** Latest pings of one job, newest first. */
    async listPings(jobId: string): Promise<PingRow[]> {
        const rows = await read<Record<string, unknown>>(
            'agency_tracking_pings',
            'id,job_id,recorded_at,lat,lng,speed_kmph',
            'Failed to load locations',
            (q) => q.eq('job_id', jobId).order('recorded_at', { ascending: false }).limit(PING_LIMIT)
        )
        return rows.map(normalisePing).filter((p): p is PingRow => p !== null)
    },

    async listIncidents(jobId: string): Promise<IncidentRow[]> {
        const rows = await read<IncidentRow>(
            'agency_incidents',
            'id,job_id,kind,status,details,version,resolution_note,created_at,updated_at',
            'Failed to load incidents',
            (q) => q.eq('job_id', jobId).order('created_at', { ascending: false }).limit(200)
        )
        return rows.filter((r) => KIND_SET.has(r.kind) && STATUS_SET.has(r.status))
    },

    async getTripLive(jobId: string): Promise<TripLiveResult> {
        const fallback = 'Failed to load live trip data'
        const envelope = await callRpc('agency_trip_live', { p_job_id: jobId }, fallback)
        if (envelope.ok !== true) return refusal(envelope, fallback)
        const count = num(envelope.ping_count)
        const open = num(envelope.open_incidents)
        if (count === null || open === null) throw new UserFacingError(fallback)
        const raw = envelope.last_ping as Record<string, unknown> | null | undefined
        let lastPing: TripLive['lastPing'] = null
        if (raw && typeof raw === 'object') {
            const lat = num(raw.lat)
            const lng = num(raw.lng)
            if (typeof raw.recorded_at !== 'string' || lat === null || lng === null) throw new UserFacingError(fallback)
            lastPing = { recordedAt: raw.recorded_at, lat, lng, speedKmph: num(raw.speed_kmph) }
        }
        return { ok: true, lastPing, pingCount: count, openIncidents: open }
    },

    async recordPing(input: { jobId: string; lat: number; lng: number; speedKmph: number; recordedAt: string }): Promise<PingResult> {
        const fallback = 'Failed to save the location'
        const envelope = await callRpc(
            'tracking_ping_record',
            {
                p_job_id: input.jobId,
                p_lat: input.lat,
                p_lng: input.lng,
                p_speed_kmph: input.speedKmph,
                p_recorded_at: input.recordedAt,
            },
            fallback
        )
        if (envelope.ok === true) {
            return { ok: true, replay: envelope.replay === true, pingId: typeof envelope.ping_id === 'string' ? envelope.ping_id : null }
        }
        return refusal(envelope, fallback)
    },

    async openIncident(input: {
        jobId: string
        kind: IncidentKind
        details: Record<string, unknown>
        idempotencyKey: string
    }): Promise<OpenIncidentResult> {
        const fallback = 'Failed to open the incident'
        const envelope = await callRpc(
            'agency_incident_open',
            { p_job_id: input.jobId, p_kind: input.kind, p_details: input.details, p_dedupe_key: input.idempotencyKey },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.incident_id !== 'string') throw new UserFacingError(fallback)
            return { ok: true, replay: envelope.replay === true, incidentId: envelope.incident_id }
        }
        return refusal(envelope, fallback)
    },

    async updateIncident(input: {
        incidentId: string
        toStatus: 'acknowledged' | 'resolved'
        expectedVersion: number
        note?: string | null
    }): Promise<UpdateIncidentResult> {
        const fallback = 'Failed to update the incident'
        const envelope = await callRpc(
            'agency_incident_update',
            {
                p_incident_id: input.incidentId,
                p_to_status: input.toStatus,
                p_expected_version: input.expectedVersion,
                p_note: input.note ?? null,
            },
            fallback
        )
        if (envelope.ok === true) {
            const { state, version } = envelope
            if (typeof state === 'string' && STATUS_SET.has(state) && typeof version === 'number') {
                return { ok: true, state: state as IncidentStatus, version }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },
}
