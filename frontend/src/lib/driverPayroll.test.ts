// TO-150: driver pay and report aggregation (pure library).
// Tests are written first. No React, no network, no clock: every result is a
// pure function of its arguments. Money is integer paise throughout.
import { describe, expect, it } from 'vitest'
import {
  computeDriverPay,
  tripsByDriverReport,
  type DriverPayInput,
  type DriverPayTrip,
  type ReportTrip,
} from './driverPayroll'

const base: DriverPayInput = {
  basePaise: 0,
  trips: [],
  perKmPaise: 0,
  perTonnePaise: 0,
  advancesPaise: 0,
  deductions: [],
  periodStartIso: '2026-03-01',
  periodEndIso: '2026-03-31',
}

function input(overrides: Partial<DriverPayInput> = {}): DriverPayInput {
  return { ...base, ...overrides }
}

function trip(overrides: Partial<DriverPayTrip> = {}): DriverPayTrip {
  return {
    tripId: 'T1',
    distanceKm: 0,
    loadedKg: 0,
    dateIso: '2026-03-10',
    ...overrides,
  }
}

function rtrip(overrides: Partial<ReportTrip> = {}): ReportTrip {
  return {
    tripId: 'R1',
    driverId: 'D1',
    truckId: 'TR1',
    dateIso: '2026-03-10',
    distanceKm: 0,
    loadedKg: 0,
    ...overrides,
  }
}

describe('computeDriverPay: earnings', () => {
  it('returns base pay only when there are zero trips', () => {
    const r = computeDriverPay(input({ basePaise: 50000 }))
    expect(r.earningsPaise).toBe(50000)
    expect(r.netPaise).toBe(50000)
    expect(r.shortfallPaise).toBe(0)
    expect(r.ignoredTripIds).toEqual([])
    expect(r.lines).toEqual([{ kind: 'base', amountPaise: 50000 }])
  })

  it('returns all zeros when every input is zero', () => {
    const r = computeDriverPay(input())
    expect(r.earningsPaise).toBe(0)
    expect(r.deductionsPaise).toBe(0)
    expect(r.advancesPaise).toBe(0)
    expect(r.netPaise).toBe(0)
    expect(r.shortfallPaise).toBe(0)
    expect(r.lines).toEqual([])
  })

  it('pays distance at perKmPaise per km', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 1200, trips: [trip({ distanceKm: 100 })] }),
    )
    expect(r.earningsPaise).toBe(120000)
    expect(r.lines).toEqual([
      { kind: 'distance', tripId: 'T1', amountPaise: 120000 },
    ])
  })

  it('pays tonnage at perTonnePaise per loadedKg/1000', () => {
    const r = computeDriverPay(
      input({ perTonnePaise: 100, trips: [trip({ loadedKg: 2500 })] }),
    )
    expect(r.earningsPaise).toBe(250)
  })

  it('rounds tonnage half-up when the fraction is exactly .5 (1500kg x 101 = 151.5 -> 152)', () => {
    const r = computeDriverPay(
      input({ perTonnePaise: 101, trips: [trip({ loadedKg: 1500 })] }),
    )
    expect(r.earningsPaise).toBe(152)
  })

  it('rounds tonnage down when the fraction is below .5 (1234kg x 100 = 123.4 -> 123)', () => {
    const r = computeDriverPay(
      input({ perTonnePaise: 100, trips: [trip({ loadedKg: 1234 })] }),
    )
    expect(r.earningsPaise).toBe(123)
  })

  it('rounds tonnage half-up at the smallest exact half (500kg x 1 = 0.5 -> 1)', () => {
    const r = computeDriverPay(
      input({ perTonnePaise: 1, trips: [trip({ loadedKg: 500 })] }),
    )
    expect(r.earningsPaise).toBe(1)
  })

  it('rounds tonnage per trip, not on the total (two 1500kg trips give 304, not 303)', () => {
    const r = computeDriverPay(
      input({
        perTonnePaise: 101,
        trips: [
          trip({ tripId: 'A', loadedKg: 1500 }),
          trip({ tripId: 'B', loadedKg: 1500 }),
        ],
      }),
    )
    expect(r.earningsPaise).toBe(304)
  })

  it('rounds distance half-up (0.5 km x 3 paise = 1.5 -> 2)', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 3, trips: [trip({ distanceKm: 0.5 })] }),
    )
    expect(r.earningsPaise).toBe(2)
  })

  it('keeps distance exact at metre precision (1.005 km x 100 = 100.5 -> 101)', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 100, trips: [trip({ distanceKm: 1.005 })] }),
    )
    expect(r.earningsPaise).toBe(101)
  })

  it('combines base, distance and tonnage for one trip', () => {
    const r = computeDriverPay(
      input({
        basePaise: 10000,
        perKmPaise: 500,
        perTonnePaise: 200,
        trips: [trip({ distanceKm: 40, loadedKg: 3000 })],
      }),
    )
    expect(r.earningsPaise).toBe(10000 + 20000 + 600)
    expect(r.lines).toEqual([
      { kind: 'base', amountPaise: 10000 },
      { kind: 'distance', tripId: 'T1', amountPaise: 20000 },
      { kind: 'tonnage', tripId: 'T1', amountPaise: 600 },
    ])
  })

  it('makes earnings equal the sum of earning lines', () => {
    const r = computeDriverPay(
      input({
        basePaise: 777,
        perKmPaise: 13,
        perTonnePaise: 71,
        trips: [
          trip({ tripId: 'A', distanceKm: 12.3, loadedKg: 999 }),
          trip({ tripId: 'B', distanceKm: 0.7, loadedKg: 2001 }),
        ],
      }),
    )
    const sum = r.lines.reduce((acc, l) => acc + l.amountPaise, 0)
    expect(sum).toBe(r.earningsPaise)
  })

  it('produces integer paise for a mixed input', () => {
    const r = computeDriverPay(
      input({
        basePaise: 1,
        perKmPaise: 7,
        perTonnePaise: 9,
        trips: [
          trip({ tripId: 'A', distanceKm: 3.3, loadedKg: 1111 }),
          trip({ tripId: 'B', distanceKm: 0.1, loadedKg: 1 }),
        ],
      }),
    )
    for (const v of [r.earningsPaise, r.deductionsPaise, r.advancesPaise, r.netPaise, r.shortfallPaise]) {
      expect(Number.isInteger(v)).toBe(true)
    }
  })
})

describe('computeDriverPay: period boundary', () => {
  it('includes a trip dated exactly on periodStartIso', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 10, trips: [trip({ distanceKm: 1, dateIso: '2026-03-01' })] }),
    )
    expect(r.earningsPaise).toBe(10)
    expect(r.ignoredTripIds).toEqual([])
  })

  it('includes a trip dated exactly on periodEndIso', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 10, trips: [trip({ distanceKm: 1, dateIso: '2026-03-31' })] }),
    )
    expect(r.earningsPaise).toBe(10)
    expect(r.ignoredTripIds).toEqual([])
  })

  it('ignores a trip one day before periodStartIso and reports it', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 10, trips: [trip({ tripId: 'OLD', distanceKm: 1, dateIso: '2026-02-28' })] }),
    )
    expect(r.earningsPaise).toBe(0)
    expect(r.ignoredTripIds).toEqual(['OLD'])
  })

  it('ignores a trip one day after periodEndIso and reports it', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 10, trips: [trip({ tripId: 'NEW', distanceKm: 1, dateIso: '2026-04-01' })] }),
    )
    expect(r.earningsPaise).toBe(0)
    expect(r.ignoredTripIds).toEqual(['NEW'])
  })

  it('pays only in-period trips when mixed with ignored ones', () => {
    const r = computeDriverPay(
      input({
        perKmPaise: 100,
        trips: [
          trip({ tripId: 'IN1', distanceKm: 2, dateIso: '2026-03-01' }),
          trip({ tripId: 'OUT1', distanceKm: 50, dateIso: '2026-05-01' }),
          trip({ tripId: 'IN2', distanceKm: 3, dateIso: '2026-03-31' }),
          trip({ tripId: 'OUT2', distanceKm: 50, dateIso: '2025-12-31' }),
        ],
      }),
    )
    expect(r.earningsPaise).toBe(500)
    expect(r.ignoredTripIds).toEqual(['OUT1', 'OUT2'])
  })

  it('treats a single-day period as inclusive of that day', () => {
    const r = computeDriverPay(
      input({
        perKmPaise: 10,
        periodStartIso: '2026-03-15',
        periodEndIso: '2026-03-15',
        trips: [trip({ distanceKm: 1, dateIso: '2026-03-15' })],
      }),
    )
    expect(r.earningsPaise).toBe(10)
  })

  it('rejects a period whose start is after its end', () => {
    expect(() =>
      computeDriverPay(input({ periodStartIso: '2026-04-01', periodEndIso: '2026-03-01' })),
    ).toThrow()
  })

  it('rejects a malformed date', () => {
    expect(() => computeDriverPay(input({ periodStartIso: '01/03/2026' }))).toThrow()
  })
})

describe('computeDriverPay: advances, deductions, net and shortfall', () => {
  it('subtracts advances from earnings to give net', () => {
    const r = computeDriverPay(input({ basePaise: 100000, advancesPaise: 20000 }))
    expect(r.advancesPaise).toBe(20000)
    expect(r.netPaise).toBe(80000)
    expect(r.shortfallPaise).toBe(0)
  })

  it('sums several deductions into deductionsPaise', () => {
    const r = computeDriverPay(
      input({
        basePaise: 100000,
        deductions: [
          { reason: 'fuel card', amountPaise: 1000 },
          { reason: 'damage', amountPaise: 2500 },
        ],
      }),
    )
    expect(r.deductionsPaise).toBe(3500)
    expect(r.netPaise).toBe(96500)
  })

  it('reports a shortfall when advances exceed earnings and clamps net at zero', () => {
    const r = computeDriverPay(input({ basePaise: 10000, advancesPaise: 15000 }))
    expect(r.netPaise).toBe(0)
    expect(r.shortfallPaise).toBe(5000)
  })

  it('reports a shortfall when deductions and advances together exceed earnings', () => {
    const r = computeDriverPay(
      input({
        basePaise: 10000,
        advancesPaise: 9000,
        deductions: [{ reason: 'toll', amountPaise: 4000 }],
      }),
    )
    expect(r.netPaise).toBe(0)
    expect(r.shortfallPaise).toBe(3000)
  })

  it('reports zero shortfall when obligations exactly equal earnings', () => {
    const r = computeDriverPay(input({ basePaise: 5000, advancesPaise: 5000 }))
    expect(r.netPaise).toBe(0)
    expect(r.shortfallPaise).toBe(0)
  })

  it('keeps the shortfall visible: net minus shortfall equals earnings minus obligations', () => {
    const r = computeDriverPay(
      input({
        basePaise: 4000,
        advancesPaise: 6000,
        deductions: [{ reason: 'fine', amountPaise: 1500 }],
      }),
    )
    expect(r.netPaise - r.shortfallPaise).toBe(
      r.earningsPaise - r.deductionsPaise - r.advancesPaise,
    )
    expect(r.shortfallPaise).toBe(3500)
  })

  it('never returns a negative net', () => {
    const r = computeDriverPay(input({ basePaise: 1, advancesPaise: 99999 }))
    expect(r.netPaise).toBe(0)
    expect(r.netPaise).toBeGreaterThanOrEqual(0)
  })

  it('emits an advance line and a labelled deduction line', () => {
    const r = computeDriverPay(
      input({
        basePaise: 1000,
        advancesPaise: 200,
        deductions: [{ reason: 'fuel card', amountPaise: 300 }],
      }),
    )
    expect(r.lines).toContainEqual({ kind: 'advance', amountPaise: 200 })
    expect(r.lines).toContainEqual({ kind: 'deduction', reason: 'fuel card', amountPaise: 300 })
  })

  it('does not emit an advance line when advances are zero', () => {
    const r = computeDriverPay(input({ basePaise: 1000 }))
    expect(r.lines.some((l) => l.kind === 'advance')).toBe(false)
  })
})

describe('computeDriverPay: validation and purity', () => {
  it('rejects a non-integer paise amount', () => {
    expect(() => computeDriverPay(input({ basePaise: 10.5 }))).toThrow()
  })

  it('rejects a negative paise amount', () => {
    expect(() => computeDriverPay(input({ perKmPaise: -1 }))).toThrow()
  })

  it('rejects a negative distance', () => {
    expect(() =>
      computeDriverPay(input({ perKmPaise: 10, trips: [trip({ distanceKm: -1 })] })),
    ).toThrow()
  })

  it('rejects a non-integer loadedKg', () => {
    expect(() =>
      computeDriverPay(input({ perTonnePaise: 10, trips: [trip({ loadedKg: 10.5 })] })),
    ).toThrow()
  })

  it('is deterministic for identical input', () => {
    const args = input({
      basePaise: 900,
      perKmPaise: 17,
      perTonnePaise: 31,
      trips: [trip({ tripId: 'A', distanceKm: 4.4, loadedKg: 777 })],
      deductions: [{ reason: 'x', amountPaise: 5 }],
    })
    expect(computeDriverPay(args)).toEqual(computeDriverPay(args))
  })

  it('does not mutate its input', () => {
    const trips = [trip({ tripId: 'A', distanceKm: 1 })]
    const deductions = [{ reason: 'x', amountPaise: 5 }]
    const args = input({ perKmPaise: 10, trips, deductions })
    const snapshot = JSON.stringify(args)
    computeDriverPay(args)
    expect(JSON.stringify(args)).toBe(snapshot)
  })

  it('gives the same totals regardless of trip order', () => {
    const a = trip({ tripId: 'A', distanceKm: 2.5, loadedKg: 1501, dateIso: '2026-03-02' })
    const b = trip({ tripId: 'B', distanceKm: 7.1, loadedKg: 999, dateIso: '2026-03-20' })
    const forward = computeDriverPay(input({ perKmPaise: 9, perTonnePaise: 13, trips: [a, b] }))
    const reverse = computeDriverPay(input({ perKmPaise: 9, perTonnePaise: 13, trips: [b, a] }))
    expect(reverse.earningsPaise).toBe(forward.earningsPaise)
    expect(reverse.netPaise).toBe(forward.netPaise)
  })

  it('reports no ignored trips when every trip is in the period', () => {
    const r = computeDriverPay(
      input({ perKmPaise: 1, trips: [trip({ dateIso: '2026-03-05', distanceKm: 1 })] }),
    )
    expect(r.ignoredTripIds).toEqual([])
  })
})

describe('tripsByDriverReport', () => {
  it('returns an empty list for no trips', () => {
    expect(tripsByDriverReport([], 'driver')).toEqual([])
  })

  it('groups by driver and sums trip count, distance and load', () => {
    const r = tripsByDriverReport(
      [
        rtrip({ tripId: 'A', driverId: 'D2', distanceKm: 10, loadedKg: 1000 }),
        rtrip({ tripId: 'B', driverId: 'D1', distanceKm: 5, loadedKg: 500 }),
        rtrip({ tripId: 'C', driverId: 'D2', distanceKm: 2.5, loadedKg: 250 }),
      ],
      'driver',
    )
    expect(r).toEqual([
      { key: 'D1', tripCount: 1, distanceKm: 5, loadedKg: 500 },
      { key: 'D2', tripCount: 2, distanceKm: 12.5, loadedKg: 1250 },
    ])
  })

  it('groups by truck', () => {
    const r = tripsByDriverReport(
      [
        rtrip({ tripId: 'A', truckId: 'TR9', distanceKm: 1 }),
        rtrip({ tripId: 'B', truckId: 'TR2', distanceKm: 1 }),
        rtrip({ tripId: 'C', truckId: 'TR9', distanceKm: 1 }),
      ],
      'truck',
    )
    expect(r.map((g) => [g.key, g.tripCount])).toEqual([
      ['TR2', 1],
      ['TR9', 2],
    ])
  })

  it('groups by month using the YYYY-MM prefix of dateIso', () => {
    const r = tripsByDriverReport(
      [
        rtrip({ tripId: 'A', dateIso: '2026-03-01' }),
        rtrip({ tripId: 'B', dateIso: '2026-03-31' }),
        rtrip({ tripId: 'C', dateIso: '2026-02-14' }),
      ],
      'month',
    )
    expect(r.map((g) => [g.key, g.tripCount])).toEqual([
      ['2026-02', 1],
      ['2026-03', 2],
    ])
  })

  it('sorts keys ascending regardless of input order', () => {
    const trips = [
      rtrip({ tripId: 'A', driverId: 'Z' }),
      rtrip({ tripId: 'B', driverId: 'M' }),
      rtrip({ tripId: 'C', driverId: 'A' }),
    ]
    const forward = tripsByDriverReport(trips, 'driver').map((g) => g.key)
    const reverse = tripsByDriverReport([...trips].reverse(), 'driver').map((g) => g.key)
    expect(forward).toEqual(['A', 'M', 'Z'])
    expect(reverse).toEqual(forward)
  })

  it('is stable: repeated calls return the same order', () => {
    const trips = [
      rtrip({ tripId: 'A', truckId: 'T2' }),
      rtrip({ tripId: 'B', truckId: 'T1' }),
    ]
    expect(tripsByDriverReport(trips, 'truck')).toEqual(tripsByDriverReport(trips, 'truck'))
  })

  it('groups trips with no driver under "unassigned"', () => {
    const r = tripsByDriverReport(
      [rtrip({ tripId: 'A', driverId: null, distanceKm: 3 }), rtrip({ tripId: 'B', driverId: 'D1' })],
      'driver',
    )
    expect(r.map((g) => g.key)).toEqual(['D1', 'unassigned'])
    expect(r.find((g) => g.key === 'unassigned')?.distanceKm).toBe(3)
  })

  it('sums decimal distances exactly (0.1 + 0.2 = 0.3)', () => {
    const r = tripsByDriverReport(
      [rtrip({ tripId: 'A', distanceKm: 0.1 }), rtrip({ tripId: 'B', distanceKm: 0.2 })],
      'driver',
    )
    expect(r[0].distanceKm).toBe(0.3)
  })

  it('does not mutate its input array', () => {
    const trips = [rtrip({ tripId: 'B', driverId: 'Z' }), rtrip({ tripId: 'A', driverId: 'A' })]
    const snapshot = JSON.stringify(trips)
    tripsByDriverReport(trips, 'driver')
    expect(JSON.stringify(trips)).toBe(snapshot)
  })

  it('returns a single aggregate for a single trip', () => {
    const r = tripsByDriverReport([rtrip({ tripId: 'A', distanceKm: 4, loadedKg: 80 })], 'month')
    expect(r).toEqual([{ key: '2026-03', tripCount: 1, distanceKm: 4, loadedKg: 80 }])
  })
})
