import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

/**
 * Agency ERP connections (TO-151): reads over RLS plus the SECURITY DEFINER commands
 * agency_erp_connection_create / _set_status / _rotate_secret of
 * 20261024000000_agency_erp_connector.sql.
 *
 * Result contract (same as agencyConsignmentsApi): a business refusal is a typed RESULT, never an
 * exception; controlled database exceptions surface an approved plain message; anything else
 * collapses to the caller's fallback. supabase.rpc / supabase.from are always called as client
 * methods.
 *
 * SECRET HANDLING: create and rotate return the plaintext secret exactly once. It is only ever
 * placed in the typed result; it is never logged and never put in an error message. secret_hash
 * is never selectable and is never named in a select list here.
 */

export type ConnectionKind = 'csv_drop' | 'webhook'
export type ConnectionStatus = 'active' | 'paused' | 'revoked'
export type EventOutcome = 'accepted' | 'rejected' | 'duplicate'

export interface ConnectionRow {
    id: string
    agreement_id: string
    client_id: string
    name: string
    kind: ConnectionKind
    status: ConnectionStatus
    secret_hint: string
    version: number
    created_at: string
}

export interface ErpEventRow {
    id: string
    connection_id: string
    external_event_id: string
    outcome: EventOutcome
    problems: unknown
    batch_id: string | null
    received_at: string
}

export interface AgreementOption {
    id: string
    client_name: string
    status: string
}

export type ErpErrorCode =
    | 'idempotency_key_reused'
    | 'name_required'
    | 'invalid_kind'
    | 'client_not_found'
    | 'agreement_not_found'
    | 'agreement_not_active'
    | 'name_exists'
    | 'invalid_status'
    | 'connection_not_found'
    | 'connection_revoked'
    | 'version_conflict'
    | 'illegal_transition'
    | 'unknown'

type Refusal = { ok: false; error: ErpErrorCode; message: string; currentVersion?: number }

export type CreateConnectionResult =
    // secret is null on an idempotent replay: it was shown once already and cannot be recovered.
    | { ok: true; replay: boolean; connectionId: string; secret: string | null }
    | Refusal

export type SetStatusResult = { ok: true; status: ConnectionStatus; version: number } | Refusal
export type RotateResult = { ok: true; secret: string; version: number } | Refusal

const ERROR_MESSAGES: Readonly<Record<Exclude<ErpErrorCode, 'unknown'>, string>> = Object.freeze({
    idempotency_key_reused: 'This request was already used for something else. Try the action again.',
    name_required: 'Enter a connection name of up to 60 characters.',
    invalid_kind: 'Choose CSV drop or Webhook.',
    client_not_found: 'This client could not be found. Reload to continue.',
    agreement_not_found: 'This client agreement could not be found. Reload to continue.',
    agreement_not_active: 'This client agreement has ended, so it cannot have a new connection.',
    name_exists: 'A connection with this name already exists. Choose a different name.',
    invalid_status: 'That status is not recognised. Reload the page and try again.',
    connection_not_found: 'This connection could not be found. Reload to continue.',
    connection_revoked: 'This connection was revoked and can no longer be changed.',
    version_conflict: 'This connection changed. Reload to continue.',
    illegal_transition: 'That change is not allowed for this connection.',
})

/** Controlled RAISE EXCEPTION texts; anything else is redacted to the fallback. */
const CONTROLLED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'Agency approval is required.',
    'Your access scope does not allow this action.',
    'No agency profile found for this account.',
    'Multiple agency profiles found for this account.',
    'Sign-in is required.',
    'Idempotency key is required.',
])

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(ERROR_MESSAGES))
const STATUSES: ReadonlySet<string> = new Set(['active', 'paused', 'revoked'])

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
    const code: ErpErrorCode = typeof raw === 'string' && KNOWN_CODES.has(raw) ? (raw as ErpErrorCode) : 'unknown'
    return {
        ok: false,
        error: code,
        message: code === 'unknown' ? fallback : ERROR_MESSAGES[code],
        ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
    }
}

type Orderable = { order: (col: string, opts: { ascending: boolean }) => unknown }
type Limitable = { limit: (n: number) => unknown }

async function readOrdered<T>(
    table: string,
    columns: string,
    orderBy: string,
    fallback: string,
    filter?: (query: unknown) => unknown,
    limit?: number
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => unknown } }
    let query = client.from(table).select(columns)
    if (filter) query = filter(query)
    let ordered: unknown = (query as Orderable).order(orderBy, { ascending: false })
    if (limit !== undefined) ordered = (ordered as Limitable).limit(limit)
    const { data, error } = (await ordered) as { data: unknown; error: unknown }
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

const eq = (column: string, value: string) => (q: unknown) =>
    (q as { eq: (c: string, v: string) => unknown }).eq(column, value)

// secret_hash and idempotency_key are deliberately NOT listed: the secret hash is never selectable.
const CONNECTION_COLUMNS = 'id,agreement_id,client_id,name,kind,status,secret_hint,version,created_at'
const EVENT_COLUMNS = 'id,connection_id,external_event_id,outcome,problems,batch_id,received_at'
const AGREEMENT_COLUMNS = 'id,client_name,status'
export const EVENT_LIMIT = 100
export const RECENT_EVENT_LIMIT = 200

export const agencyErpApi = {
    listConnections: () =>
        readOrdered<ConnectionRow>('agency_erp_connections', CONNECTION_COLUMNS, 'created_at', 'Failed to load connections'),

    listAgreements: () =>
        readOrdered<AgreementOption>('agency_client_agreements', AGREEMENT_COLUMNS, 'created_at', 'Failed to load client agreements'),

    /** Newest events across all connections; the page derives each connection's last event from it. */
    listRecentEvents: () =>
        readOrdered<ErpEventRow>(
            'agency_erp_events',
            EVENT_COLUMNS,
            'received_at',
            'Failed to load connection events',
            undefined,
            RECENT_EVENT_LIMIT
        ),

    listEvents: (connectionId: string) =>
        readOrdered<ErpEventRow>(
            'agency_erp_events',
            EVENT_COLUMNS,
            'received_at',
            'Failed to load connection events',
            eq('connection_id', connectionId),
            EVENT_LIMIT
        ),

    async createConnection(input: {
        agreementId: string
        name: string
        kind: ConnectionKind
        idempotencyKey: string
    }): Promise<CreateConnectionResult> {
        const fallback = 'Failed to create the connection'
        const envelope = await callRpc(
            'agency_erp_connection_create',
            {
                // The client is identified by its agreement: both ids reference the same agreement row.
                p_client_id: input.agreementId,
                p_agreement_id: input.agreementId,
                p_name: input.name,
                p_kind: input.kind,
                p_idempotency_key: input.idempotencyKey,
            },
            fallback
        )
        if (envelope.ok === true) {
            const { connection_id: id, secret } = envelope
            if (typeof id === 'string' && (secret === null || secret === undefined || (typeof secret === 'string' && secret.length > 0))) {
                return { ok: true, replay: envelope.replay === true, connectionId: id, secret: typeof secret === 'string' ? secret : null }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },

    async setStatus(connectionId: string, toStatus: ConnectionStatus, expectedVersion: number): Promise<SetStatusResult> {
        const fallback = 'Failed to change the connection'
        const envelope = await callRpc(
            'agency_erp_connection_set_status',
            { p_connection_id: connectionId, p_to_status: toStatus, p_expected_version: expectedVersion },
            fallback
        )
        if (envelope.ok === true) {
            const { status, version } = envelope
            if (typeof status === 'string' && STATUSES.has(status) && typeof version === 'number') {
                return { ok: true, status: status as ConnectionStatus, version }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },

    async rotateSecret(connectionId: string, expectedVersion: number): Promise<RotateResult> {
        const fallback = 'Failed to rotate the secret'
        const envelope = await callRpc(
            'agency_erp_connection_rotate_secret',
            { p_connection_id: connectionId, p_expected_version: expectedVersion },
            fallback
        )
        if (envelope.ok === true) {
            const { secret, version } = envelope
            if (typeof secret === 'string' && secret.length > 0 && typeof version === 'number') {
                return { ok: true, secret, version }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },
}
