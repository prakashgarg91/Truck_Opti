import { describe, expect, it } from 'vitest'
import {
  expenseSummary,
  fuelMileage,
  maintenanceDue,
  type Expense,
  type FuelFill,
  type MaintenanceItem,
} from './fleetExpense'

const fill = (odometerKm: number, litres: number, fullTank: boolean): FuelFill => ({
  odometerKm,
  litres,
  fullTank,
})

const maint = (overrides: Partial<MaintenanceItem> = {}): MaintenanceItem => ({
  name: 'Engine oil',
  lastServiceKm: 10000,
  intervalKm: 10000,
  lastServiceDateIso: '2026-03-12',
  intervalDays: 30,
  ...overrides,
})

// Base item: due at 20000 km and on 2026-04-11 (last service 2026-01-01 + 100 days).
const base = (overrides: Partial<MaintenanceItem> = {}): MaintenanceItem =>
  maint({
    lastServiceKm: 10000,
    intervalKm: 10000,
    lastServiceDateIso: '2026-01-01',
    intervalDays: 100,
    ...overrides,
  })

const exp = (
  category: string,
  amountPaise: number,
  dateIso: string,
  truckId: string,
): Expense => ({ category, amountPaise, dateIso, truckId })

describe('fuelMileage', () => {
  it('returns null and no anomalies for empty input', () => {
    expect(fuelMileage([])).toEqual({ kmPerLitre: null, anomalies: [] })
  })

  it('returns null for a single fill (baseline only)', () => {
    expect(fuelMileage([fill(1000, 40, true)])).toEqual({ kmPerLitre: null, anomalies: [] })
  })

  it('computes km per litre between two full tanks', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1400, 40, true)])
    expect(r).toEqual({ kmPerLitre: 10, anomalies: [] })
  })

  it('accumulates partial fills until the next full tank', () => {
    const r = fuelMileage([
      fill(1000, 40, true),
      fill(1200, 10, false),
      fill(1300, 10, false),
      fill(1400, 20, true),
    ])
    expect(r).toEqual({ kmPerLitre: 10, anomalies: [] })
  })

  it('treats a partial first fill as baseline only and ignores its litres', () => {
    const r = fuelMileage([fill(1000, 30, false), fill(1300, 30, true)])
    expect(r).toEqual({ kmPerLitre: 10, anomalies: [] })
  })

  it('ignores the litres of the first fill even when it is a full tank', () => {
    const r = fuelMileage([fill(1000, 999, true), fill(1400, 40, true)])
    expect(r.kmPerLitre).toBe(10)
  })

  it('aggregates valid segments as total distance over total litres', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1400, 40, true), fill(1800, 50, true)])
    // (400 + 400) km / (40 + 50) L = 8.888... rounded to 2 dp
    expect(r.kmPerLitre).toBe(8.89)
    expect(r.anomalies).toEqual([])
  })

  it('rounds km per litre to two decimals', () => {
    const r = fuelMileage([fill(0, 30, true), fill(100, 30, true)])
    expect(r.kmPerLitre).toBe(3.33)
  })

  it('flags a backwards odometer and skips that fill entirely', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(900, 40, true), fill(1400, 40, true)])
    expect(r.kmPerLitre).toBe(10)
    expect(r.anomalies).toEqual([{ index: 1, reason: 'odometer_backwards' }])
  })

  it('does not count litres of a skipped backwards partial fill', () => {
    const r = fuelMileage([
      fill(1000, 40, true),
      fill(1200, 10, false),
      fill(1100, 10, false),
      fill(1400, 30, true),
    ])
    expect(r.kmPerLitre).toBe(10)
    expect(r.anomalies).toEqual([{ index: 2, reason: 'odometer_backwards' }])
  })

  it('flags zero litres as bad_litres and skips the fill', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1200, 0, false), fill(1400, 40, true)])
    expect(r.kmPerLitre).toBe(10)
    expect(r.anomalies).toEqual([{ index: 1, reason: 'bad_litres' }])
  })

  it('flags negative litres as bad_litres', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1200, -5, false), fill(1400, 40, true)])
    expect(r.anomalies).toEqual([{ index: 1, reason: 'bad_litres' }])
  })

  it('flags NaN litres as bad_litres', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1200, Number.NaN, false), fill(1400, 40, true)])
    expect(r.anomalies).toEqual([{ index: 1, reason: 'bad_litres' }])
  })

  it('skips a closing full tank with bad litres and keeps the old baseline', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1400, 0, true), fill(1800, 80, true)])
    expect(r.kmPerLitre).toBe(10)
    expect(r.anomalies).toEqual([{ index: 1, reason: 'bad_litres' }])
  })

  it('flags implausibly high mileage above 15 km/l', () => {
    const r = fuelMileage([fill(1000, 20, true), fill(1400, 20, true)])
    expect(r.kmPerLitre).toBeNull()
    expect(r.anomalies).toEqual([{ index: 1, reason: 'implausible_mileage' }])
  })

  it('flags implausibly low mileage below 1 km/l', () => {
    const r = fuelMileage([fill(1000, 100, true), fill(1090, 100, true)])
    expect(r.kmPerLitre).toBeNull()
    expect(r.anomalies).toEqual([{ index: 1, reason: 'implausible_mileage' }])
  })

  it('accepts exactly 1 km/l as plausible', () => {
    const r = fuelMileage([fill(1000, 100, true), fill(1100, 100, true)])
    expect(r).toEqual({ kmPerLitre: 1, anomalies: [] })
  })

  it('accepts exactly 15 km/l as plausible', () => {
    const r = fuelMileage([fill(0, 10, true), fill(150, 10, true)])
    expect(r).toEqual({ kmPerLitre: 15, anomalies: [] })
  })

  it('excludes an implausible segment but keeps later valid segments', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1400, 20, true), fill(1800, 40, true)])
    expect(r.kmPerLitre).toBe(10)
    expect(r.anomalies).toEqual([{ index: 1, reason: 'implausible_mileage' }])
  })

  it('returns null when no full tank closes a segment', () => {
    expect(fuelMileage([fill(1000, 20, false), fill(1200, 20, false)])).toEqual({
      kmPerLitre: null,
      anomalies: [],
    })
  })

  it('returns null when a baseline is followed only by partial fills', () => {
    expect(fuelMileage([fill(1000, 40, true), fill(1200, 20, false)])).toEqual({
      kmPerLitre: null,
      anomalies: [],
    })
  })

  it('returns null with anomalies when every segment is implausible', () => {
    const r = fuelMileage([fill(1000, 40, true), fill(1400, 20, true)])
    expect(r.kmPerLitre).toBeNull()
    expect(r.anomalies).toHaveLength(1)
  })

  it('does not mutate its input', () => {
    const fills = Object.freeze([
      Object.freeze(fill(1000, 40, true)),
      Object.freeze(fill(1400, 40, true)),
    ]) as readonly FuelFill[]
    expect(() => fuelMileage(fills)).not.toThrow()
    expect(fills[1]).toEqual(fill(1400, 40, true))
  })

  it('is deterministic for the same input', () => {
    const fills = [fill(1000, 40, true), fill(1400, 40, true), fill(1800, 50, true)]
    expect(fuelMileage(fills)).toEqual(fuelMileage(fills))
  })
})

describe('maintenanceDue', () => {
  // today/current values below are chosen against the base item:
  // dueInKm = 20000 - currentKm, dueInDays = days from today to 2026-04-11.
  it('returns an empty array for no items', () => {
    expect(maintenanceDue([], 15000, '2026-03-01')).toEqual([])
  })

  it('reports ok when both km and days are well within limits', () => {
    const [d] = maintenanceDue([base()], 15000, '2026-03-01')
    expect(d).toEqual({ name: 'Engine oil', dueInKm: 5000, dueInDays: 41, status: 'ok' })
  })

  it('preserves input order and names', () => {
    const out = maintenanceDue(
      [base({ name: 'Brakes' }), base({ name: 'Tyres' }), base({ name: 'Filter' })],
      15000,
      '2026-03-01',
    )
    expect(out.map((o) => o.name)).toEqual(['Brakes', 'Tyres', 'Filter'])
  })

  it('marks due_soon at exactly 10% of the km interval remaining (inclusive)', () => {
    const [d] = maintenanceDue([base()], 19000, '2026-03-01')
    expect(d.dueInKm).toBe(1000)
    expect(d.status).toBe('due_soon')
  })

  it('stays ok just above the 10% km boundary', () => {
    const [d] = maintenanceDue([base()], 18999, '2026-03-01')
    expect(d.dueInKm).toBe(1001)
    expect(d.status).toBe('ok')
  })

  it('scales the 10% km threshold with the interval', () => {
    const item = base({ intervalKm: 5000, lastServiceKm: 10000 })
    // due at 15000 km; 10% of 5000 = 500
    expect(maintenanceDue([item], 14500, '2026-03-01')[0].status).toBe('due_soon')
    expect(maintenanceDue([item], 14499, '2026-03-01')[0].status).toBe('ok')
  })

  it('marks due_soon at exactly 14 days remaining (inclusive)', () => {
    const [d] = maintenanceDue([base()], 15000, '2026-03-28')
    expect(d.dueInDays).toBe(14)
    expect(d.status).toBe('due_soon')
  })

  it('stays ok at 15 days remaining', () => {
    const [d] = maintenanceDue([base()], 15000, '2026-03-27')
    expect(d.dueInDays).toBe(15)
    expect(d.status).toBe('ok')
  })

  it('applies whichever limit is hit first: km ok but days due_soon', () => {
    const [d] = maintenanceDue([base()], 15000, '2026-03-28')
    expect(d.dueInKm).toBe(5000)
    expect(d.status).toBe('due_soon')
  })

  it('applies whichever limit is hit first: days ok but km due_soon', () => {
    const [d] = maintenanceDue([base()], 19500, '2026-03-01')
    expect(d.dueInDays).toBe(41)
    expect(d.status).toBe('due_soon')
  })

  it('treats exactly zero km remaining as due_soon, not overdue', () => {
    const [d] = maintenanceDue([base()], 20000, '2026-03-01')
    expect(d.dueInKm).toBe(0)
    expect(d.status).toBe('due_soon')
  })

  it('marks overdue when km limit is passed by one', () => {
    const [d] = maintenanceDue([base()], 20001, '2026-03-01')
    expect(d.dueInKm).toBe(-1)
    expect(d.status).toBe('overdue')
  })

  it('treats exactly zero days remaining as due_soon, not overdue', () => {
    const [d] = maintenanceDue([base()], 15000, '2026-04-11')
    expect(d.dueInDays).toBe(0)
    expect(d.status).toBe('due_soon')
  })

  it('marks overdue when the date limit is passed by one day', () => {
    const [d] = maintenanceDue([base()], 15000, '2026-04-12')
    expect(d.dueInDays).toBe(-1)
    expect(d.status).toBe('overdue')
  })

  it('is overdue if either limit passed, even when the other is due_soon', () => {
    const [d] = maintenanceDue([base()], 20500, '2026-04-05')
    expect(d.dueInKm).toBe(-500)
    expect(d.dueInDays).toBe(6)
    expect(d.status).toBe('overdue')
  })

  it('handles a leap day correctly (2028 is a leap year)', () => {
    const item = base({ lastServiceDateIso: '2028-02-28', intervalDays: 1 })
    const [d] = maintenanceDue([item], 15000, '2028-02-28')
    expect(d.dueInDays).toBe(1)
  })

  it('handles a year boundary correctly', () => {
    const item = base({ lastServiceDateIso: '2026-12-20', intervalDays: 30 })
    // due 2027-01-19
    const [d] = maintenanceDue([item], 15000, '2026-12-31')
    expect(d.dueInDays).toBe(19)
    expect(d.status).toBe('ok')
  })

  it('returns the same result for the same inputs', () => {
    const items = [base(), base({ name: 'Tyres', lastServiceKm: 1000 })]
    expect(maintenanceDue(items, 15000, '2026-03-01')).toEqual(
      maintenanceDue(items, 15000, '2026-03-01'),
    )
  })
})

describe('expenseSummary', () => {
  const sample: Expense[] = [
    exp('fuel', 500000, '2026-03-01', 'T1'),
    exp('repair', 120050, '2026-03-15', 'T1'),
    exp('fuel', 300000, '2026-03-31', 'T2'),
    exp('tolls', 45000, '2026-04-01', 'T2'),
    exp('repair', 120050, '2026-02-28', 'T2'),
  ]

  it('returns zero totals and empty lists for empty input', () => {
    expect(expenseSummary([], '2026-01-01', '2026-12-31')).toEqual({
      totalPaise: 0,
      byCategory: [],
      byTruck: [],
    })
  })

  it('returns zero totals when nothing falls in range', () => {
    expect(expenseSummary(sample, '2025-01-01', '2025-12-31')).toEqual({
      totalPaise: 0,
      byCategory: [],
      byTruck: [],
    })
  })

  it('sums only expenses within the range', () => {
    const s = expenseSummary(sample, '2026-03-01', '2026-03-31')
    expect(s.totalPaise).toBe(920050)
  })

  it('includes expenses dated exactly on from and to', () => {
    const s = expenseSummary(sample, '2026-03-01', '2026-03-01')
    expect(s.totalPaise).toBe(500000)
  })

  it('excludes expenses one day before from and one day after to', () => {
    const s = expenseSummary(sample, '2026-03-02', '2026-03-30')
    expect(s.totalPaise).toBe(120050)
  })

  it('returns nothing when from is after to', () => {
    expect(expenseSummary(sample, '2026-04-30', '2026-03-01').totalPaise).toBe(0)
  })

  it('breaks totals down by category sorted by total descending', () => {
    const s = expenseSummary(sample, '2026-03-01', '2026-03-31')
    expect(s.byCategory).toEqual([
      { category: 'fuel', totalPaise: 800000 },
      { category: 'repair', totalPaise: 120050 },
    ])
  })

  it('breaks totals down by truck sorted by total descending', () => {
    const s = expenseSummary(sample, '2026-03-01', '2026-03-31')
    expect(s.byTruck).toEqual([
      { truckId: 'T1', totalPaise: 620050 },
      { truckId: 'T2', totalPaise: 300000 },
    ])
  })

  it('sorts ties by name ascending', () => {
    const s = expenseSummary(
      [exp('tolls', 45000, '2026-03-01', 'T9'), exp('parking', 45000, '2026-03-01', 'T3')],
      '2026-03-01',
      '2026-03-01',
    )
    expect(s.byCategory.map((c) => c.category)).toEqual(['parking', 'tolls'])
    expect(s.byTruck.map((t) => t.truckId)).toEqual(['T3', 'T9'])
  })

  it('rejects non-integer paise amounts', () => {
    expect(() => expenseSummary([exp('fuel', 10.5, '2026-03-01', 'T1')], '2026-03-01', '2026-03-31')).toThrow(
      RangeError,
    )
  })

  it('does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(sample)) as Expense[]
    expenseSummary(sample, '2026-03-01', '2026-03-31')
    expect(sample).toEqual(copy)
  })
})
