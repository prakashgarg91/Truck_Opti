import { supabase } from '../lib/supabase'
import { UserFacingError, reportFunctionFailure, resolveFunctionUserMessage } from '../utils/userFacingError'

// ============= TYPES =============
export interface AgencyJob {
    id: string
    shipment_id: string
    status: string
    fare: number
    driver_id?: string
    created_at: string
    updated_at: string
    shipments?: {
        shipment_id: string
        origin: string
        destination: string
        total_weight: number
        estimated_cost: number
    }[]
}

export interface FleetTruck {
    id: string
    vehicle_type: string
    rc_number: string
    insurance_expiry: string | null
    fitness_expiry: string | null
    permit_expiry: string | null
    is_available: boolean
    driver_id: string | null
    agency_id: string
}

export interface BillingSummary {
    thisMonth: number
    pending: number
    totalPaid: number
    gstDue: number
}

export interface DeliveredJob {
    id: string
    fare: number
    origin: string
    destination: string
    updated_at: string
    shipment_id: string
}

export interface RateCard {
    id: string
    agency_id: string
    vehicle_type: string
    origin_city: string
    dest_city: string
    rate_per_km: number | null
    flat_rate: number | null
    min_weight_kg: number | null
    max_weight_kg: number | null
    is_active: boolean
    valid_from: string | null
    valid_until: string | null
    notes: string | null
}

export interface AgencyDriverAssignmentRow {
    id: string
    vehicle_type: string
    rc_number: string
    driver_id: string | null
    drivers?: {
        id?: string
        full_name?: string
        phone?: string
        rating?: number
    } | null
}

export interface AgencyPortalProfile {
    id: string
    company_name: string
    status: 'pending' | 'approved' | 'rejected' | 'suspended'
    rating: number | null
    total_jobs: number | null
    fleet_size: number | null
    city: string | null
    gstin: string | null
}

export interface AgencyPortalSummary {
    active: number
    today: number
    pending: number
    thirtyDayRevenue: number
    thirtyDayJobs: number
}

export interface AgencyAssignedDriver {
    id: string
    full_name: string
    phone: string
    vehicle_type: string
    home_city: string | null
    rating: number | null
    total_trips: number | null
    status: string
    is_online: boolean
    active_job_id: string | null
    truck_id: string | null
}

export interface AgencyFleetTruckSummary {
    id: string
    vehicle_type: string
    rc_number: string
}

// ============= TO-144-D1 FLEET FOUNDATION TYPES =============
/**
 * Owned fleet vehicle as exposed to the agency portal over RLS (migration
 * 20261008000000_agency_fleet_foundation.sql). Extends the legacy FleetTruck
 * shape with payload/body dimensions, PUC, maintenance-block fields and the
 * optimistic-concurrency `version`.
 */
export interface FleetVehicle {
    id: string
    agency_id: string
    vehicle_type: string
    rc_number: string
    insurance_expiry: string | null
    fitness_expiry: string | null
    permit_expiry: string | null
    puc_expiry: string | null
    payload_kg: number | null
    body_length_m: number | null
    body_width_m: number | null
    body_height_m: number | null
    is_available: boolean | null
    maintenance_blocked: boolean
    maintenance_block_reason: string | null
    maintenance_blocked_until: string | null
    driver_id: string | null
    notes: string | null
    version: number
    created_at: string | null
    updated_at: string | null
}

/** Driver employment record (RLS-scoped to the caller's agency). */
export interface DriverEmployment {
    id: string
    agency_id: string
    driver_id: string
    licence_number: string | null
    licence_class: string | null
    licence_expiry: string | null
    contact_phone: string | null
    status: 'active' | 'ended'
    version: number
    created_at: string | null
    updated_at: string | null
}

export interface VehicleCreateInput {
    rc_number: string
    vehicle_type: string
    insurance_expiry?: string
    fitness_expiry?: string
    permit_expiry?: string
    puc_expiry?: string
    payload_kg?: number
    notes?: string
}

export interface VehiclePatch {
    is_available?: boolean
    notes?: string | null
    insurance_expiry?: string | null
    fitness_expiry?: string | null
    permit_expiry?: string | null
    puc_expiry?: string | null
    payload_kg?: number | null
    body_length_m?: number | null
    body_width_m?: number | null
    body_height_m?: number | null
    maintenance_blocked?: boolean
    maintenance_block_reason?: string | null
    maintenance_blocked_until?: string | null
}

export type VehicleCommandState = 'created' | 'idempotent_replay' | 'updated'

/**
 * Typed result of the fleet command RPCs (agency_vehicle_create /
 * agency_vehicle_update). A version_conflict is a RESULT, never an
 * exception: the page refetches once and shows a single conflict message.
 */
export type VehicleCommandResult =
    | { ok: true; state: VehicleCommandState; vehicle: FleetVehicle; version: number }
    | { ok: false; error: 'version_conflict'; currentVersion: number }

export type EmploymentCommandState = 'created' | 'idempotent_replay' | 'ended' | 'already_ended' | 'updated'

export type EmploymentCommandResult =
    | { ok: true; state: EmploymentCommandState; employment?: DriverEmployment; version: number }
    | { ok: false; error: 'version_conflict'; currentVersion: number }

/**
 * Bounded mapping from the controlled fleet command exceptions
 * (supabase/migrations/20261008000000) to user-facing messages. Unmapped
 * provider internals never reach the UI — they collapse to the caller's
 * redacted fallback.
 */
const FLEET_COMMAND_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
    'Agency approval is required.': 'Agency approval is required.',
    'No agency profile found for this account.': 'No agency profile found for this account.',
    'Multiple agency profiles found for this account.': 'Multiple agency profiles found for this account.',
    'Vehicle not found or access denied.': 'Vehicle not found or access denied.',
    'Employment record not found or access denied.': 'Employment record not found or access denied.',
    'Unknown vehicle type.': 'Unknown vehicle type.',
    'Driver is not approved for assignment.': 'Driver is not approved for assignment.',
    'Driver already has an active employment record.': 'Driver already has an active employment record.',
    'RC number is required.': 'RC number is required.',
})

function resolveCommandUserMessage(error: unknown, fallback: string): string {
    const message = (error as { message?: unknown } | null)?.message
    if (typeof message === 'string' && Object.prototype.hasOwnProperty.call(FLEET_COMMAND_ERROR_MESSAGES, message)) {
        return FLEET_COMMAND_ERROR_MESSAGES[message]
    }
    return fallback
}

/**
 * True when a thrown UserFacingError is one of the controlled agency
 * denials (approval required / no or multiple agency profiles). Pages use
 * this to render a distinct denied state instead of the generic error state.
 */
export function isAgencyDenial(error: unknown): boolean {
    return (
        error instanceof UserFacingError &&
        Object.prototype.hasOwnProperty.call(FLEET_COMMAND_ERROR_MESSAGES, error.message)
    )
}

// ============= DASHBOARD API =============
export const agencyDashboardApi = {
    async getSnapshot(): Promise<{ agency: AgencyPortalProfile | null; summary: AgencyPortalSummary }> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                agency: AgencyPortalProfile | null
                summary: AgencyPortalSummary
            }>('agency-portal-dashboard', {
                body: { action: 'snapshot' },
            })

            if (error) {
                reportFunctionFailure('agency-portal-dashboard', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load dashboard summary'))
            }

            return {
                agency: data?.agency ?? null,
                summary: data?.summary ?? {
                    active: 0,
                    today: 0,
                    pending: 0,
                    thirtyDayRevenue: 0,
                    thirtyDayJobs: 0,
                },
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-dashboard', e)
            throw new UserFacingError('Failed to load dashboard summary')
        }
    },
}

// ============= JOBS API =============
export const agencyJobsApi = {
    async list(): Promise<AgencyJob[]> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-jobs', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError('Failed to load jobs')
            }

            return data?.jobs || []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to load jobs')
        }
    },

    async updateStatus(jobId: string, status: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'update-status', jobId, status },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError('Failed to update job status')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to update job status')
        }
    },

    async assignDriver(jobId: string, driverId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'assign-driver', jobId, driverId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError('Failed to assign driver')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to assign driver')
        }
    },

    async getAssignableDrivers(): Promise<AgencyDriverAssignmentRow[]> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                drivers: AgencyDriverAssignmentRow[]
            }>('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'assignable-drivers' },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load drivers'))
            }

            return data?.drivers ?? []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to load drivers')
        }
    },

    async getDriverLatestLocation(jobId: string): Promise<{ lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null } | null> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                location: { lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null } | null
            }>('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'latest-driver-location', jobId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load driver location'))
            }

            return data?.location ?? null
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to load driver location')
        }
    },
}

// ============= FLEET API =============
export const agencyFleetApi = {
    async list(): Promise<FleetTruck[]> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-fleet', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-fleet', error)
                throw new UserFacingError('Failed to load trucks')
            }

            return data?.trucks || []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-fleet', e)
            throw new UserFacingError('Failed to load trucks')
        }
    },

    async addTruck(rcNumber: string, vehicleType: string, expiryData?: {
        insurance_expiry?: string
        fitness_expiry?: string
        permit_expiry?: string
    }): Promise<FleetTruck> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-fleet', {
                method: 'POST',
                body: {
                    action: 'add-truck',
                    rc_number: rcNumber,
                    vehicle_type: vehicleType,
                    ...expiryData,
                },
            })

            if (error) {
                reportFunctionFailure('agency-portal-fleet', error)
                throw new UserFacingError('Failed to add truck')
            }

            return data?.truck
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-fleet', e)
            throw new UserFacingError('Failed to add truck')
        }
    },

    async updateTruck(truckId: string, updateData: Record<string, unknown>): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-fleet', {
                method: 'POST',
                body: { action: 'update-truck', truckId, data: updateData },
            })

            if (error) {
                reportFunctionFailure('agency-portal-fleet', error)
                throw new UserFacingError('Failed to update truck')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-fleet', e)
            throw new UserFacingError('Failed to update truck')
        }
    },

    // ===== TO-144-D1 fleet foundation: RLS reads + typed command RPCs =====

    /**
     * RLS-scoped list of the caller agency's owned vehicles (the suspended
     * portal keeps rendering — reads are ownership-only, never gated on
     * operational status).
     */
    async listVehicles(): Promise<FleetVehicle[]> {
        const { data, error } = await supabase
            .from('agency_trucks')
            .select('*')

        if (error) {
            throw new UserFacingError('Failed to load fleet')
        }

        return (data ?? []) as FleetVehicle[]
    },

    /**
     * Typed idempotent create through the SECURITY DEFINER command RPC. The
     * agency is resolved from auth.uid() server-side — no browser-supplied
     * org id is ever sent. A replayed (agency, rc_number) returns the
     * existing row as 'idempotent_replay'.
     */
    async createVehicle(input: VehicleCreateInput): Promise<VehicleCommandResult> {
        const { data, error } = await supabase.rpc('agency_vehicle_create', {
            p_rc_number: input.rc_number,
            p_vehicle_type: input.vehicle_type,
            p_insurance_expiry: input.insurance_expiry,
            p_fitness_expiry: input.fitness_expiry,
            p_permit_expiry: input.permit_expiry,
            p_puc_expiry: input.puc_expiry,
            p_payload_kg: input.payload_kg,
            p_notes: input.notes,
        })

        if (error) {
            throw new UserFacingError(resolveCommandUserMessage(error, 'Failed to add vehicle to fleet'))
        }

        return mapVehicleCommandEnvelope(data)
    },

    /**
     * Expected-version update. The {ok:false,error:'version_conflict'}
     * envelope maps to the typed conflict branch (never an exception, never
     * an auto-retry): callers refetch once and show one conflict message.
     */
    async updateVehicle(vehicleId: string, expectedVersion: number, patch: VehiclePatch): Promise<VehicleCommandResult> {
        const { data, error } = await supabase.rpc('agency_vehicle_update', {
            p_vehicle_id: vehicleId,
            p_expected_version: expectedVersion,
            p_patch: patch,
        })

        if (error) {
            throw new UserFacingError(resolveCommandUserMessage(error, 'Failed to update vehicle'))
        }

        return mapVehicleCommandEnvelope(data)
    },
}

/** Bounded envelope -> VehicleCommandResult mapping (never throws on shape). */
function mapVehicleCommandEnvelope(data: unknown): VehicleCommandResult {
    const envelope = (Array.isArray(data) ? data[0] : data) as
        | { ok?: unknown; state?: unknown; vehicle?: unknown; version?: unknown; error?: unknown; current_version?: unknown }
        | undefined

    if (envelope && envelope.ok === false && envelope.error === 'version_conflict') {
        return {
            ok: false,
            error: 'version_conflict',
            currentVersion: typeof envelope.current_version === 'number' ? envelope.current_version : 0,
        }
    }

    if (
        envelope &&
        envelope.ok === true &&
        typeof envelope.state === 'string' &&
        envelope.vehicle &&
        typeof envelope.vehicle === 'object' &&
        typeof envelope.version === 'number'
    ) {
        return {
            ok: true,
            state: envelope.state as VehicleCommandState,
            vehicle: envelope.vehicle as FleetVehicle,
            version: envelope.version,
        }
    }

    // A zero-row or malformed response is a failed command, not a success.
    throw new UserFacingError('Fleet command failed')
}

// ============= BILLING API =============
export const agencyBillingApi = {
    async list(): Promise<{ summary: BillingSummary; jobs: DeliveredJob[] }> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-billing', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-billing', error)
                throw new UserFacingError('Failed to load billing data')
            }

            return {
                summary: data?.summary || { thisMonth: 0, pending: 0, totalPaid: 0, gstDue: 0 },
                jobs: data?.jobs || [],
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-billing', e)
            throw new UserFacingError('Failed to load billing data')
        }
    },
}

// ============= RATES API =============
export const agencyRatesApi = {
    async list(): Promise<RateCard[]> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to load rate cards')
            }

            return data?.rates || []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to load rate cards')
        }
    },

    async addRate(rateData: {
        vehicle_type: string
        origin_city: string
        dest_city: string
        rate_per_km?: number
        flat_rate?: number
        min_weight_kg?: number
        max_weight_kg?: number
        valid_until?: string
        notes?: string
    }): Promise<RateCard> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'POST',
                body: { action: 'add-rate', ...rateData },
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to add rate card')
            }

            return data?.rate
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to add rate card')
        }
    },

    async updateRate(rateId: string, updateData: Record<string, unknown>): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'POST',
                body: { action: 'update-rate', rateId, data: updateData },
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to update rate card')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to update rate card')
        }
    },

    async deleteRate(rateId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'POST',
                body: { action: 'delete-rate', rateId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to delete rate card')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to delete rate card')
        }
    },
}

export const agencyDriversApi = {
    async getSnapshot(): Promise<{ trucks: AgencyFleetTruckSummary[]; drivers: AgencyAssignedDriver[] }> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                trucks: AgencyFleetTruckSummary[]
                drivers: AgencyAssignedDriver[]
            }>('agency-portal-drivers', {
                body: { action: 'snapshot' },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load drivers'))
            }

            return {
                trucks: data?.trucks ?? [],
                drivers: data?.drivers ?? [],
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to load drivers')
        }
    },

    async assignTruckToDriver(truckId: string, driverId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-drivers', {
                body: { action: 'assign-truck', truckId, driverId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to assign truck'))
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to assign truck')
        }
    },

    async unassignTruck(truckId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-drivers', {
                body: { action: 'unassign-truck', truckId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to unassign driver'))
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to unassign driver')
        }
    },

    async createPayout(driverId: string, amount: number, note?: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-drivers', {
                body: { action: 'create-payout', driverId, amount, note },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to submit payment request'))
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to submit payment request')
        }
    },

    // ===== TO-144-D1 driver employment records (RLS reads + command RPC) =====

    /** RLS-scoped list of the caller agency's driver employment records. */
    async listEmployments(): Promise<DriverEmployment[]> {
        const { data, error } = await supabase
            .from('agency_driver_employment')
            .select('*')

        if (error) {
            throw new UserFacingError('Failed to load driver employments')
        }

        return (data ?? []) as DriverEmployment[]
    },

    /**
     * Expected-version end. {ok:false,error:'version_conflict'} maps to the
     * typed conflict branch (refetch once, one message, never an auto-retry);
     * a replayed end on the matching version returns 'already_ended'.
     */
    async endEmployment(employmentId: string, expectedVersion: number): Promise<EmploymentCommandResult> {
        const { data, error } = await supabase.rpc('agency_driver_employment_end', {
            p_employment_id: employmentId,
            p_expected_version: expectedVersion,
        })

        if (error) {
            throw new UserFacingError(resolveCommandUserMessage(error, 'Failed to end employment'))
        }

        const envelope = (Array.isArray(data) ? data[0] : data) as
            | { ok?: unknown; state?: unknown; employment?: unknown; version?: unknown; error?: unknown; current_version?: unknown }
            | undefined

        if (envelope && envelope.ok === false && envelope.error === 'version_conflict') {
            return {
                ok: false,
                error: 'version_conflict',
                currentVersion: typeof envelope.current_version === 'number' ? envelope.current_version : 0,
            }
        }

        if (
            envelope &&
            envelope.ok === true &&
            typeof envelope.state === 'string' &&
            typeof envelope.version === 'number'
        ) {
            return {
                ok: true,
                state: envelope.state as EmploymentCommandState,
                employment: (envelope.employment && typeof envelope.employment === 'object'
                    ? envelope.employment
                    : undefined) as DriverEmployment | undefined,
                version: envelope.version,
            }
        }

        throw new UserFacingError('Failed to end employment')
    },
}

export const agencyRegistrationApi = {
    async register(payload: Record<string, unknown>): Promise<void> {
        const { error } = await supabase
            .from('transport_agencies')
            .insert(payload)

        if (error) {
            throw new UserFacingError('Unable to submit agency registration right now. Please try again.')
        }
    },
}
