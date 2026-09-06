// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { getLocalDb, resetLocalDbForTests, DEFAULT_INDIAN_TRUCKS } from '../lib/localDb'
import { trucksLocalApi, cartonsLocalApi, agencyProfileLocalApi } from './localApi'

describe('localApi (PGlite, memory-backed under test)', () => {
    beforeEach(async () => {
        const db = await getLocalDb()
        await resetLocalDbForTests(db)
    })

    describe('trucks', () => {
        it('starts empty after reset (no auto-seed on memory db)', async () => {
            // memory:// bypasses first-run seeding; seed parity is covered below
            await expect(trucksLocalApi.getAll()).resolves.toEqual([])
        })

        it('creates, reads, updates, deletes with numeric coercion', async () => {
            const created = await trucksLocalApi.create({
                name: 'Test Truck', length: 500, width: 200, height: 200,
                capacity: 5000, cost_per_km: 25, available: 3,
            } as never)
            expect(created.id).toBeTruthy()
            expect(created.cost_per_km).toBe(25)
            expect(typeof created.capacity).toBe('number')

            const fetched = await trucksLocalApi.getById(created.id)
            expect(fetched?.name).toBe('Test Truck')

            const updated = await trucksLocalApi.update(created.id, { available: 7 })
            expect(updated.available).toBe(7)

            await trucksLocalApi.delete(created.id)
            await expect(trucksLocalApi.getById(created.id)).resolves.toBeNull()
        })

        it('getExistingNames + createMany mirror the defaults flow', async () => {
            const names = DEFAULT_INDIAN_TRUCKS.map((t) => t.name)
            await expect(trucksLocalApi.getExistingNames(names)).resolves.toEqual([])
            await trucksLocalApi.createMany(DEFAULT_INDIAN_TRUCKS as Array<Record<string, unknown>>)
            await expect(trucksLocalApi.getExistingNames(names)).resolves.toEqual(expect.arrayContaining(names))
            const all = await trucksLocalApi.getAll()
            expect(all.length).toBe(names.length)
            // idempotent re-seed adds nothing
            await trucksLocalApi.createMany(DEFAULT_INDIAN_TRUCKS as Array<Record<string, unknown>>)
            await expect(trucksLocalApi.getAll()).resolves.toHaveLength(names.length)
        })

        it('update of missing truck throws friendly error', async () => {
            await expect(trucksLocalApi.update('nope', { available: 1 })).rejects.toThrow('Truck not found.')
        })
    })

    describe('cartons', () => {
        it('full CRUD with boolean defaults', async () => {
            const created = await cartonsLocalApi.create({
                name: 'Box', length: 10, width: 10, height: 10, weight: 2,
            } as never)
            expect(created.fragile).toBe(false)
            expect(created.stackable).toBe(true)
            expect(typeof created.weight).toBe('number')

            const updated = await cartonsLocalApi.update(created.id, { fragile: true })
            expect(updated.fragile).toBe(true)

            await cartonsLocalApi.delete(created.id)
            await expect(cartonsLocalApi.getAll()).resolves.toEqual([])
        })
    })

    describe('agency profile (local identity)', () => {
        it('saves once, updates after', async () => {
            await expect(agencyProfileLocalApi.current()).resolves.toBeNull()
            const p1 = await agencyProfileLocalApi.save({
                role: 'agency', company_name: 'Sharma Transport', contact_name: 'Ravi', contact_phone: '9876500000',
            })
            expect(p1.id).toBeTruthy()
            const p2 = await agencyProfileLocalApi.save({
                role: 'agency', company_name: 'Sharma Transport Ltd', contact_name: 'Ravi', contact_phone: '9876500000',
            })
            expect(p2.id).toBe(p1.id)
            expect(p2.company_name).toBe('Sharma Transport Ltd')
        })
    })
})
