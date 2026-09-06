import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: fromMock,
        functions: {
            invoke: invokeMock,
        },
    },
}))

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
                .rejects.toThrow('Function error')
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
        it('updates job status successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-jobs', {
                method: 'POST',
                body: {
                    action: 'update-status',
                    jobId: 'job_1',
                    status: 'completed',
                },
            })
        })

        it('throws UserFacingError on update failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Update failed' },
            })
            
            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .rejects.toThrow('Failed to update job status')
        })
    })

    describe('agencyJobsApi.assignDriver', () => {
        it('assigns driver successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyJobsApi.assignDriver('job_1', 'driver_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-jobs', {
                method: 'POST',
                body: {
                    action: 'assign-driver',
                    jobId: 'job_1',
                    driverId: 'driver_1',
                },
            })
        })

        it('throws UserFacingError on assignment failure', async () => {
            invokeMock.mockResolvedValue({
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
                .rejects.toThrow('Function error')
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
                .rejects.toThrow('Function error')
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
                .rejects.toThrow('Function error')
        })
    })

    describe('agencyDriversApi.assignTruckToDriver', () => {
        it('assigns truck successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-drivers', {
                body: {
                    action: 'assign-truck',
                    truckId: 'truck_1',
                    driverId: 'driver_1',
                },
            })
        })

        it('throws UserFacingError on assignment failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Assignment failed' },
            })
            
            await expect(agencyDriversApi.assignTruckToDriver('truck_1', 'driver_1'))
                .rejects.toThrow('Assignment failed')
        })
    })

    describe('agencyDriversApi.unassignTruck', () => {
        it('unassigns truck successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-drivers', {
                body: {
                    action: 'unassign-truck',
                    truckId: 'truck_1',
                },
            })
        })

        it('throws UserFacingError on unassignment failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Unassignment failed' },
            })
            
            await expect(agencyDriversApi.unassignTruck('truck_1'))
                .rejects.toThrow('Unassignment failed')
        })
    })

    describe('agencyDriversApi.createPayout', () => {
        it('creates payout successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyDriversApi.createPayout('driver_1', 1000))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-drivers', {
                body: {
                    action: 'create-payout',
                    driverId: 'driver_1',
                    amount: 1000,
                },
            })
        })

        it('creates payout with note', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(agencyDriversApi.createPayout('driver_1', 1000, 'Test note'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('agency-portal-drivers', {
                body: {
                    action: 'create-payout',
                    driverId: 'driver_1',
                    amount: 1000,
                    note: 'Test note',
                },
            })
        })

        it('throws UserFacingError on create failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Create failed' },
            })
            
            await expect(agencyDriversApi.createPayout('driver_1', 1000))
                .rejects.toThrow('Create failed')
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
})
