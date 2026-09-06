import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
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
    adminAgenciesApi,
    adminPayoutsApi,
    adminDashboardApi,
    adminSupabaseApi,
    type Agency,
    type DriverPayout,
} from './adminSupabaseApi'

describe('adminSupabaseApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        loggerErrorMock.mockReset()
    })

    describe('adminAgenciesApi.getSnapshot', () => {
        it('returns empty snapshot when no agencies exist', async () => {
            invokeMock.mockResolvedValue({
                data: {
                    agencies: [],
                    counts: { pending: 0, approved: 0, rejected: 0, suspended: 0 },
                },
                error: null,
            })
            
            const result = await adminAgenciesApi.getSnapshot('pending')
            
            expect(result.agencies).toEqual([])
            expect(result.counts).toEqual({ pending: 0, approved: 0, rejected: 0, suspended: 0 })
        })

        it('returns agencies and counts when data exists', async () => {
            const mockAgencies: Agency[] = [
                {
                    id: 'agency_1',
                    company_name: 'Test Agency',
                    status: 'pending',
                    rating: null,
                    total_jobs: null,
                    fleet_size: null,
                    city: null,
                    gstin: null,
                    pan_number: null,
                    transport_license: 'LIC123',
                    contact_name: null,
                    contact_phone: null,
                    state: null,
                    operating_routes: null,
                    created_at: '2024-01-01T00:00:00Z',
                    approved_at: null,
                    rejection_reason: null,
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: {
                    agencies: mockAgencies,
                    counts: { pending: 1, approved: 0, rejected: 0, suspended: 0 },
                },
                error: null,
            })
            
            const result = await adminAgenciesApi.getSnapshot('pending')
            
            expect(result.agencies).toEqual(mockAgencies)
            expect(result.counts.pending).toBe(1)
        })

        it('handles missing data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await adminAgenciesApi.getSnapshot('pending')
            
            expect(result.agencies).toEqual([])
            expect(result.counts).toEqual({ pending: 0, approved: 0, rejected: 0, suspended: 0 })
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(adminAgenciesApi.getSnapshot('pending'))
                .rejects.toThrow('Function error')
        })
    })

    describe('adminAgenciesApi.approve', () => {
        it('approves agency successfully', async () => {
            const mockAgency: Agency = {
                id: 'agency_1',
                company_name: 'Test Agency',
                status: 'approved',
                rating: null,
                total_jobs: null,
                fleet_size: null,
                city: null,
                gstin: null,
                pan_number: null,
                transport_license: 'LIC123',
                contact_name: null,
                contact_phone: null,
                state: null,
                operating_routes: null,
                created_at: '2024-01-01T00:00:00Z',
                approved_at: '2024-01-02T00:00:00Z',
                rejection_reason: null,
            }
            
            invokeMock.mockResolvedValue({
                data: { agency: mockAgency },
                error: null,
            })
            
            const result = await adminAgenciesApi.approve('agency_1')
            
            expect(result).toEqual(mockAgency)
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-agencies', { body: {
                action: 'approve',
                agencyId: 'agency_1',
            } })
        })

        it('throws UserFacingError on approval failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Approval failed' },
            })
            
            await expect(adminAgenciesApi.approve('agency_1'))
                .rejects.toThrow('Approval failed')
        })
    })

    describe('adminAgenciesApi.reject', () => {
        it('rejects agency successfully', async () => {
            const mockAgency: Agency = {
                id: 'agency_1',
                company_name: 'Test Agency',
                status: 'rejected',
                rating: null,
                total_jobs: null,
                fleet_size: null,
                city: null,
                gstin: null,
                pan_number: null,
                transport_license: 'LIC123',
                contact_name: null,
                contact_phone: null,
                state: null,
                operating_routes: null,
                created_at: '2024-01-01T00:00:00Z',
                approved_at: null,
                rejection_reason: 'Insufficient documents',
            }
            
            invokeMock.mockResolvedValue({
                data: { agency: mockAgency },
                error: null,
            })
            
            const result = await adminAgenciesApi.reject('agency_1', 'Insufficient documents')
            
            expect(result).toEqual(mockAgency)
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-agencies', { body: {
                action: 'reject',
                agencyId: 'agency_1',
                rejectionReason: 'Insufficient documents',
            } })
        })

        it('throws UserFacingError on rejection failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Rejection failed' },
            })
            
            await expect(adminAgenciesApi.reject('agency_1', 'Reason'))
                .rejects.toThrow('Rejection failed')
        })
    })

    describe('adminAgenciesApi.suspend', () => {
        it('suspends agency successfully', async () => {
            const mockAgency: Agency = {
                id: 'agency_1',
                company_name: 'Test Agency',
                status: 'suspended',
                rating: null,
                total_jobs: null,
                fleet_size: null,
                city: null,
                gstin: null,
                pan_number: null,
                transport_license: 'LIC123',
                contact_name: null,
                contact_phone: null,
                state: null,
                operating_routes: null,
                created_at: '2024-01-01T00:00:00Z',
                approved_at: null,
                rejection_reason: null,
            }
            
            invokeMock.mockResolvedValue({
                data: { agency: mockAgency },
                error: null,
            })
            
            const result = await adminAgenciesApi.suspend('agency_1')
            
            expect(result).toEqual(mockAgency)
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-agencies', { body: {
                action: 'suspend',
                agencyId: 'agency_1',
            } })
        })

        it('throws UserFacingError on suspension failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Suspension failed' },
            })
            
            await expect(adminAgenciesApi.suspend('agency_1'))
                .rejects.toThrow('Suspension failed')
        })
    })

    describe('adminPayoutsApi.getAll', () => {
        it('returns empty array when no payouts exist', async () => {
            invokeMock.mockResolvedValue({
                data: { payouts: [] },
                error: null,
            })
            
            const result = await adminPayoutsApi.getAll()
            
            expect(result).toEqual([])
        })

        it('returns payouts when data exists', async () => {
            const mockPayouts: DriverPayout[] = [
                {
                    id: 'payout_1',
                    driver_id: 'driver_1',
                    amount: 1000,
                    status: 'pending',
                    requested_at: '2024-01-01T00:00:00Z',
                    processed_at: null,
                    note: null,
                    drivers: {
                        full_name: 'Test Driver',
                        phone: '9876543210',
                    },
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: { payouts: mockPayouts },
                error: null,
            })
            
            const result = await adminPayoutsApi.getAll()
            
            expect(result).toEqual(mockPayouts)
        })

        it('handles missing payouts data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await adminPayoutsApi.getAll()
            
            expect(result).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(adminPayoutsApi.getAll())
                .rejects.toThrow('Function error')
        })
    })

    describe('adminPayoutsApi.approve', () => {
        it('approves payout successfully', async () => {
            const mockPayout: DriverPayout = {
                id: 'payout_1',
                driver_id: 'driver_1',
                amount: 1000,
                status: 'approved',
                requested_at: '2024-01-01T00:00:00Z',
                processed_at: '2024-01-02T00:00:00Z',
                note: null,
                drivers: null,
            }
            
            invokeMock.mockResolvedValue({
                data: { payout: mockPayout },
                error: null,
            })
            
            const result = await adminPayoutsApi.approve('payout_1')
            
            expect(result).toEqual(mockPayout)
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-payouts', { body: {
                action: 'approve',
                payoutId: 'payout_1',
            } })
        })

        it('throws UserFacingError on approval failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Approval failed' },
            })
            
            await expect(adminPayoutsApi.approve('payout_1'))
                .rejects.toThrow('Approval failed')
        })
    })

    describe('adminPayoutsApi.reject', () => {
        it('rejects payout successfully', async () => {
            const mockPayout: DriverPayout = {
                id: 'payout_1',
                driver_id: 'driver_1',
                amount: 1000,
                status: 'rejected',
                requested_at: '2024-01-01T00:00:00Z',
                processed_at: '2024-01-02T00:00:00Z',
                note: 'Insufficient balance',
                drivers: null,
            }
            
            invokeMock.mockResolvedValue({
                data: { payout: mockPayout },
                error: null,
            })
            
            const result = await adminPayoutsApi.reject('payout_1', 'Insufficient balance')
            
            expect(result).toEqual(mockPayout)
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-payouts', { body: {
                action: 'reject',
                payoutId: 'payout_1',
                rejectionNote: 'Insufficient balance',
            } })
        })

        it('throws UserFacingError on rejection failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Rejection failed' },
            })
            
            await expect(adminPayoutsApi.reject('payout_1', 'Reason'))
                .rejects.toThrow('Rejection failed')
        })
    })

    describe('adminPayoutsApi.markAsPaid', () => {
        it('marks payout as paid successfully', async () => {
            const mockPayout: DriverPayout = {
                id: 'payout_1',
                driver_id: 'driver_1',
                amount: 1000,
                status: 'paid',
                requested_at: '2024-01-01T00:00:00Z',
                processed_at: '2024-01-02T00:00:00Z',
                note: null,
                drivers: null,
            }
            
            invokeMock.mockResolvedValue({
                data: { payout: mockPayout },
                error: null,
            })
            
            const result = await adminPayoutsApi.markAsPaid('payout_1')
            
            expect(result).toEqual(mockPayout)
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-payouts', { body: {
                action: 'mark-paid',
                payoutId: 'payout_1',
            } })
        })

        it('throws UserFacingError on mark as paid failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Mark as paid failed' },
            })
            
            await expect(adminPayoutsApi.markAsPaid('payout_1'))
                .rejects.toThrow('Mark as paid failed')
        })
    })

    describe('adminDashboardApi.getSnapshot', () => {
        it('returns dashboard snapshot', async () => {
            const mockAnalytics = {
                totalRevenue: 100000,
                agencyRevenue: 60000,
                driverRevenue: 30000,
                directAppRevenue: 10000,
                directAppBookingValue: 5000,
                directAppBookingCount: 10,
                totalAgencies: 5,
                totalDrivers: 20,
                totalShipments: 100,
                platformFee: 10000,
            }
            
            invokeMock.mockResolvedValue({
                data: {
                    analytics: mockAnalytics,
                    recentJobs: [],
                },
                error: null,
            })
            
            const result = await adminDashboardApi.getSnapshot()
            
            expect(result.analytics).toEqual(mockAnalytics)
            expect(result.recentJobs).toEqual([])
        })

        it('applies limit parameter', async () => {
            invokeMock.mockResolvedValue({
                data: {
                    analytics: {},
                    recentJobs: [],
                },
                error: null,
            })
            
            await adminDashboardApi.getSnapshot(50)
            
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-dashboard', { body: {
                action: 'snapshot',
                limit: 50,
            } })
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(adminDashboardApi.getSnapshot())
                .rejects.toThrow('Function error')
        })
    })

    describe('adminSupabaseApi.getAdminDashboardData', () => {
        it('returns analytics from snapshot', async () => {
            const mockAnalytics = {
                totalRevenue: 100000,
                agencyRevenue: 60000,
                driverRevenue: 30000,
                directAppRevenue: 10000,
                directAppBookingValue: 5000,
                directAppBookingCount: 10,
                totalAgencies: 5,
                totalDrivers: 20,
                totalShipments: 100,
                platformFee: 10000,
            }
            
            invokeMock.mockResolvedValue({
                data: {
                    analytics: mockAnalytics,
                    recentJobs: [],
                },
                error: null,
            })
            
            const result = await adminSupabaseApi.getAdminDashboardData()
            
            expect(result).toEqual(mockAnalytics)
        })
    })

    describe('adminSupabaseApi.getAdminUsers', () => {
        it('returns empty array when no users exist', async () => {
            invokeMock.mockResolvedValue({
                data: { users: [] },
                error: null,
            })
            
            const result = await adminSupabaseApi.getAdminUsers()
            
            expect(result).toEqual([])
        })

        it('returns users when data exists', async () => {
            const mockUsers = [
                {
                    id: 'user_1',
                    email: 'admin@example.com',
                    role: 'admin',
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                    account_status: 'active' as const,
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: { users: mockUsers },
                error: null,
            })
            
            const result = await adminSupabaseApi.getAdminUsers()
            
            expect(result).toEqual(mockUsers)
        })

        it('handles missing users data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await adminSupabaseApi.getAdminUsers()
            
            expect(result).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(adminSupabaseApi.getAdminUsers())
                .rejects.toThrow('Function error')
        })
    })

    describe('adminSupabaseApi.deleteUser', () => {
        it('deletes user successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(adminSupabaseApi.deleteUser('user_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-users', { body: {
                action: 'delete',
                userId: 'user_1',
            } })
        })

        it('throws UserFacingError on deletion failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Deletion failed' },
            })
            
            await expect(adminSupabaseApi.deleteUser('user_1'))
                .rejects.toThrow('Deletion failed')
        })
    })

    describe('adminSupabaseApi.banUser', () => {
        it('bans user successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(adminSupabaseApi.banUser('user_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-users', { body: {
                action: 'set-disabled',
                userId: 'user_1',
                disabled: true,
            } })
        })

        it('throws UserFacingError on ban failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Ban failed' },
            })
            
            await expect(adminSupabaseApi.banUser('user_1'))
                .rejects.toThrow('Ban failed')
        })
    })

    describe('adminSupabaseApi.unbanUser', () => {
        it('unbans user successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(adminSupabaseApi.unbanUser('user_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-users', { body: {
                action: 'set-disabled',
                userId: 'user_1',
                disabled: false,
            } })
        })

        it('throws UserFacingError on unban failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Unban failed' },
            })
            
            await expect(adminSupabaseApi.unbanUser('user_1'))
                .rejects.toThrow('Unban failed')
        })
    })

    describe('adminSupabaseApi.getContactInquiries', () => {
        it('returns empty array when no inquiries exist', async () => {
            invokeMock.mockResolvedValue({
                data: { inquiries: [] },
                error: null,
            })
            
            const result = await adminSupabaseApi.getContactInquiries()
            
            expect(result).toEqual([])
        })

        it('returns inquiries when data exists', async () => {
            const mockInquiries = [
                {
                    id: 'inquiry_1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '9876543210',
                    subject: 'Test Subject',
                    message: 'Test message',
                    status: 'open' as const,
                    created_at: '2024-01-01T00:00:00Z',
                },
            ]
            
            invokeMock.mockResolvedValue({
                data: { inquiries: mockInquiries },
                error: null,
            })
            
            const result = await adminSupabaseApi.getContactInquiries()
            
            expect(result).toEqual(mockInquiries)
        })

        it('handles missing inquiries data gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await adminSupabaseApi.getContactInquiries()
            
            expect(result).toEqual([])
        })

        it('throws UserFacingError on function failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Function error' },
            })
            
            await expect(adminSupabaseApi.getContactInquiries())
                .rejects.toThrow('Function error')
        })
    })

    describe('adminSupabaseApi.resolveContactInquiry', () => {
        it('resolves inquiry successfully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            await expect(adminSupabaseApi.resolveContactInquiry('inquiry_1'))
                .resolves.not.toThrow()
            
            expect(invokeMock).toHaveBeenCalledWith('admin-portal-contact', { body: {
                action: 'resolve',
                inquiryId: 'inquiry_1',
            } })
        })

        it('throws UserFacingError on resolve failure', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Resolve failed' },
            })
            
            await expect(adminSupabaseApi.resolveContactInquiry('inquiry_1'))
                .rejects.toThrow('Resolve failed')
        })
    })
})