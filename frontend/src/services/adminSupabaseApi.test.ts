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
                .rejects.toThrow('Failed to load agencies')
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
                .rejects.toThrow('Failed to approve agency. Please try again.')
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
                .rejects.toThrow('Failed to reject agency. Please try again.')
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
                .rejects.toThrow('Failed to suspend agency. Please try again.')
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
                .rejects.toThrow('Failed to load payouts')
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
                .rejects.toThrow('Failed to approve payout. Please try again.')
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
                .rejects.toThrow('Failed to reject payout. Please try again.')
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
                .rejects.toThrow('Failed to mark payout as paid. Please try again.')
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
                .rejects.toThrow('Failed to load dashboard analytics. Please try again.')
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
                .rejects.toThrow('Unable to load users right now. Please try again.')
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
                .rejects.toThrow('Failed to delete the user account')
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
                .rejects.toThrow('Failed to disable the user account')
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
                .rejects.toThrow('Failed to re-enable the user account')
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
                .rejects.toThrow('Unable to load contact inquiries right now. Please try again.')
        })
    })

    // TO-131: safe admin error boundaries. Raw provider/edge-function error
    // strings must never reach the user; only approved typed status codes may
    // influence the user-facing message.
    describe('safe error boundary (TO-131)', () => {
        const FALLBACK = 'Unable to load users right now. Please try again.'
        const SQL_DETAIL = 'SQLSTATE 42703: relation "public.profiles" does not exist, column "otp_hash"'
        const JWT_LIKE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJzZXJ2aWNlIn0.f4k3s1gn4tur3'

        function functionHttpError(status: number, body: string, contentType = 'application/json') {
            return {
                name: 'FunctionsHttpError',
                message: 'Edge Function returned a non-2xx status code',
                context: new Response(body, { status, headers: { 'Content-Type': contentType } }),
            }
        }

        it('does not surface SQL table/column details', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(500, JSON.stringify({ error: SQL_DETAIL })),
            })

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)
        })

        it('does not surface JWT-like response payloads', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(502, JSON.stringify({ error: `upstream auth failed: ${JWT_LIKE}` })),
            })

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)
        })

        it('does not surface stack traces from raw error messages', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: new Error(`TypeError: x is not a function\n    at handler (file:///srv/index.ts:42:15)\n    at ${JWT_LIKE}`),
            })

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)
        })

        it('does not surface HTML provider responses', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(502, '<html><body><h1>502 Bad Gateway</h1><p>nginx/1.24.0</p></body></html>', 'text/html'),
            })

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)
        })

        it('does not surface malformed JSON responses', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(500, '{not valid json'),
            })

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)
        })

        it('does not surface network failure internals', async () => {
            invokeMock.mockRejectedValue(new Error('Failed to send a request to the Edge Function: getaddrinfo ENOTFOUND'))

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)
        })

        it('does not surface unknown error shapes', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { code: 'PGRST116', details: SQL_DETAIL, hint: null },
            })

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)
        })

        it('maps an approved 401 code to a sign-in message', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(401, JSON.stringify({ error: 'Authentication is required.' })),
            })

            await expect(adminSupabaseApi.getAdminUsers())
                .rejects.toThrow('Your session has expired. Please sign in again.')
        })

        it('maps an approved 403 code to a permission message', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(403, JSON.stringify({ error: 'Admin access is required.' })),
            })

            await expect(adminSupabaseApi.getAdminUsers())
                .rejects.toThrow('You do not have permission to perform this action.')
        })

        it('maps an approved 409 code to an account-guard message', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(409, JSON.stringify({ error: 'Portal admins cannot be disabled or deleted from this screen.' })),
            })

            await expect(adminSupabaseApi.banUser('user_1'))
                .rejects.toThrow('This account cannot be modified from this screen.')
        })

        it('logs bounded diagnostics without internal details', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: functionHttpError(500, JSON.stringify({ error: SQL_DETAIL })),
            })

            await expect(adminSupabaseApi.getAdminUsers()).rejects.toThrow(FALLBACK)

            expect(loggerErrorMock).toHaveBeenCalledTimes(1)
            const logged = loggerErrorMock.mock.calls.map((call) => call.join(' ')).join(' ')
            expect(logged).toContain('admin-portal-users')
            expect(logged).toContain('500')
            expect(logged).not.toContain(SQL_DETAIL)
            expect(logged).not.toContain('otp_hash')
            expect(logged).not.toContain('Edge Function returned a non-2xx status code')
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
                .rejects.toThrow('Unable to update this inquiry right now. Please try again.')
        })
    })
})