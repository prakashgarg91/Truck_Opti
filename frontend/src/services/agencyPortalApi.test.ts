import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())
const rpcMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())

// The real SupabaseClient methods depend on `this`; a detached call crashes in the
// browser. These wrappers fail loudly unless the service calls them as methods.
vi.mock('../lib/supabase', () => {
    const client: Record<string, unknown> = {}
    client.from = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.from called without its client as this')
        return fromMock(...args)
    }
    client.rpc = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.rpc called without its client as this')
        return rpcMock(...args)
    }
    client.functions = { invoke: invokeMock }
    return { supabase: client }
})

vi.mock('../utils/logger', () => ({
    logger: {
        error: loggerErrorMock,
    },
}))

import {
    agencyDashboardApi,
    agencyJobsApi,
    agencyFleetApi,
    agencyBillingApi,
    agencyRatesApi,
    agencyDriversApi,
    agencyRegistrationApi,
} from './agencyPortalApi'
import { UserFacingError } from '../utils/userFacingError'

describe('agencyPortalApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        loggerErrorMock.mockReset()
    })

    describe('agencyDashboardApi.getSnapshot', () => {
        it('returns null agency and zero summary when no data exists', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyDashboardApi.getSnapshot()
            
            expect(result.agency).toBeNull()
            expect(result.summary).toEqual({
                active: 0,
                today: 0,
                pending: 0,
                thirtyDayRevenue: 0,
                thirtyDayJobs: 0,
            })
        })

        it('returns agency and summary when data exists', async () => {
            invokeMock.mockResolvedValue({
                data: {
                    agency: {
                        id: 'agency_1',
                        company_name: 'Test Agency',
                        status: 'approved',
                        rating: 4.5,
                        total_jobs: 100,
                        fleet_size: 10,
                        city: 'Mumbai',
                        gstin: 'GST123',
                    },
                    summary: {
                        active: 5,
                        today: 2,
                        pending: 1,
                        thirtyDayRevenue: 3000,
                        thirtyDayJobs: 3,
                    },
                },
                error: null,
            })
            
            const result = await agencyDashboardApi.getSnapshot()
            
            expect(result.agency).toEqual({
                id: 'agency_1',
                company_name: 'Test Agency',
                status: 'approved',
                rating: 4.5,
                total_jobs: 100,
                fleet_size: 10,
                city: 'Mumbai',
                gstin: 'GST123',
            })
            expect(result.summary).toEqual({
                active: 5,
                today: 2,
                pending: 1,
                thirtyDayRevenue: 3000,
                thirtyDayJobs: 3,
            })
        })

        it('handles missing summary gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {
                    agency: {
                        id: 'agency_1',
                        company_name: 'Test Agency',
                        status: 'approved',
                        rating: null,
                        total_jobs: null,
                        fleet_size: null,
                        city: null,
                        gstin: null,
                    },
                },
                error: null,
            })
            
            const result = await agencyDashboardApi.getSnapshot()
            
            expect(result.summary).toEqual({
                active: 0,
                today: 0,
                pending: 0,
                thirtyDayRevenue: 0,
                thirtyDayJobs: 0,
            })
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyDashboardApi.getSnapshot())
                .rejects.toThrow('Failed to load dashboard summary')
        })
    })

    describe('agencyJobsApi.list', () => {
        it('returns empty array when no jobs exist', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyJobsApi.list()
            
            expect(result).toEqual([])
        })

        it('returns jobs when data exists', async () => {
            const mockJobs = [
                {
                    id: 'job_1',
                    shipment_id: 'ship_1',
                    status: 'accepted',
                    fare: 1000,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: { jobs: mockJobs },
                error: null,
            })
            
            const result = await agencyJobsApi.list()
            
            expect(result).toEqual(mockJobs)
        })

        it('handles missing jobs data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {},
                error: null,
            })
            
            const result = await agencyJobsApi.list()
            
            expect(result).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyJobsApi.list())
                .rejects.toThrow('Failed to load jobs')
        })
    })

    describe('agencyJobsApi.updateStatus', () => {
        it('updates the status through the agency_job_set_status RPC, never an Edge function', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'updated', job: { id: 'job_1', status: 'completed' } },
                error: null,
            })

            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .resolves.not.toThrow()

            expect(rpcMock).toHaveBeenCalledTimes(1)
            expect(rpcMock).toHaveBeenCalledWith('agency_job_set_status', {
                p_job_id: 'job_1',
                p_status: 'completed',
            })
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('resolves on an unchanged replay state', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'unchanged', job: { id: 'job_1', status: 'completed' } },
                error: null,
            })

            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .resolves.not.toThrow()
        })

        it('maps invalid_transition to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'invalid_transition' },
                error: null,
            })

            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .rejects.toThrow('This job cannot move to that status from its current one.')
        })

        it('shows the controlled job-not-found exception verbatim', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'Job not found or access denied.' },
            })

            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .rejects.toThrow('Job not found or access denied.')
        })

        it('shows the controlled unknown-status exception verbatim', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'Unknown job status.' },
            })

            await expect(agencyJobsApi.updateStatus('job_1', 'delivered'))
                .rejects.toThrow('Unknown job status.')
        })

        it('collapses uncontrolled errors to the fallback with bounded diagnostics', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'SQLSTATE 42703: relation "public.agency_jobs" does not exist' },
            })

            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .rejects.toThrow('Failed to update job status')
            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .rejects.not.toThrow(/SQLSTATE/)

            const logged = loggerErrorMock.mock.calls.map((call) => call.join(' ')).join(' ')
            expect(logged).toContain('agency_job_set_status')
            expect(logged).not.toContain('SQLSTATE')
        })

        it('collapses a malformed envelope to the fallback', async () => {
            rpcMock.mockResolvedValue({ data: null, error: null })

            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .rejects.toThrow('Failed to update job status')
        })
    })

    describe('agencyJobsApi.assignDriver', () => {
        it('assigns through the agency_job_assign_driver RPC, never an Edge function', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'assigned', job: { id: 'job_1', driver_id: 'driver_1' } },
                error: null,
            })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .resolves.not.toThrow()

            expect(rpcMock).toHaveBeenCalledTimes(1)
            expect(rpcMock).toHaveBeenCalledWith('agency_job_assign_driver', {
                p_job_id: 'job_1',
                p_driver_id: 'driver_1',
            })
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('resolves on an unchanged replay state', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'unchanged', job: { id: 'job_1' } },
                error: null,
            })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .resolves.not.toThrow()
        })

        it('maps job_not_assignable to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'job_not_assignable' },
                error: null,
            })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('Only pending or accepted jobs can be given a driver.')
        })

        it('maps driver_not_approved to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'driver_not_approved' },
                error: null,
            })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('This driver is not approved yet.')
        })

        it('maps driver_not_employed to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'driver_not_employed' },
                error: null,
            })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('This driver is not employed by your agency. Add the driver in Drivers first.')
        })

        it('maps job_has_reservation to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'job_has_reservation' },
                error: null,
            })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('This job already has a vehicle and driver reserved. Release the reservation first.')
        })

        it('shows controlled denial exceptions verbatim', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'Your access scope does not allow this action.' } })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('Your access scope does not allow this action.')

            rpcMock.mockResolvedValue({ data: null, error: { message: 'Agency approval is required.' } })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('Agency approval is required.')

            rpcMock.mockResolvedValue({ data: null, error: { message: 'No agency profile found for this account.' } })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('No agency profile found for this account.')
        })

        it('collapses uncontrolled errors to the fallback', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'Assignment failed' },
            })

            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .rejects.toThrow('Failed to assign driver')
        })
    })

    describe('agencyJobsApi.getAssignableDrivers', () => {
        it('returns empty array when no drivers exist', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyJobsApi.getAssignableDrivers()
            
            expect(result).toEqual([])
        })

        it('returns drivers when data exists', async () => {
            const mockDrivers = [
                {
                    id: 'driver_1',
                    vehicle_type: 'truck',
                    rc_number: 'MH123456',
                    driver_id: 'driver_1',
                    drivers: {
                        full_name: 'John Doe',
                        phone: '9876543210',
                        rating: 4.5,
                    },
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: { drivers: mockDrivers },
                error: null,
            })
            
            const result = await agencyJobsApi.getAssignableDrivers()
            
            expect(result).toEqual(mockDrivers)
        })

        it('handles missing drivers data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {},
                error: null,
            })
            
            const result = await agencyJobsApi.getAssignableDrivers()
            
            expect(result).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyJobsApi.getAssignableDrivers())
                .rejects.toThrow('Failed to load drivers')
        })
    })

    describe('agencyJobsApi.getDriverLatestLocation', () => {
        it('returns null when no location exists', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyJobsApi.getDriverLatestLocation('job_1')
            
            expect(result).toBeNull()
        })

        it('returns location when data exists', async () => {
            const mockLocation = {
                lat: 19.0760,
                lng: 72.8777,
                updated_at: '2024-01-01T00:00:00Z',
                speed_kmh: 45,
            }
            
            invokeMock.mockResolvedValue({
                data: { location: mockLocation },
                error: null,
            })
            
            const result = await agencyJobsApi.getDriverLatestLocation('job_1')
            
            expect(result).toEqual(mockLocation)
        })

        it('handles missing location data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {},
                error: null,
            })
            
            const result = await agencyJobsApi.getDriverLatestLocation('job_1')
            
            expect(result).toBeNull()
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyJobsApi.getDriverLatestLocation('job_1'))
                .rejects.toThrow('Failed to load driver location')
        })
    })

    describe('agencyFleetApi.list', () => {
        it('returns empty array when no trucks exist', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyFleetApi.list()
            
            expect(result).toEqual([])
        })

        it('returns trucks when data exists', async () => {
            const mockTrucks = [
                {
                    id: 'truck_1',
                    vehicle_type: 'truck',
                    rc_number: 'MH123456',
                    insurance_expiry: '2024-12-31',
                    fitness_expiry: '2024-12-31',
                    permit_expiry: '2024-12-31',
                    is_available: true,
                    driver_id: 'driver_1',
                    agency_id: 'agency_1',
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: { trucks: mockTrucks },
                error: null,
            })
            
            const result = await agencyFleetApi.list()
            
            expect(result).toEqual(mockTrucks)
        })

        it('handles missing trucks data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {},
                error: null,
            })
            
            const result = await agencyFleetApi.list()
            
            expect(result).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyFleetApi.list())
                .rejects.toThrow('Failed to load trucks')
        })
    })

    describe('agencyFleetApi.addTruck', () => {
        it('adds truck successfully', async () => {
            const mockTruck = {
                id: 'truck_1',
                vehicle_type: 'truck',
                rc_number: 'MH123456',
                insurance_expiry: null,
                fitness_expiry: null,
                permit_expiry: null,
                is_available: true,
                driver_id: null,
                agency_id: 'agency_1',
            }
            
            invokeMock.mockResolvedValue({
                data: { truck: mockTruck },
                error: null,
            })
            
            const result = await agencyFleetApi.addTruck('MH123456', 'truck')
            
            expect(result).toEqual(mockTruck)
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-fleet', {
                method: 'POST',
                body: {
                    action: 'add-truck',
                    rc_number: 'MH123456',
                    vehicle_type: 'truck',
                },
            })
        })

        it('adds truck with expiry dates', async () => {
            const mockTruck = {
                id: 'truck_1',
                vehicle_type: 'truck',
                rc_number: 'MH123456',
                insurance_expiry: '2024-12-31',
                fitness_expiry: '2024-12-31',
                permit_expiry: '2024-12-31',
                is_available: true,
                driver_id: null,
                agency_id: 'agency_1',
            }
            
            invokeMock.mockResolvedValue({
                data: { truck: mockTruck },
                error: null,
            })
            
            const result = await agencyFleetApi.addTruck('MH123456', 'truck', {
                insurance_expiry: '2024-12-31',
                fitness_expiry: '2024-12-31',
                permit_expiry: '2024-12-31',
            })
            
            expect(result).toEqual(mockTruck)
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-fleet', {
                method: 'POST',
                body: {
                    action: 'add-truck',
                    rc_number: 'MH123456',
                    vehicle_type: 'truck',
                    insurance_expiry: '2024-12-31',
                    fitness_expiry: '2024-12-31',
                    permit_expiry: '2024-12-31',
                },
            })
        })

        it('throws UserFacingError on add failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Add failed' },
            })
            
            await expect(agencyFleetApi.addTruck('MH123456', 'truck'))
                .rejects.toThrow('Failed to add truck')
        })
    })

    describe('agencyFleetApi.updateTruck', () => {
        it('updates truck successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyFleetApi.updateTruck('truck_1', { is_available: false }))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-fleet', {
                method: 'POST',
                body: {
                    action: 'update-truck',
                    truckId: 'truck_1',
                    data: { is_available: false },
                },
            })
        })

        it('throws UserFacingError on update failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Update failed' },
            })
            
            await expect(agencyFleetApi.updateTruck('truck_1', { is_available: false }))
                .rejects.toThrow('Failed to update truck')
        })
    })

    describe('agencyBillingApi.list', () => {
        it('returns zero summary and empty jobs when no data exists', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyBillingApi.list()
            
            expect(result.summary).toEqual({
                thisMonth: 0,
                pending: 0,
                totalPaid: 0,
                gstDue: 0,
            })
            expect(result.jobs).toEqual([])
        })

        it('returns billing data when exists', async () => {
            invokeMock.mockResolvedValue({
                data: {
                    summary: {
                        thisMonth: 5000,
                        pending: 1000,
                        totalPaid: 4000,
                        gstDue: 500,
                    },
                    jobs: [
                        {
                            id: 'job_1',
                            fare: 1000,
                            origin: 'Mumbai',
                            destination: 'Delhi',
                            updated_at: '2024-01-01T00:00:00Z',
                            shipment_id: 'ship_1',
                        },
                    ],
                },
                error: null,
            })
            
            const result = await agencyBillingApi.list()
            
            expect(result.summary).toEqual({
                thisMonth: 5000,
                pending: 1000,
                totalPaid: 4000,
                gstDue: 500,
            })
            expect(result.jobs).toHaveLength(1)
        })

        it('handles missing data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {},
                error: null,
            })
            
            const result = await agencyBillingApi.list()
            
            expect(result.summary).toEqual({
                thisMonth: 0,
                pending: 0,
                totalPaid: 0,
                gstDue: 0,
            })
            expect(result.jobs).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyBillingApi.list())
                .rejects.toThrow('Failed to load billing data')
        })
    })

    describe('agencyRatesApi.list', () => {
        it('returns empty array when no rates exist', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyRatesApi.list()
            
            expect(result).toEqual([])
        })

        it('returns rates when data exists', async () => {
            const mockRates = [
                {
                    id: 'rate_1',
                    agency_id: 'agency_1',
                    vehicle_type: 'truck',
                    origin_city: 'Mumbai',
                    dest_city: 'Delhi',
                    rate_per_km: 10,
                    flat_rate: null,
                    min_weight_kg: null,
                    max_weight_kg: null,
                    is_active: true,
                    valid_from: '2024-01-01',
                    valid_until: null,
                    notes: null,
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: { rates: mockRates },
                error: null,
            })
            
            const result = await agencyRatesApi.list()
            
            expect(result).toEqual(mockRates)
        })

        it('handles missing rates data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {},
                error: null,
            })
            
            const result = await agencyRatesApi.list()
            
            expect(result).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyRatesApi.list())
                .rejects.toThrow('Failed to load rate cards')
        })
    })

    describe('agencyRatesApi.addRate', () => {
        it('adds rate successfully', async () => {
            const mockRate = {
                id: 'rate_1',
                agency_id: 'agency_1',
                vehicle_type: 'truck',
                origin_city: 'Mumbai',
                dest_city: 'Delhi',
                rate_per_km: 10,
                flat_rate: null,
                min_weight_kg: null,
                max_weight_kg: null,
                is_active: true,
                valid_from: null,
                valid_until: null,
                notes: null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            }
            
            invokeMock.mockResolvedValue({
                data: { rate: mockRate },
                error: null,
            })
            
            const result = await agencyRatesApi.addRate({
                vehicle_type: 'truck',
                origin_city: 'Mumbai',
                dest_city: 'Delhi',
                rate_per_km: 10,
            })
            
            expect(result).toEqual(mockRate)
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-rates', {
                method: 'POST',
                body: {
                    action: 'add-rate',
                    vehicle_type: 'truck',
                    origin_city: 'Mumbai',
                    dest_city: 'Delhi',
                    rate_per_km: 10,
                },
            })
        })

        it('throws UserFacingError on add failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Add failed' },
            })
            
            await expect(agencyRatesApi.addRate({
                vehicle_type: 'truck',
                origin_city: 'Mumbai',
                dest_city: 'Delhi',
            }))
                .rejects.toThrow('Failed to add rate card')
        })
    })

    describe('agencyRatesApi.updateRate', () => {
        it('updates rate successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyRatesApi.updateRate('rate_1', { rate_per_km: 15 }))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-rates', {
                method: 'POST',
                body: {
                    action: 'update-rate',
                    rateId: 'rate_1',
                    data: { rate_per_km: 15 },
                },
            })
        })

        it('throws UserFacingError on update failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Update failed' },
            })
            
            await expect(agencyRatesApi.updateRate('rate_1', { rate_per_km: 15 }))
                .rejects.toThrow('Failed to update rate card')
        })
    })

    describe('agencyRatesApi.deleteRate', () => {
        it('deletes rate successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyRatesApi.deleteRate('rate_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-rates', {
                method: 'POST',
                body: {
                    action: 'delete-rate',
                    rateId: 'rate_1',
                },
            })
        })

        it('throws UserFacingError on delete failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Delete failed' },
            })
            
            await expect(agencyRatesApi.deleteRate('rate_1'))
                .rejects.toThrow('Failed to delete rate card')
        })
    })

    describe('agencyDriversApi.getSnapshot', () => {
        it('returns empty trucks and drivers when no data exists', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await agencyDriversApi.getSnapshot()
            
            expect(result.trucks).toEqual([])
            expect(result.drivers).toEqual([])
        })

        it('returns trucks and drivers when data exists', async () => {
            invokeMock.mockResolvedValue({
                data: {
                    trucks: [
                        {
                            id: 'truck_1',
                            vehicle_type: 'truck',
                            rc_number: 'MH123456',
                        },
                    ],
                    drivers: [
                        {
                            id: 'driver_1',
                            full_name: 'John Doe',
                            phone: '9876543210',
                            vehicle_type: 'truck',
                            home_city: 'Mumbai',
                            rating: 4.5,
                            total_trips: 100,
                            status: 'active',
                            is_online: true,
                            active_job_id: 'job_1',
                            truck_id: 'truck_1',
                        },
                    ],
                },
                error: null,
            })
            
            const result = await agencyDriversApi.getSnapshot()
            
            expect(result.trucks).toHaveLength(1)
            expect(result.drivers).toHaveLength(1)
        })

        it('handles missing data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: {},
                error: null,
            })
            
            const result = await agencyDriversApi.getSnapshot()
            
            expect(result.trucks).toEqual([])
            expect(result.drivers).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(agencyDriversApi.getSnapshot())
                .rejects.toThrow('Failed to load drivers')
        })
    })

    // The page methods do not carry a version: each truck command first reads
    // the current version from agency_trucks, then calls the expected-version RPC.
    function mockTruckVersionRead(version: number | null, readError: unknown = null) {
        const maybeSingle = vi.fn().mockResolvedValue({
            data: version === null ? null : { version },
            error: readError,
        })
        const eq = vi.fn().mockReturnValue({ maybeSingle })
        const select = vi.fn().mockReturnValue({ eq })
        fromMock.mockReturnValue({ select })
        return { select, eq, maybeSingle }
    }

    describe('agencyDriversApi.assignTruckToDriver', () => {
        it('reads the version first, then assigns through agency_truck_assign_driver (never an Edge function)', async () => {
            const { select, eq, maybeSingle } = mockTruckVersionRead(7)
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'assigned', truck: { id: 'truck_1', driver_id: 'driver_1' }, version: 8 },
                error: null,
            })

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .resolves.not.toThrow()

            expect(fromMock).toHaveBeenCalledWith('agency_trucks')
            expect(select).toHaveBeenCalledWith('version')
            expect(eq).toHaveBeenCalledWith('id', 'truck_1')
            expect(maybeSingle).toHaveBeenCalledTimes(1)
            expect(fromMock.mock.invocationCallOrder[0]).toBeLessThan(rpcMock.mock.invocationCallOrder[0])
            expect(rpcMock).toHaveBeenCalledWith('agency_truck_assign_driver', {
                p_truck_id: 'truck_1',
                p_driver_id: 'driver_1',
                p_expected_version: 7,
            })
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('resolves on an unchanged replay state', async () => {
            mockTruckVersionRead(7)
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'unchanged', truck: { id: 'truck_1', driver_id: 'driver_1' }, version: 7 },
                error: null,
            })

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .resolves.not.toThrow()
        })

        it('throws the approved denial when the truck row is not visible and never calls the RPC', async () => {
            mockTruckVersionRead(null)

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .rejects.toThrow('Vehicle not found or access denied.')

            expect(rpcMock).not.toHaveBeenCalled()
        })

        it('collapses a failed version read to the assign fallback', async () => {
            mockTruckVersionRead(null, { message: 'read failed' })

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .rejects.toThrow('Failed to assign truck')

            expect(rpcMock).not.toHaveBeenCalled()
        })

        it('maps version_conflict to the reload message', async () => {
            mockTruckVersionRead(7)
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'version_conflict' },
                error: null,
            })

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .rejects.toThrow('This vehicle was updated elsewhere. Reload and try again.')
        })

        it('maps driver_not_employed to the approved message', async () => {
            mockTruckVersionRead(7)
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'driver_not_employed' },
                error: null,
            })

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .rejects.toThrow('This driver is not employed by your agency. Add the driver in Drivers first.')
        })

        it('maps driver_already_assigned to the approved message', async () => {
            mockTruckVersionRead(7)
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'driver_already_assigned' },
                error: null,
            })

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .rejects.toThrow('This driver is already assigned to another truck.')
        })

        it('collapses uncontrolled RPC errors to the fallback', async () => {
            mockTruckVersionRead(7)
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'Assignment failed' },
            })

            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .rejects.toThrow('Failed to assign truck')
        })
    })

    describe('agencyDriversApi.unassignTruck', () => {
        it('reads the version first, then unassigns through agency_truck_unassign_driver (never an Edge function)', async () => {
            const { select, eq, maybeSingle } = mockTruckVersionRead(7)
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'unassigned' },
                error: null,
            })

            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .resolves.not.toThrow()

            expect(fromMock).toHaveBeenCalledWith('agency_trucks')
            expect(select).toHaveBeenCalledWith('version')
            expect(eq).toHaveBeenCalledWith('id', 'truck_1')
            expect(maybeSingle).toHaveBeenCalledTimes(1)
            expect(fromMock.mock.invocationCallOrder[0]).toBeLessThan(rpcMock.mock.invocationCallOrder[0])
            expect(rpcMock).toHaveBeenCalledWith('agency_truck_unassign_driver', {
                p_truck_id: 'truck_1',
                p_expected_version: 7,
            })
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('resolves on an unchanged replay state', async () => {
            mockTruckVersionRead(4)
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'unchanged' },
                error: null,
            })

            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .resolves.not.toThrow()
        })

        it('throws the approved denial when the truck row is not visible and never calls the RPC', async () => {
            mockTruckVersionRead(null)

            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .rejects.toThrow('Vehicle not found or access denied.')

            expect(rpcMock).not.toHaveBeenCalled()
        })

        it('maps version_conflict to the reload message', async () => {
            mockTruckVersionRead(4)
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'version_conflict' },
                error: null,
            })

            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .rejects.toThrow('This vehicle was updated elsewhere. Reload and try again.')
        })

        it('shows the controlled vehicle-not-found exception verbatim', async () => {
            mockTruckVersionRead(4)
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'Vehicle not found or access denied.' },
            })

            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .rejects.toThrow('Vehicle not found or access denied.')
        })

        it('collapses uncontrolled errors to the fallback', async () => {
            mockTruckVersionRead(4)
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'Unassignment failed' },
            })

            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .rejects.toThrow('Failed to unassign truck')
        })
    })

    describe('agencyDriversApi.createPayout', () => {
        const payoutRow = { id: 'payout_1', amount: 1000, status: 'requested', requested_at: '2026-11-09T10:00:00Z' }

        it('submits through the agency_driver_payout_request RPC, never an Edge function', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'created', payout: payoutRow },
                error: null,
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, 'Weekly payout', 'idem-key-1'))
                .resolves.not.toThrow()

            expect(rpcMock).toHaveBeenCalledTimes(1)
            expect(rpcMock).toHaveBeenCalledWith('agency_driver_payout_request', {
                p_driver_id: 'driver_1',
                p_amount: 1000,
                p_note: 'Weekly payout',
                p_idempotency_key: 'idem-key-1',
            })
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('maps an undefined note to p_note null', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'created', payout: payoutRow },
                error: null,
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .resolves.not.toThrow()

            expect(rpcMock).toHaveBeenCalledWith('agency_driver_payout_request', {
                p_driver_id: 'driver_1',
                p_amount: 1000,
                p_note: null,
                p_idempotency_key: 'idem-key-1',
            })
        })

        it('resolves on an idempotent_replay state', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'idempotent_replay', payout: payoutRow },
                error: null,
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .resolves.not.toThrow()
        })

        it('maps driver_not_approved to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'driver_not_approved' },
                error: null,
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .rejects.toThrow('This driver is not approved yet.')
        })

        it('maps driver_not_employed to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'driver_not_employed' },
                error: null,
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .rejects.toThrow('This driver is not employed by your agency. Add the driver in Drivers first.')
        })

        it('maps idempotency_key_reused to the approved message', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'idempotency_key_reused' },
                error: null,
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .rejects.toThrow('This payment request was already used for different details. Start again.')
        })

        it('shows the controlled exception texts verbatim', async () => {
            const controlled = [
                'Idempotency key is required.',
                'Payout amount must be greater than zero.',
                'Payout amount must have at most two decimal places.',
                'Payout amount exceeds the per-request limit.',
                'Payout note is too long.',
                'Daily payout limit for this agency reached.',
                'Idempotency key is too long.',
                'Your access scope does not allow this action.',
                'Agency approval is required.',
                'No agency profile found for this account.',
            ]

            for (const message of controlled) {
                rpcMock.mockResolvedValue({ data: null, error: { message } })

                await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                    .rejects.toThrow(message)
            }
        })

        it('collapses uncontrolled RPC errors to the fallback with bounded diagnostics', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'SQLSTATE 42703: relation "public.agency_driver_payouts" does not exist' },
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .rejects.toThrow('Failed to submit payment request')

            const logged = loggerErrorMock.mock.calls.map((call) => call.join(' ')).join(' ')
            expect(logged).toContain('agency_driver_payout_request')
            expect(logged).not.toContain('SQLSTATE')
        })

        it('collapses an unknown refusal code and a malformed envelope to the fallback', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'brand_new_refusal' },
                error: null,
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .rejects.toThrow('Failed to submit payment request')

            rpcMock.mockResolvedValue({ data: null, error: null })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1'))
                .rejects.toThrow('Failed to submit payment request')
        })
    })

    // TO-131: safe agency error boundaries. Raw provider/edge-function error
    // strings must never reach the user; only approved typed status codes may
    // influence the user-facing message.
    describe('safe error boundary (TO-131)', () => {
        const FALLBACK = 'Failed to submit payment request'
        const SQL_DETAIL = 'SQLSTATE 42703: relation "public.agency_jobs" does not exist, column "otp_hash"'
        const JWT_LIKE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZ2VuY3kiLCJyb2xlIjoic2VydmljZSJ9.f4k3s1gn4tur3'

        function functionHttpError(status: number, body: string, contentType = 'application/json') {
            return {
                name: 'FunctionsHttpError',
                message: 'Edge Function returned a non-2xx status code',
                context: new Response(body, { status, headers: { 'Content-Type': contentType } }),
            }
        }

        // createPayout no longer routes through the Edge function; its safe
        // error boundary is exercised over the agency_driver_payout_request RPC.
        it('does not surface SQL table/column details', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: SQL_DETAIL },
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)
        })

        it('does not surface JWT-like payloads from provider messages', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: `upstream auth failed: ${JWT_LIKE}` },
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)
        })

        it('does not surface stack traces from raw error messages', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: new Error(`TypeError: x is not a function\n    at handler (file:///srv/index.ts:42:15)\n    at ${JWT_LIKE}`),
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)
        })

        it('does not surface HTML provider responses', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: '<html><body><h1>502 Bad Gateway</h1><p>nginx/1.24.0</p></body></html>' },
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)
        })

        it('does not surface malformed JSON payloads', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: '{not valid json' },
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)
        })

        it('does not surface network failure internals', async () => {
            rpcMock.mockRejectedValue(new Error('Failed to send a request to the Edge Function: getaddrinfo ENOTFOUND'))

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)
        })

        it('does not surface unknown error shapes', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { code: 'PGRST116', details: SQL_DETAIL, hint: null },
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)
        })

        it('maps an approved 401 code to a sign-in message', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(401, JSON.stringify({ error: 'Authentication is required.' })),
            })

            await expect(agencyDashboardApi.getSnapshot())
                .rejects.toThrow('Your session has expired. Please sign in again.')
        })

        it('maps an approved 403 code to a permission message', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(403, JSON.stringify({ error: 'Access denied.' })),
            })

            await expect(agencyDashboardApi.getSnapshot())
                .rejects.toThrow('You do not have permission to perform this action.')
        })

        it('maps an approved 409 code to an account-guard message', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(409, JSON.stringify({ error: 'You cannot modify your own account from this screen.' })),
            })

            // createPayout no longer routes through the Edge function; the
            // approved status mapping is verified on a method that still does.
            await expect(agencyDriversApi.getSnapshot())
                .rejects.toThrow('This account cannot be modified from this screen.')
        })

        it('logs bounded diagnostics without internal details', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: SQL_DETAIL },
            })

            await expect(agencyDriversApi.createPayout('driver_1', 1000, undefined, 'idem-key-1')).rejects.toThrow(FALLBACK)

            expect(loggerErrorMock).toHaveBeenCalledTimes(1)
            const logged = loggerErrorMock.mock.calls.map((call) => call.join(' ')).join(' ')
            expect(logged).toContain('agency_driver_payout_request')
            expect(logged).not.toContain(SQL_DETAIL)
            expect(logged).not.toContain('otp_hash')
        })
    })

    describe('agencyRegistrationApi.register', () => {
        it('registers agency successfully', async () => {
            const mockInsert = vi.fn().mockResolvedValue({ error: null })
            fromMock.mockReturnValue({
                insert: mockInsert,
            })
            
            await expect(agencyRegistrationApi.register({
                company_name: 'Test Agency',
                gstin: 'GST123',
            }))
                .resolves.not.toThrow()
            
            expect(fromMock).toHaveBeenCalledWith('transport_agencies')
            expect(mockInsert).toHaveBeenCalledWith({
                company_name: 'Test Agency',
                gstin: 'GST123',
            })
        })

        it('throws UserFacingError on registration failure', async () => {
            const mockInsert = vi.fn().mockResolvedValue({ 
                error: { message: 'Insert failed' } 
            })
            fromMock.mockReturnValue({
                insert: mockInsert,
            })
            
            await expect(agencyRegistrationApi.register({
                company_name: 'Test Agency',
            }))
                .rejects.toThrow('Unable to submit agency registration right now. Please try again.')
        })
    })

    // ============= TO-144-D1 fleet foundation (RLS + typed command RPCs) =============
    const vehicleRow = {
        id: '11111111-1111-4111-8111-111111111111',
        agency_id: '22222222-2222-4222-8222-222222222222',
        vehicle_type: 'eicher_14ft',
        rc_number: 'DL01AA1101',
        insurance_expiry: '2027-01-01',
        fitness_expiry: null,
        permit_expiry: null,
        puc_expiry: null,
        payload_kg: 4000,
        body_length_m: 4.26,
        body_width_m: 1.8,
        body_height_m: 1.8,
        is_available: true,
        maintenance_blocked: false,
        maintenance_block_reason: null,
        maintenance_blocked_until: null,
        driver_id: null,
        notes: null,
        version: 3,
        created_at: '2026-10-08T10:00:00Z',
        updated_at: '2026-10-08T10:00:00Z',
    }

    describe('agencyFleetApi.listVehicles', () => {
        function mockFromList(result: { data: unknown; error: unknown }) {
            fromMock.mockReturnValue({ select: vi.fn().mockResolvedValue(result) })
        }

        it('maps RLS rows (including version/maintenance/payload fields) to FleetVehicle[]', async () => {
            mockFromList({ data: [vehicleRow], error: null })

            const result = await agencyFleetApi.listVehicles()

            expect(fromMock).toHaveBeenCalledWith('agency_trucks')
            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({
                id: vehicleRow.id,
                rc_number: 'DL01AA1101',
                version: 3,
                maintenance_blocked: false,
                payload_kg: 4000,
            })
        })

        it('maps an empty list to []', async () => {
            mockFromList({ data: [], error: null })

            await expect(agencyFleetApi.listVehicles()).resolves.toEqual([])
        })

        it('throws UserFacingError with the redacted fallback when the select fails', async () => {
            mockFromList({ data: null, error: { message: 'internal pg_expand_magic detail leaked' } })

            await expect(agencyFleetApi.listVehicles()).rejects.toThrow(UserFacingError)
            await expect(agencyFleetApi.listVehicles()).rejects.toThrow('Failed to load fleet')
            await expect(agencyFleetApi.listVehicles()).rejects.not.toThrow(/leaked/)
        })
    })

    describe('agencyFleetApi.createVehicle', () => {
        it('maps the created envelope to the typed result and passes typed args (no agency id)', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'created', vehicle: vehicleRow, version: 1 },
                error: null,
            })

            const result = await agencyFleetApi.createVehicle({
                rc_number: 'DL01AA1101',
                vehicle_type: 'eicher_14ft',
                insurance_expiry: '2027-01-01',
            })

            expect(result).toEqual({ ok: true, state: 'created', vehicle: vehicleRow, version: 1 })
            expect(rpcMock).toHaveBeenCalledWith('agency_vehicle_create', {
                p_rc_number: 'DL01AA1101',
                p_vehicle_type: 'eicher_14ft',
                p_insurance_expiry: '2027-01-01',
                p_fitness_expiry: undefined,
                p_permit_expiry: undefined,
                p_puc_expiry: undefined,
                p_payload_kg: undefined,
                p_notes: undefined,
            })
        })

        it('maps the idempotent_replay envelope to the typed replay state', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'idempotent_replay', vehicle: vehicleRow, version: 1 },
                error: null,
            })

            const result = await agencyFleetApi.createVehicle({ rc_number: 'DL01AA1101', vehicle_type: 'eicher_14ft' })

            expect(result).toMatchObject({ ok: true, state: 'idempotent_replay' })
        })

        it('passes the controlled denial message through UserFacingError', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'Agency approval is required.' } })

            await expect(agencyFleetApi.createVehicle({ rc_number: 'X', vehicle_type: 'tata_ace' }))
                .rejects.toThrow('Agency approval is required.')
        })

        it('redacts uncontrolled provider errors to the stable fallback', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint "pg_type_typname_index"' } })

            await expect(agencyFleetApi.createVehicle({ rc_number: 'X', vehicle_type: 'tata_ace' }))
                .rejects.toThrow('Failed to add vehicle to fleet')
            await expect(agencyFleetApi.createVehicle({ rc_number: 'X', vehicle_type: 'tata_ace' }))
                .rejects.not.toThrow(/pg_type/)
        })
    })

    describe('agencyFleetApi.updateVehicle', () => {
        it('maps the success envelope to the typed result with the bumped version', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'updated', vehicle: { ...vehicleRow, version: 4 }, version: 4 },
                error: null,
            })

            const result = await agencyFleetApi.updateVehicle(vehicleRow.id, 3, { is_available: false })

            expect(result).toEqual({ ok: true, state: 'updated', vehicle: { ...vehicleRow, version: 4 }, version: 4 })
            expect(rpcMock).toHaveBeenCalledWith('agency_vehicle_update', {
                p_vehicle_id: vehicleRow.id,
                p_expected_version: 3,
                p_patch: { is_available: false },
            })
        })

        it('maps version_conflict to the typed conflict branch WITHOUT throwing', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'version_conflict', current_version: 4 },
                error: null,
            })

            const result = await agencyFleetApi.updateVehicle(vehicleRow.id, 3, { is_available: true })

            expect(result).toEqual({ ok: false, error: 'version_conflict', currentVersion: 4 })
        })

        it('maps truck_in_approved_plan to a typed result WITHOUT throwing', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'truck_in_approved_plan' }, error: null })

            const result = await agencyFleetApi.updateVehicle(vehicleRow.id, 3, { maintenance_blocked: true })

            expect(result).toEqual({
                ok: false,
                error: 'truck_in_approved_plan',
                message: 'This truck is in an approved load plan. Cancel the plan first.',
            })
        })

        it('redacts denial exceptions to UserFacingError', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'Agency approval is required.' } })

            await expect(agencyFleetApi.updateVehicle(vehicleRow.id, 3, {}))
                .rejects.toThrow('Agency approval is required.')
        })
    })

    describe('agencyDriversApi.listEmployments', () => {
        const employmentRow = {
            id: '33333333-3333-4333-8333-333333333333',
            agency_id: '22222222-2222-4222-8222-222222222222',
            driver_id: '44444444-4444-4444-8444-444444444444',
            licence_number: 'DL-0420190001234',
            licence_class: 'LMV-TR',
            licence_expiry: '2027-06-30',
            contact_phone: '9810011223',
            status: 'active',
            version: 1,
            created_at: '2026-10-08T10:00:00Z',
            updated_at: '2026-10-08T10:00:00Z',
        }

        it('maps RLS rows to DriverEmployment[]', async () => {
            fromMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [employmentRow], error: null }) })

            const result = await agencyDriversApi.listEmployments()

            expect(fromMock).toHaveBeenCalledWith('agency_driver_employment')
            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({ id: employmentRow.id, status: 'active', version: 1 })
        })

        it('maps an empty list to []', async () => {
            fromMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) })

            await expect(agencyDriversApi.listEmployments()).resolves.toEqual([])
        })

        it('throws UserFacingError with the redacted fallback on failure', async () => {
            fromMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: null, error: { message: 'hidden catalog internals' } }) })

            await expect(agencyDriversApi.listEmployments()).rejects.toThrow('Failed to load driver employments')
        })
    })

    describe('agencyDriversApi.endEmployment', () => {
        const employmentId = '33333333-3333-4333-8333-333333333333'

        it('maps the ended envelope to the typed result', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'ended', version: 3 },
                error: null,
            })

            const result = await agencyDriversApi.endEmployment(employmentId, 2)

            expect(result).toEqual({ ok: true, state: 'ended', version: 3 })
            expect(rpcMock).toHaveBeenCalledWith('agency_driver_employment_end', {
                p_employment_id: employmentId,
                p_expected_version: 2,
            })
        })

        it('maps the already_ended replay envelope', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'already_ended', version: 3 },
                error: null,
            })

            await expect(agencyDriversApi.endEmployment(employmentId, 3)).resolves.toEqual({
                ok: true, state: 'already_ended', version: 3,
            })
        })

        it('maps version_conflict to the typed conflict branch WITHOUT throwing', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'version_conflict', current_version: 4 },
                error: null,
            })

            await expect(agencyDriversApi.endEmployment(employmentId, 2)).resolves.toEqual({
                ok: false, error: 'version_conflict', currentVersion: 4,
            })
        })

        it('maps driver_has_active_assignment to a typed refusal WITHOUT throwing', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'driver_has_active_assignment' },
                error: null,
            })

            await expect(agencyDriversApi.endEmployment(employmentId, 2)).resolves.toEqual({
                ok: false, error: 'driver_has_active_assignment',
            })
        })

        it('redacts denial exceptions to UserFacingError', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'Agency approval is required.' } })

            await expect(agencyDriversApi.endEmployment(employmentId, 2))
                .rejects.toThrow('Agency approval is required.')
        })
    })
})
