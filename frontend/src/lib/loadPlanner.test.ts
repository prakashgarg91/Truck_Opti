import { describe, expect, it } from 'vitest'
import { planLoads, type OrderLine, type Truck } from './loadPlanner'

const line = (overrides: Partial<OrderLine> & { orderId: string }): OrderLine => ({
  lineNo: 1,
  weightKg: 100,
  pickupSite: 'PUNE',
  dropSite: 'DELHI',
  pickupTo: '2026-01-01T00:00:00.000Z',
  stackable: true,
  fragile: false,
  ...overrides,
})

const truck = (truckId: string, capacityKg: number, overrides: Partial<Truck> = {}): Truck => ({
  truckId,
  label: `Truck ${truckId}`,
  capacityKg,
  available: true,
  ...overrides,
})

describe('planLoads', () => {
  it('returns no loads and no unmet lines for empty input', () => {
    expect(planLoads([], [])).toEqual({ loads: [], unmet: [] })
  })

  it('returns no loads when there are orders but no trucks', () => {
    const result = planLoads([line({ orderId: 'O1' })], [])
    expect(result.loads).toEqual([])
    expect(result.unmet).toEqual([{ orderId: 'O1', lineNo: 1, reason: 'no_truck' }])
  })

  it('fills a truck exactly to capacity with utilization 100', () => {
    const result = planLoads([line({ orderId: 'O1', weightKg: 1000 })], [truck('T1', 1000)])
    expect(result.unmet).toEqual([])
    expect(result.loads).toHaveLength(1)
    expect(result.loads[0]).toMatchObject({ truckId: 'T1', totalKg: 1000, utilizationPct: 100 })
  })

  it('opens a second load when lines overflow the first truck', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 600 }), line({ orderId: 'O2', weightKg: 600 })],
      [truck('T1', 1000), truck('T2', 1000)],
    )
    expect(result.unmet).toEqual([])
    expect(result.loads).toHaveLength(2)
    expect(result.loads.map((l) => l.lines.length)).toEqual([1, 1])
  })

  it('reports the overflow line as no_truck when no truck remains', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 600 }), line({ orderId: 'O2', weightKg: 600 })],
      [truck('T1', 1000)],
    )
    expect(result.loads).toHaveLength(1)
    expect(result.unmet).toEqual([{ orderId: 'O2', lineNo: 1, reason: 'no_truck' }])
  })

  it('never mixes lines from different pickup or drop routes in one load', () => {
    const result = planLoads(
      [
        line({ orderId: 'O1', pickupSite: 'PUNE', dropSite: 'DELHI', weightKg: 100 }),
        line({ orderId: 'O2', pickupSite: 'PUNE', dropSite: 'MUMBAI', weightKg: 100 }),
        line({ orderId: 'O3', pickupSite: 'SURAT', dropSite: 'DELHI', weightKg: 100 }),
      ],
      [truck('T1', 5000), truck('T2', 5000), truck('T3', 5000)],
    )
    expect(result.unmet).toEqual([])
    expect(result.loads).toHaveLength(3)
    for (const load of result.loads) {
      const routes = new Set(load.lines.map((l) => `${l.pickupSite}>${l.dropSite}`))
      expect(routes.size).toBe(1)
      expect(load.pickupSite).toBe(load.lines[0].pickupSite)
      expect(load.dropSite).toBe(load.lines[0].dropSite)
    }
  })

  it('does not reuse a truck for a second route group', () => {
    const result = planLoads(
      [
        line({ orderId: 'O1', pickupSite: 'PUNE', dropSite: 'DELHI', weightKg: 500 }),
        line({ orderId: 'O2', pickupSite: 'PUNE', dropSite: 'MUMBAI', weightKg: 500 }),
      ],
      [truck('T1', 1000)],
    )
    expect(result.loads.map((l) => l.truckId)).toEqual(['T1'])
    expect(result.unmet).toEqual([{ orderId: 'O2', lineNo: 1, reason: 'no_truck' }])
  })

  it('marks a line heavier than every truck as too_heavy', () => {
    const result = planLoads([line({ orderId: 'O1', weightKg: 2000 })], [truck('T1', 1000), truck('T2', 1500)])
    expect(result.loads).toEqual([])
    expect(result.unmet).toEqual([{ orderId: 'O1', lineNo: 1, reason: 'too_heavy' }])
  })

  it('prefers too_heavy over no_truck when the line can never fit', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 400 }), line({ orderId: 'O2', weightKg: 5000 })],
      [truck('T1', 1000)],
    )
    expect(result.loads[0].lines.map((l) => l.orderId)).toEqual(['O1'])
    expect(result.unmet).toEqual([{ orderId: 'O2', lineNo: 1, reason: 'too_heavy' }])
  })

  it('ignores unavailable trucks', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 500 })],
      [truck('T1', 5000, { available: false }), truck('T2', 1000)],
    )
    expect(result.loads.map((l) => l.truckId)).toEqual(['T2'])
    expect(result.unmet).toEqual([])
  })

  it('reports no_truck when every truck that could carry the line is unavailable', () => {
    const result = planLoads([line({ orderId: 'O1', weightKg: 500 })], [truck('T1', 1000, { available: false })])
    expect(result.loads).toEqual([])
    expect(result.unmet).toEqual([{ orderId: 'O1', lineNo: 1, reason: 'no_truck' }])
  })

  it('picks the smallest sufficient truck first', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 500 })],
      [truck('T9', 5000), truck('T1', 1000)],
    )
    expect(result.loads[0].truckId).toBe('T1')
  })

  it('breaks equal-capacity truck ties by truckId', () => {
    const result = planLoads([line({ orderId: 'O1', weightKg: 500 })], [truck('B', 1000), truck('A', 1000)])
    expect(result.loads[0].truckId).toBe('A')
  })

  it('packs first-fit-decreasing by weight', () => {
    const result = planLoads(
      [
        line({ orderId: 'O1', weightKg: 200 }),
        line({ orderId: 'O2', weightKg: 400 }),
        line({ orderId: 'O3', weightKg: 300 }),
        line({ orderId: 'O4', weightKg: 300 }),
      ],
      [truck('T1', 1000), truck('T2', 1000)],
    )
    expect(result.unmet).toEqual([])
    expect(result.loads).toHaveLength(2)
    expect(result.loads[0].lines.map((l) => l.orderId).sort()).toEqual(['O2', 'O3', 'O4'])
    expect(result.loads[0].totalKg).toBe(1000)
    expect(result.loads[1].lines.map((l) => l.orderId)).toEqual(['O1'])
    expect(result.loads[1].utilizationPct).toBe(20)
  })

  it('orders equal-weight lines by pickupTo ascending with null last', () => {
    const result = planLoads(
      [
        line({ orderId: 'O1', weightKg: 600, pickupTo: null }),
        line({ orderId: 'O2', weightKg: 600, pickupTo: '2026-01-02T00:00:00.000Z' }),
        line({ orderId: 'O3', weightKg: 600, pickupTo: '2026-01-01T00:00:00.000Z' }),
      ],
      [truck('T1', 1000), truck('T2', 1000), truck('T3', 1000)],
    )
    expect(result.loads.map((l) => l.lines[0].orderId)).toEqual(['O3', 'O2', 'O1'])
  })

  it('breaks ties by orderId then lineNo', () => {
    const result = planLoads(
      [
        line({ orderId: 'O1', lineNo: 2, weightKg: 100 }),
        line({ orderId: 'O1', lineNo: 1, weightKg: 100 }),
        line({ orderId: 'O0', lineNo: 5, weightKg: 100 }),
      ],
      [truck('T1', 5000)],
    )
    expect(result.loads[0].lines.map((l) => `${l.orderId}/${l.lineNo}`)).toEqual(['O0/5', 'O1/1', 'O1/2'])
  })

  it('rounds utilization to one decimal place', () => {
    const result = planLoads([line({ orderId: 'O1', weightKg: 667 })], [truck('T1', 1000)])
    expect(result.loads[0].utilizationPct).toBe(66.7)
    const third = planLoads([line({ orderId: 'O1', weightKg: 333 })], [truck('T1', 1000)])
    expect(third.loads[0].utilizationPct).toBe(33.3)
  })

  it('sums totalKg across lines in a load', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 120 }), line({ orderId: 'O2', weightKg: 80 })],
      [truck('T1', 1000)],
    )
    expect(result.loads[0].totalKg).toBe(200)
    expect(result.loads[0].utilizationPct).toBe(20)
  })

  it('enforces the volume limit when both truck and line carry volume', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 10, volumeM3: 0.6 }), line({ orderId: 'O2', weightKg: 10, volumeM3: 0.6 })],
      [truck('T1', 10000, { capacityM3: 1 }), truck('T2', 10000, { capacityM3: 1 })],
    )
    expect(result.unmet).toEqual([])
    expect(result.loads).toHaveLength(2)
  })

  it('skips the volume check when the truck has no capacityM3', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 10, volumeM3: 5 }), line({ orderId: 'O2', weightKg: 10, volumeM3: 5 })],
      [truck('T1', 10000)],
    )
    expect(result.loads).toHaveLength(1)
    expect(result.unmet).toEqual([])
  })

  it('skips the volume check when the line has no volume', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 10 }), line({ orderId: 'O2', weightKg: 10 })],
      [truck('T1', 10000, { capacityM3: 0.1 })],
    )
    expect(result.loads).toHaveLength(1)
  })

  it('marks a line whose volume exceeds every truck as too_heavy', () => {
    const result = planLoads(
      [line({ orderId: 'O1', weightKg: 10, volumeM3: 2 })],
      [truck('T1', 10000, { capacityM3: 1 })],
    )
    expect(result.loads).toEqual([])
    expect(result.unmet).toEqual([{ orderId: 'O1', lineNo: 1, reason: 'too_heavy' }])
  })

  it('keeps a fragile line out of a load with a heavier non-stackable line', () => {
    const result = planLoads(
      [
        line({ orderId: 'O1', weightKg: 300, stackable: false }),
        line({ orderId: 'O2', weightKg: 100, fragile: true }),
      ],
      [truck('T1', 5000), truck('T2', 5000)],
    )
    expect(result.unmet).toEqual([])
    expect(result.loads).toHaveLength(2)
    const fragileLoad = result.loads.find((l) => l.lines.some((x) => x.orderId === 'O2'))
    expect(fragileLoad?.lines.some((x) => x.orderId === 'O1')).toBe(false)
  })

  it('allows a fragile line with a heavier stackable line', () => {
    const result = planLoads(
      [
        line({ orderId: 'O1', weightKg: 300, stackable: true }),
        line({ orderId: 'O2', weightKg: 100, fragile: true }),
      ],
      [truck('T1', 5000)],
    )
    expect(result.loads).toHaveLength(1)
    expect(result.loads[0].lines.map((l) => l.orderId).sort()).toEqual(['O1', 'O2'])
  })

  it('returns byte-identical output for the same input', () => {
    const orders = [
      line({ orderId: 'O1', weightKg: 400, pickupTo: null }),
      line({ orderId: 'O2', weightKg: 300, dropSite: 'MUMBAI' }),
      line({ orderId: 'O3', weightKg: 250, fragile: true, stackable: false }),
    ]
    const trucks = [truck('T2', 1000), truck('T1', 1000)]
    expect(JSON.stringify(planLoads(orders, trucks))).toBe(JSON.stringify(planLoads(orders, trucks)))
  })

  it('returns the same output regardless of input order', () => {
    const orders = [
      line({ orderId: 'O1', weightKg: 400, pickupTo: '2026-01-03T00:00:00.000Z' }),
      line({ orderId: 'O2', weightKg: 400, pickupTo: '2026-01-02T00:00:00.000Z' }),
      line({ orderId: 'O3', weightKg: 300, dropSite: 'MUMBAI' }),
      line({ orderId: 'O4', weightKg: 200, pickupTo: null }),
    ]
    const trucks = [truck('T3', 5000), truck('T1', 1000), truck('T2', 1000)]
    const forward = JSON.stringify(planLoads(orders, trucks))
    const reversed = JSON.stringify(planLoads([...orders].reverse(), [...trucks].reverse()))
    expect(reversed).toBe(forward)
  })

  it('does not mutate its inputs', () => {
    const orders = [line({ orderId: 'O2', weightKg: 100 }), line({ orderId: 'O1', weightKg: 200 })]
    const trucks = [truck('T2', 1000), truck('T1', 1000)]
    const ordersSnapshot = JSON.stringify(orders)
    const trucksSnapshot = JSON.stringify(trucks)
    planLoads(orders, trucks)
    expect(JSON.stringify(orders)).toBe(ordersSnapshot)
    expect(JSON.stringify(trucks)).toBe(trucksSnapshot)
  })
})
