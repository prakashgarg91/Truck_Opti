import { describe, expect, it } from 'vitest'
import { VEHICLE_TYPES, vehicleTypeLabel } from './vehicleLabels'

describe('vehicleLabels', () => {
    it('lists the eight catalog vehicle codes, each with a human label', () => {
        expect(VEHICLE_TYPES.map((v) => v.code)).toEqual([
            'tata_ace', 'tata_407', 'eicher_14ft', 'eicher_17ft', 'ashok_19ft', 'bharatbenz_24ft', 'bharatbenz_32ft', 'volvo_40ft',
        ])
        expect(new Set(VEHICLE_TYPES.map((v) => v.label)).size).toBe(VEHICLE_TYPES.length)
    })

    it('maps a catalog code to its label, including the codes older maps missed', () => {
        expect(vehicleTypeLabel('tata_ace')).toBe('Tata Ace (mini truck)')
        expect(vehicleTypeLabel('volvo_40ft')).toBe('Volvo 40ft Container (25T)')
        expect(vehicleTypeLabel('eicher_14ft')).toBe('Eicher 14ft (3T)')
    })

    it('never returns a raw code: empty reads as not set, unknown reads as other', () => {
        expect(vehicleTypeLabel(null)).toBe('Truck type not set')
        expect(vehicleTypeLabel('')).toBe('Truck type not set')
        expect(vehicleTypeLabel('mystery_9ft')).toBe('Other truck type')
    })
})
