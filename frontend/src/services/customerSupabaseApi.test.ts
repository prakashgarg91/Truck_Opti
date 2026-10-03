import { beforeEach, describe, expect, it, vi } from 'vitest'

const fromMock = vi.hoisted(() => vi.fn())
const selectMock = vi.hoisted(() => vi.fn())
const eqMock = vi.hoisted(() => vi.fn())
const orderMock = vi.hoisted(() => vi.fn()
)
const limitMock = vi.hoisted(() => vi.fn())
const singleMock = vi.hoisted(() => vi.fn())
const maybeSingleMock = vi.hoisted(() => vi.fn())
const gtMock = vi.hoisted(() => vi.fn())
const updateMock = vi.hoisted(() => vi.fn())
const insertMock = vi.hoisted(() => vi.fn())
const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: fromMock,
        rpc: rpcMock,
    },
}))

import {
    customerDashboardApi,
    customerShipmentsApi,
    customerTrackingApi,
    driverEarningsApi,
    driverTripsApi,
    driverDashboardApi,
    trucksApi,
} from './customerSupabaseApi'
import type { ShipmentDetail } from './customerSupabaseApi'

describe('customerSupabaseApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        
        fromMock.mockReturnValue({
            select: selectMock,
            update: updateMock,
            insert: insertMock,
        })
        
        // The real supabase-js builder is thenable at every link and fully
        // chainable. Non-terminal links resolve with limitMock's configured
        // value, so per-test `limitMock.mockResolvedValue(...)` drives the
        // data for select/eq/gt/order-awaited queries. Query errors arrive
        // as resolved `{ error }` payloads (the builder never rejects).
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
            gt: gtMock,
            order: orderMock,
            limit: limitMock,
            single: singleMock,
            maybeSingle: maybeSingleMock,
            then: resolveWithLimit,
        })

        gtMock.mockReturnValue({
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
            eq: eqMock,
            select: selectMock,
        })
    })

    describe('customerDashboardApi.getDashboardStats', () => {
        it('returns zero stats when no data exists', async () => {
            const result = await customerDashboardApi.getDashboardStats()
            
            expect(result).toEqual({
                activeShipments: 0,
                trucksCount: 0,
                routesToday: 0,
                deliveriesDone: 0,
            })
        })

        it('calculates active shipments correctly', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { status: 'in_transit' },
                    { status: 'pending' },
                    { status: 'delivered' },
                ],
                error: null,
                count: 3,
            })
            
            const result = await customerDashboardApi.getDashboardStats()
            
            expect(result.activeShipments).toBe(1)
        })

        it('calculates deliveries correctly', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { status: 'delivered' },
                    { status: 'delivered' },
                    { status: 'pending' },
                ],
                error: null,
                count: 3,
            })
            
            const result = await customerDashboardApi.getDashboardStats()
            
            expect(result.deliveriesDone).toBe(2)
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
                count: null,
            })
            
            await expect(customerDashboardApi.getDashboardStats())
                .rejects.toThrow('Failed to load dashboard statistics')
        })
    })

    describe('customerDashboardApi.getManagementCounts', () => {
        it('returns zero counts when no data exists', async () => {
            const result = await customerDashboardApi.getManagementCounts()
            
            expect(result).toEqual({
                trucks: 0,
                cartons: 0,
                customers: 0,
            })
        })

        it('returns counts from queries', async () => {
            limitMock.mockResolvedValue({
                data: [],
                error: null,
                count: 5,
            })
            
            const result = await customerDashboardApi.getManagementCounts()
            
            expect(result.trucks).toBe(5)
            expect(result.cartons).toBe(5)
            expect(result.customers).toBe(5)
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Connection failed' },
                count: null,
            })
            
            await expect(customerDashboardApi.getManagementCounts())
                .rejects.toThrow('Failed to load management data')
        })
    })

    describe('customerDashboardApi.getPendingOptimizationsCount', () => {
        it('returns count of draft packing jobs', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: null,
                count: 3,
            })
            
            const result = await customerDashboardApi.getPendingOptimizationsCount()
            
            expect(result).toBe(3)
        })

        it('returns 0 when no draft jobs', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: null,
                count: 0,
            })
            
            const result = await customerDashboardApi.getPendingOptimizationsCount()
            
            expect(result).toBe(0)
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Query error' },
                count: null,
            })
            
            await expect(customerDashboardApi.getPendingOptimizationsCount())
                .rejects.toThrow('Failed to load pending optimizations')
        })
    })

    describe('customerShipmentsApi.getAll', () => {
        it('returns empty array when no shipments exist', async () => {
            const result = await customerShipmentsApi.getAll('customer_1')
            
            expect(result).toEqual([])
        })

        it('applies status filter when provided', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { id: 'ship_1', status: 'delivered' },
                ],
                error: null,
            })
            
            const result = await customerShipmentsApi.getAll('customer_1', { status: 'delivered' })
            
            expect(result).toHaveLength(1)
            expect(eqMock).toHaveBeenCalledWith('status', 'delivered')
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Query failed' },
            })
            
            await expect(customerShipmentsApi.getAll('customer_1'))
                .rejects.toThrow('Failed to load shipments')
        })
    })

    describe('customerShipmentsApi.getById', () => {
        it('throws UserFacingError when shipment not found', async () => {
            singleMock.mockResolvedValue({
                data: null,
                error: { message: 'Not found' },
            })

            await expect(customerShipmentsApi.getById('ship_1'))
                .rejects.toThrow('Failed to load shipment details')
        })

        it('returns shipment when found', async () => {
            const mockShipment = {
                id: 'ship_1',
                origin: 'Mumbai',
                destination: 'Delhi',
                status: 'in_transit',
            }
            singleMock.mockResolvedValue({
                data: mockShipment,
                error: null,
            })
            
            const result = await customerShipmentsApi.getById('ship_1')
            
            expect(result).toEqual(mockShipment)
        })

        it('throws UserFacingError on query failure', async () => {
            singleMock.mockResolvedValue({
                data: null,
                error: { message: 'Connection error' },
            })
            
            await expect(customerShipmentsApi.getById('ship_1'))
                .rejects.toThrow('Failed to load shipment details')
        })
    })

    describe('customerShipmentsApi.create', () => {
        const newShipment: Omit<ShipmentDetail, 'id' | 'created_at' | 'updated_at'> = {
            shipment_id: 'SHIP-NEW-1',
            customer_id: 'cust_1',
            truck_id: null,
            origin: 'Mumbai',
            destination: 'Delhi',
            status: 'pending',
            total_weight: 1200,
            total_volume: 8.5,
            estimated_cost: 5400,
            driver_name: null,
            driver_phone: null,
            vehicle_number: null,
            latitude: null,
            longitude: null,
        }

        it('creates shipment successfully', async () => {
            const createdShipment = {
                id: 'ship_1',
                ...newShipment,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }
            
            insertMock.mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: createdShipment,
                        error: null,
                    }),
                }),
            })
            
            const result = await customerShipmentsApi.create(newShipment)

            expect(result).toEqual(createdShipment)
        })

        it('throws UserFacingError on creation failure', async () => {
            insertMock.mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: null,
                        error: { message: 'Insert failed' },
                    }),
                }),
            })

            await expect(customerShipmentsApi.create({ ...newShipment, origin: '' }))
                .rejects.toThrow('Failed to create shipment')
        })
    })

    describe('customerShipmentsApi.updateStatus', () => {
        it('updates shipment status successfully', async () => {
            const updatedShipment = {
                id: 'ship_1',
                status: 'delivered',
                updated_at: new Date().toISOString(),
            }
            
            updateMock.mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: updatedShipment,
                            error: null,
                        }),
                    }),
                }),
            })
            
            const result = await customerShipmentsApi.updateStatus('ship_1', 'delivered')
            
            expect(result).toEqual(updatedShipment)
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
            
            await expect(customerShipmentsApi.updateStatus('ship_1', 'delivered'))
                .rejects.toThrow('Failed to update shipment status')
        })
    })

    describe('customerTrackingApi.trackShipment', () => {
        it('returns null when shipment not found', async () => {
            maybeSingleMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await customerTrackingApi.trackShipment('ship_1')
            
            expect(result).toBeNull()
        })

        it('returns shipment when found', async () => {
            const mockShipment = {
                id: 'ship_1',
                status: 'in_transit',
                latitude: 19.0760,
                longitude: 72.8777,
            }
            maybeSingleMock.mockResolvedValue({
                data: mockShipment,
                error: null,
            })
            
            const result = await customerTrackingApi.trackShipment('ship_1')
            
            expect(result).toEqual(mockShipment)
        })

        it('throws UserFacingError on query failure', async () => {
            maybeSingleMock.mockResolvedValue({
                data: null,
                error: { message: 'Query error' },
            })
            
            await expect(customerTrackingApi.trackShipment('ship_1'))
                .rejects.toThrow('Failed to track shipment')
        })
    })

    describe('customerTrackingApi.getShipmentByReference', () => {
        it('returns null when reference not found', async () => {
            maybeSingleMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await customerTrackingApi.getShipmentByReference('REF123')
            
            expect(result).toBeNull()
        })

        it('returns shipment when reference found', async () => {
            const mockShipment = {
                id: 'ship_1',
                shipment_id: 'REF123',
                status: 'pending',
            }
            maybeSingleMock.mockResolvedValue({
                data: mockShipment,
                error: null,
            })
            
            const result = await customerTrackingApi.getShipmentByReference('REF123')
            
            expect(result).toEqual(mockShipment)
        })

        it('throws UserFacingError on query failure', async () => {
            maybeSingleMock.mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
            })
            
            await expect(customerTrackingApi.getShipmentByReference('REF123'))
                .rejects.toThrow('Failed to find shipment')
        })
    })

    describe('driverEarningsApi.getEarnings', () => {
        it('returns zero earnings when no trips exist', async () => {
            limitMock.mockResolvedValue({
                data: [],
                error: null,
            })
            singleMock.mockResolvedValue({
                data: { rating: 4.5 },
                error: null,
            })
            
            const result = await driverEarningsApi.getEarnings('driver_1')
            
            expect(result).toEqual({
                total_earnings: 0,
                completed_trips: 0,
                average_per_trip: 0,
                current_rating: 4.5,
                last_thirty_days: 0,
            })
        })

        it('calculates earnings correctly', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { shipments: [{ estimated_cost: 1000 }] },
                    { shipments: [{ estimated_cost: 2000 }] },
                ],
                error: null,
            })
            singleMock.mockResolvedValue({
                data: { rating: 4.8 },
                error: null,
            })
            
            const result = await driverEarningsApi.getEarnings('driver_1')
            
            expect(result.total_earnings).toBe(3000)
            expect(result.completed_trips).toBe(2)
            expect(result.average_per_trip).toBe(1500)
        })

        it('selects created_at and computes last_thirty_days from it (regression TO138)', async () => {
            const now = new Date().toISOString()
            limitMock.mockResolvedValue({
                data: [
                    { created_at: now, shipments: { estimated_cost: 100 } },
                    { created_at: '2020-01-01T00:00:00.000Z', shipments: { estimated_cost: 200 } },
                ],
                error: null,
            })
            singleMock.mockResolvedValue({
                data: { rating: 4.5 },
                error: null,
            })

            const result = await driverEarningsApi.getEarnings('driver_1')

            // The 30-day window can only be computed when created_at is part of
            // the job_offers select; without it last_thirty_days is silently 0.
            const earningsSelect = selectMock.mock.calls
                .map((call) => String(call[0]))
                .find((columns) => columns.includes('shipments'))
            expect(earningsSelect).toContain('created_at')
            expect(result.total_earnings).toBe(300)
            expect(result.last_thirty_days).toBe(100)
        })

        it('handles array shipments structure', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { shipments: [{ estimated_cost: 1000 }] },
                ],
                error: null,
            })
            singleMock.mockResolvedValue({
                data: { rating: 4.5 },
                error: null,
            })
            
            const result = await driverEarningsApi.getEarnings('driver_1')
            
            expect(result.total_earnings).toBe(1000)
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Query failed' },
            })
            
            await expect(driverEarningsApi.getEarnings('driver_1'))
                .rejects.toThrow('Failed to load earnings data')
        })
    })

    describe('driverEarningsApi.getBalanceSnapshot', () => {
        it('returns zero balance when no payouts exist', async () => {
            limitMock.mockResolvedValue({
                data: [],
                error: null,
            })
            
            const result = await driverEarningsApi.getBalanceSnapshot('driver_1')
            
            expect(result).toEqual({
                paid: 0,
                approved: 0,
                pending: 0,
                totalDelivered: 0,
                payouts: [],
            })
        })

        it('calculates balance correctly', async () => {
            limitMock.mockResolvedValue({
                data: [
                    { amount: 1000, status: 'paid' },
                    { amount: 500, status: 'approved' },
                    { amount: 250, status: 'pending' },
                ],
                error: null,
            })
            
            const result = await driverEarningsApi.getBalanceSnapshot('driver_1')
            
            expect(result.paid).toBe(1000)
            expect(result.approved).toBe(500)
            expect(result.pending).toBe(250)
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Query error' },
            })
            
            await expect(driverEarningsApi.getBalanceSnapshot('driver_1'))
                .rejects.toThrow('Failed to load balance')
        })
    })

    describe('driverEarningsApi.requestPayout', () => {
        it('requests payout successfully', async () => {
            insertMock.mockResolvedValue({
                error: null,
            })
            
            await expect(driverEarningsApi.requestPayout('driver_1', 1000))
                .resolves.not.toThrow()
            
            expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
                driver_id: 'driver_1',
                amount: 1000,
                status: 'pending',
            }))
        })

        it('throws UserFacingError on request failure', async () => {
            insertMock.mockResolvedValue({
                error: { message: 'Insert failed' },
            })
            
            await expect(driverEarningsApi.requestPayout('driver_1', 1000))
                .rejects.toThrow('Failed to submit withdrawal request')
        })
    })

    describe('driverTripsApi.getAll', () => {
        it('returns empty array when no trips exist', async () => {
            const result = await driverTripsApi.getAll('driver_1')
            
            expect(result).toEqual([])
        })

        it('applies status filter when provided', async () => {
            limitMock.mockResolvedValue({
                data: [
                    {
                        id: 'trip_1',
                        status: 'delivered',
                        shipments: { origin: 'Mumbai', destination: 'Delhi', estimated_cost: 1000 },
                    },
                ],
                error: null,
            })
            
            const result = await driverTripsApi.getAll('driver_1', { status: 'delivered' })
            
            expect(result).toHaveLength(1)
            expect(eqMock).toHaveBeenCalledWith('status', 'delivered')
        })

        it('maps trip data correctly', async () => {
            limitMock.mockResolvedValue({
                data: [
                    {
                        id: 'trip_1',
                        shipment_id: 'ship_1',
                        driver_id: 'driver_1',
                        status: 'delivered',
                        shipments: { origin: 'Mumbai', destination: 'Delhi', estimated_cost: 1000 },
                        created_at: '2024-01-01T00:00:00Z',
                        delivered_at: '2024-01-02T00:00:00Z',
                    },
                ],
                error: null,
            })
            
            const result = await driverTripsApi.getAll('driver_1')
            
            expect(result[0]).toEqual({
                id: 'trip_1',
                shipment_id: 'ship_1',
                driver_id: 'driver_1',
                status: 'delivered',
                origin: 'Mumbai',
                destination: 'Delhi',
                estimated_cost: 1000,
                created_at: '2024-01-01T00:00:00Z',
                delivered_at: '2024-01-02T00:00:00Z',
            })
        })

        it('handles missing shipments gracefully', async () => {
            limitMock.mockResolvedValue({
                data: [
                    {
                        id: 'trip_1',
                        shipment_id: null,
                        driver_id: 'driver_1',
                        status: 'pending',
                        shipments: null,
                        created_at: '2024-01-01T00:00:00Z',
                        delivered_at: null,
                    },
                ],
                error: null,
            })
            
            const result = await driverTripsApi.getAll('driver_1')
            
            expect(result[0].origin).toBe('')
            expect(result[0].destination).toBe('')
            expect(result[0].estimated_cost).toBe(0)
        })

        it('throws UserFacingError on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Query failed' },
            })
            
            await expect(driverTripsApi.getAll('driver_1'))
                .rejects.toThrow('Failed to load trips')
        })
    })

    describe('driverDashboardApi.getPendingOffer', () => {
        it('returns null when no pending offer exists', async () => {
            maybeSingleMock.mockResolvedValue({
                data: null,
                error: null,
            })
            
            const result = await driverDashboardApi.getPendingOffer('driver_1')
            
            expect(result).toBeNull()
        })

        it('returns pending offer when found', async () => {
            const mockOffer = {
                id: 'offer_1',
                shipment_id: 'ship_1',
                status: 'pending',
                expires_at: new Date(Date.now() + 3600000).toISOString(),
                shipments: {
                    origin: 'Mumbai',
                    destination: 'Delhi',
                    total_weight: 1000,
                    estimated_cost: 2000,
                },
            }
            maybeSingleMock.mockResolvedValue({
                data: mockOffer,
                error: null,
            })
            
            const result = await driverDashboardApi.getPendingOffer('driver_1')
            
            expect(result).toEqual(mockOffer)
        })

        it('throws UserFacingError on query failure', async () => {
            maybeSingleMock.mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
            })
            
            await expect(driverDashboardApi.getPendingOffer('driver_1'))
                .rejects.toThrow('Failed to load pending job offer')
        })
    })

    describe('driverDashboardApi.respondToJobOffer', () => {
        // TO-129: response goes through the single trusted RPC transaction;
        // no direct table writes are performed from the browser anymore.
        it('accepts through the atomic RPC and returns the authoritative state', async () => {
            rpcMock.mockResolvedValue({
                data: [{
                    offer_id: 'offer_1',
                    offer_status: 'accepted',
                    responded_at: '2026-10-03T10:00:00Z',
                    active_job_id: 'offer_1',
                }],
                error: null,
            })

            const result = await driverDashboardApi.respondToJobOffer('offer_1', true)

            expect(rpcMock).toHaveBeenCalledWith('respond_to_job_offer', {
                p_job_offer_id: 'offer_1',
                p_accept: true,
                p_decline_reason: null,
            })
            expect(result).toEqual({
                offerId: 'offer_1',
                offerStatus: 'accepted',
                respondedAt: '2026-10-03T10:00:00Z',
                activeJobId: 'offer_1',
            })
            expect(fromMock).not.toHaveBeenCalled()
        })

        it('declines through the RPC without a reason', async () => {
            rpcMock.mockResolvedValue({
                data: [{
                    offer_id: 'offer_1',
                    offer_status: 'declined',
                    responded_at: '2026-10-03T10:00:00Z',
                    active_job_id: null,
                }],
                error: null,
            })

            const result = await driverDashboardApi.respondToJobOffer('offer_1', false)

            expect(rpcMock).toHaveBeenCalledWith('respond_to_job_offer', {
                p_job_offer_id: 'offer_1',
                p_accept: false,
                p_decline_reason: null,
            })
            expect(result.offerStatus).toBe('declined')
            expect(result.activeJobId).toBeNull()
        })

        it('passes an optional decline reason to the RPC', async () => {
            rpcMock.mockResolvedValue({
                data: [{
                    offer_id: 'offer_1',
                    offer_status: 'declined',
                    responded_at: '2026-10-03T10:00:00Z',
                    active_job_id: null,
                }],
                error: null,
            })

            await driverDashboardApi.respondToJobOffer('offer_1', false, 'Too far away')

            expect(rpcMock).toHaveBeenCalledWith('respond_to_job_offer', {
                p_job_offer_id: 'offer_1',
                p_accept: false,
                p_decline_reason: 'Too far away',
            })
        })

        it('maps controlled server rejections to approved user-facing messages', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'Job offer has expired' },
            })

            await expect(driverDashboardApi.respondToJobOffer('offer_1', true))
                .rejects.toThrow('This job offer has expired.')
        })

        it('never surfaces unmapped provider error internals', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'internal SQLSTATE XX000 detail payload' },
            })

            await expect(driverDashboardApi.respondToJobOffer('offer_1', true))
                .rejects.toThrow('Failed to respond to job')
        })

        it('treats a zero-row RPC result as failure, never as success', async () => {
            rpcMock.mockResolvedValue({
                data: [],
                error: null,
            })

            await expect(driverDashboardApi.respondToJobOffer('offer_1', true))
                .rejects.toThrow('Failed to respond to job')
        })
    })

    describe('driverDashboardApi.setDriverOnlineStatus', () => {
        it('sets driver online successfully', async () => {
            updateMock.mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                    error: null,
                }),
            })
            
            await expect(driverDashboardApi.setDriverOnlineStatus('driver_1', true))
                .resolves.not.toThrow()
            
            expect(updateMock).toHaveBeenCalledWith({ is_online: true })
        })

        it('sets driver offline successfully', async () => {
            updateMock.mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                    error: null,
                }),
            })
            
            await expect(driverDashboardApi.setDriverOnlineStatus('driver_1', false))
                .resolves.not.toThrow()
            
            expect(updateMock).toHaveBeenCalledWith({ is_online: false })
        })

        it('throws UserFacingError on update failure', async () => {
            updateMock.mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                    error: { message: 'Update failed' },
                }),
            })
            
            await expect(driverDashboardApi.setDriverOnlineStatus('driver_1', true))
                .rejects.toThrow('Failed to update status')
        })
    })

    describe('trucksApi.getAll', () => {
        it('returns empty array when no trucks exist', async () => {
            const result = await trucksApi.getAll()
            
            expect(result).toEqual([])
        })

        it('returns trucks when found', async () => {
            const mockTrucks = [
                { id: 'truck_1', name: 'Truck A' },
                { id: 'truck_2', name: 'Truck B' },
            ]
            limitMock.mockResolvedValue({
                data: mockTrucks,
                error: null,
            })
            
            const result = await trucksApi.getAll()
            
            expect(result).toEqual(mockTrucks)
        })

        it('throws error on query failure', async () => {
            limitMock.mockResolvedValue({
                data: null,
                error: { message: 'Query failed' },
            })
            
            await expect(trucksApi.getAll())
                .rejects.toThrow('Failed to load trucks')
        })
    })

    describe('trucksApi.getById', () => {
        it('throws UserFacingError when truck not found', async () => {
            singleMock.mockResolvedValue({
                data: null,
                error: { message: 'Not found' },
            })

            await expect(trucksApi.getById('truck_1'))
                .rejects.toThrow('Failed to load truck details')
        })

        it('returns truck when found', async () => {
            const mockTruck = {
                id: 'truck_1',
                name: 'Truck A',
                capacity: 1000,
            }
            singleMock.mockResolvedValue({
                data: mockTruck,
                error: null,
            })
            
            const result = await trucksApi.getById('truck_1')
            
            expect(result).toEqual(mockTruck)
        })

        it('throws error on query failure', async () => {
            singleMock.mockResolvedValue({
                data: null,
                error: { message: 'Connection error' },
            })
            
            await expect(trucksApi.getById('truck_1'))
                .rejects.toThrow('Failed to load truck details')
        })
    })
})