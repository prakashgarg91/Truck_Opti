import { describe, expect, it, vi } from 'vitest'

import { generateShipmentId } from './shipmentId'

describe('generateShipmentId', () => {
    it('produces six-character suffix with zero padding when Math.random() is small', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.00001)
        const id = generateShipmentId()

        expect(id).toMatch(/^SHP-\d{8}-[0-9A-Z]{6}$/)
        const suffix = id.split('-')[2]
        expect(suffix).toHaveLength(6)
        expect(suffix).toBe('000GSN')
        randomSpy.mockRestore()
    })

    it('produces six-character uppercase-alphanumeric suffix for normal random values', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
        const id = generateShipmentId()

        expect(id).toMatch(/^SHP-\d{8}-[0-9A-Z]{6}$/)
        const suffix = id.split('-')[2]
        expect(suffix).toHaveLength(6)
        expect(suffix).toBe(suffix.toUpperCase())
        randomSpy.mockRestore()
    })

    it('produces exactly six characters when Math.random() returns zero', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
        const id = generateShipmentId()

        expect(id).toMatch(/^SHP-\d{8}-[0-9A-Z]{6}$/)
        const suffix = id.split('-')[2]
        expect(suffix).toHaveLength(6)
        expect(suffix).toBe('000000')
        randomSpy.mockRestore()
    })

    it('formats date with zero padding for single-digit month and day', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123)
        const date = new Date('2026-01-05T00:00:00Z')
        const id = generateShipmentId(date)

        expect(id).toMatch(/^SHP-20260105-[0-9A-Z]{6}$/)
        const datePart = id.split('-')[1]
        expect(datePart).toBe('20260105')
        randomSpy.mockRestore()
    })
})
