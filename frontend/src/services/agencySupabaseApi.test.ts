import { beforeEach, describe, expect, it, vi } from 'vitest'

const fromMock = vi.hoisted(() => vi.fn())
const selectMock = vi.hoisted(() => vi.fn())
const eqMock = vi.hoisted(() => vi.fn())
const orderMock = vi.hoisted(() => vi.fn()
)
const limitMock = vi.hoisted(() => vi.fn())
const singleMock = vi.hoisted(() => vi.fn())
const maybeSingleMock = vi.hoisted(() => vi.fn())
const inMock = vi.hoisted(() => vi.fn())
const gteMock = vi.hoisted(() => vi.fn())
const updateMock = vi.hoisted(() => vi.fn())
const insertMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: fromMock,
    },
}))

import {
    agencyDashboardApi,
    agencyJobsApi,
    agencyFleetApi,
    agencyRatesApi,
    agencyBillingApi,
    agencyDriversApi,
} from './agencySupabaseApi'

describe('agencySupabaseApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        
        fromMock.mockReturnValue({
            select: selectMock,
            update: updateMock,
            insert: insertMock,
        })
        
        // The real supabase-js builder is thenable at every link and fully
        // chainable. Non-terminal links resolve with limitMock's configured
        // value, so per-test `limitMock.mockResolvedValue[...]` drives the
        // data. Query errors arrive as resolved `{ error }` payloads
        // (the builder never rejects on query failure).
        const resolveWithLimit = (resolve: (value: unknown) => void) => {
            Promise.resolve(limitMock()).then(resolve, resolve)
        }

        selectMock.mockReturnValue({
            eq: eqMock,
            order: orderMock,
            limit: limitMock,
            single: singleMock,
            maybeSingle: maybeSingleMock,
            then: resolveWithLimit,
        })

        eqMock.mockReturnValue({
            select: selectMock,
            eq: eqMock,
            in: inMock,
            gte: gteMock,
            order: orderMock,
            limit: limitMock,
            single: singleMock,
            maybeSingle: maybeSingleMock,
            then: resolveWithLimit,
        })

        inMock.mockReturnValue({
            order: orderMock,
            limit: limitMock,
            then: resolveWithLimit,
        })

        gteMock.mockReturnValue({
            order: orderMock,
            limit: limitMock,
            then: resolveWithLimit,
        })

        orderMock.mockReturnValue({
            eq: eqMock,
            limit: limitMock,
            then: resolveWithLimit,
        })

        limitMock.mockReturnValue({
            maybeSingle: maybeSingleMock,
            then: (resolve: (value: unknown) => void) => {
                resolve({ data: [], error: null, count: 0 })
            },
        })
        
        singleMock.mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
        })
        
        maybeSingleMock.mockResolvedValue({
            data: null,
            error: null,
        })
        
        updateMock.mockReturnValue({
            select: selectMock,
        })
    })

    describe('agencyDashboardApi.getAgencyProfile', () => {
        it('returns null when profile not found', async () => {
            const result = await agencyDashboardApi.getAgencyProfile('user_1')
            
            expect(result).toBeNull()
        })

        it('returns agency profile when found', async () => {
            const mockProfile = {
                id: 'agency_1',
                company_name: 'Test Agency',
                status: 'approved' as const,
                rating: 4.5,
                total_jobs: 100,
                fleet_size: 10,
                city: 'Mumbai',
                gstin: 'GST123',
                user_id: 'user_1',
            }
            maybeSingleMock.mockResolvedValue({
                data: mockProfile,
                error: null,
            })
            
            const result = await agencyDashboardApi.getAgencyProfile('user_1')
            
            expect(result).toEqual(mockProfile)
        })

        it('throws UserFacingError on query failure', async () => {
            maybeSingleMock.mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
            })
            
            await expect(agencyDashboardApi.getAgencyProfile('user_1'))
                .rejects.toThrow('Failed to load agency profile')
        })
    })

    describe('agencyDashboardApi.getJobSummary', () => {
        it('returns zero summary when no data exists', async () => {
            const result = await agencyDashboardApi.getJobSummary('agency_1')
            
            expect(result).toEqual({
                active: 0,
                today: 0,
                pending: 0,
                thirtyDayRevenue: 0,
                thirtyDayJobs: 0,
            })
        })

        it('calculates summary correctly', async () => {
            limitMock.mockResolvedValueOnce({
                data: null,
                error: null,
                count: 5, // active jobs
            })
            limitMock.mockResolvedValueOnce({
                data: null,
                error: null,
                count: 2, // today jobs
            })
            limitMock.mockResolvedValueOnce({
                data: null,
                error: null,
                count: 1, // pending jobs
            })
            limitMock.mockResolvedValue({
                data: [
                    { fare: 1000 },
                    { fare: 1500 },
                    { fare: 500 },
                ],
                error: null,
            })
            
            const result = await agencyDashboardApi.getJobSummary('agency_1')
            
            expect(result.active).toBe(5)
            expect(result.today).toBe(2)
            expect(result.pending).toBe(1)
            expect(result.thirtyDayJobs).toBe(3)
            expect(result.thirtyDayRevenue).toBe(3000)
        })

        it('handles null fare values in revenue calculation', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { fare: 1000 },
                    { fare: null },
                    { fare: 500 },
                ],
                error: null,
            })
            
            const result = await agencyDashboardApi.getJobSummary('agency_1')
            
            expect(result.thirtyDayRevenue).toBe(1500)
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Connection failed' },
                count: null,
            })
            
            await expect(agencyDashboardApi.getJobSummary('agency_1'))
                .rejects.toThrow('Failed to load job summary')
        })
    })

    describe('agencyJobsApi.getAll', () => {
        it('returns empty array when no jobs exist', async () => {
            const result = await agencyJobsApi.getAll('agency_1')
            
            expect(result).toEqual([])
        })

        it('applies status filter when provided', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { id: 'job_1', status: 'accepted' },
                ],
                error: null,
            })
            
            const result = await agencyJobsApi.getAll('agency_1', { status: 'accepted' })
            
            expect(result).toHaveLength(1)
            expect(eqMock).toHaveBeenCalledWith('status', 'accepted')
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Query failed' },
            })
            
            await expect(agencyJobsApi.getAll('agency_1'))
                .rejects.toThrow('Failed to load jobs')
        })
    })

    describe('agencyJobsApi.getById', () => {
        it('throws UserFacingError when job not found', async () => {
            singleMock.mockResolvedValue({
                data: null,
                error: { message: 'Not found' },
            })

            await expect(agencyJobsApi.getById('job_1'))
                .rejects.toThrow('Failed to load job details')
        })

        it('returns job when found', async () => {
            const mockJob = {
                id: 'job_1',
                shipment_id: 'ship_1',
                fare: 1000,
                status: 'accepted',
            }
            singleMock.mockResolvedValue({
                data: mockJob,
                error: null,
            })
            
            const result = await agencyJobsApi.getById('job_1')
            
            expect(result).toEqual(mockJob)
        })

        it('throws UserFacingError on query failure', async () => {
            singleMock.mockResolvedValue({
                data: null,
                error: { message: 'Connection error' },
            })
            
            await expect(agencyJobsApi.getById('job_1'))
                .rejects.toThrow('Failed to load job details')
        })
    })

    describe('agencyJobsApi.updateStatus', () => {
        it('updates job status successfully', async () => {
            const updatedJob = {
                id: 'job_1',
                status: 'completed',
                updated_at: new Date().toISOString(),
            }
            
            updateMock.mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: updatedJob,
                            error: null,
                        }),
                    }),
                }),
            })
            
            const result = await agencyJobsApi.updateStatus('job_1', 'completed')
            
            expect(result).toEqual(updatedJob)
        })

        it('throws UserFacingError on update failure', async () => {
            updateMock.mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: 'Update failed' },
                        }),
                    }),
                }),
            })
            
            await expect(agencyJobsApi.updateStatus('job_1', 'completed'))
                .rejects.toThrow('Failed to update job status')
        })
    })

    describe('agencyFleetApi.getFleet', () => {
        it('returns empty array (TODO implementation)', async () => {
            const result = await agencyFleetApi.getFleet('agency_1')
            
            expect(result).toEqual([])
        })
    })

    describe('agencyFleetApi.updateAssignment', () => {
        it('throws UserFacingError (TODO implementation)', async () => {
            await expect(agencyFleetApi.updateAssignment('fleet_1', 'truck_1'))
                .rejects.toThrow('Fleet assignment update not implemented')
        })
    })

    describe('agencyRatesApi.getAll', () => {
        it('returns empty array (TODO implementation)', async () => {
            const result = await agencyRatesApi.getAll('agency_1')
            
            expect(result).toEqual([])
        })
    })

    describe('agencyRatesApi.create', () => {
        it('throws UserFacingError (TODO implementation)', async () => {
            await expect(agencyRatesApi.create({
                agency_id: 'agency_1',
                route_name: 'Test Route',
                per_km_rate: 10,
                base_rate: 100,
                vehicle_type: 'truck',
                status: 'active',
            }))
                .rejects.toThrow('Rate creation not implemented')
        })
    })

    describe('agencyRatesApi.update', () => {
        it('throws UserFacingError (TODO implementation)', async () => {
            await expect(agencyRatesApi.update('rate_1', { per_km_rate: 15 }))
                .rejects.toThrow('Rate update not implemented')
        })
    })

    describe('agencyRatesApi.delete', () => {
        it('throws UserFacingError (TODO implementation)', async () => {
            await expect(agencyRatesApi.delete('rate_1'))
                .rejects.toThrow('Rate deletion not implemented')
        })
    })

    describe('agencyBillingApi.getBillingData', () => {
        it('returns zero billing data (TODO implementation)', async () => {
            const result = await agencyBillingApi.getBillingData('agency_1')
            
            expect(result).toEqual({
                pendingAmount: 0,
                paidAmount: 0,
                totalEarnings: 0,
                thirtyDayEarnings: 0,
                invoiceCount: 0,
            })
        })
    })

    describe('agencyDriversApi.getAll', () => {
        it('returns empty array (TODO implementation)', async () => {
            const result = await agencyDriversApi.getAll('agency_1')
            
            expect(result).toEqual([])
        })
    })

    describe('agencyDriversApi.add', () => {
        it('throws UserFacingError (TODO implementation)', async () => {
            await expect(agencyDriversApi.add('agency_1', 'driver_1'))
                .rejects.toThrow('Driver assignment not implemented')
        })
    })

    describe('agencyDriversApi.remove', () => {
        it('throws UserFacingError (TODO implementation)', async () => {
            await expect(agencyDriversApi.remove('driver_1'))
                .rejects.toThrow('Driver removal not implemented')
        })
    })
})
