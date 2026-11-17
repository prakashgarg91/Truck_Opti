/**
 * Deterministic load planner (TO-145). Pure library: no I/O, no clock, no randomness.
 *
 * Rules:
 * - Lines are grouped by (pickupSite, dropSite); each load serves exactly one group.
 * - Inside a group lines are ordered by pickupTo ascending (null last), orderId, lineNo.
 * - Packing is first-fit-decreasing by weight (ties keep the group order).
 * - Available trucks are used smallest-capacity first (then truckId). A truck makes one load.
 * - Weight and, when both sides define it, volume limits are never exceeded.
 * - A fragile line joins a load only if the load has no non-stackable line heavier than it.
 * - A line heavier than every truck (or too large by volume) is 'too_heavy'.
 *   Any other line that cannot be placed is 'no_truck'.
 */

export type OrderLine = {
  orderId: string
  lineNo: number
  weightKg: number
  volumeM3?: number
  pickupSite: string
  dropSite: string
  pickupTo: string | null
  stackable: boolean
  fragile: boolean
}

export type Truck = {
  truckId: string
  label: string
  capacityKg: number
  capacityM3?: number
  available: boolean
}

export type PlanOptions = Readonly<Record<string, never>>

export type UnmetReason = 'too_heavy' | 'no_truck'

export type UnmetLine = {
  orderId: string
  lineNo: number
  reason: UnmetReason
}

export type PlannedLoad = {
  truckId: string
  lines: OrderLine[]
  totalKg: number
  utilizationPct: number
  pickupSite: string
  dropSite: string
}

export type LoadPlan = {
  loads: PlannedLoad[]
  unmet: UnmetLine[]
}

const EPSILON = 1e-9

type OpenLoad = {
  truck: Truck
  lines: OrderLine[]
  kg: number
  m3: number
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function compareLines(a: OrderLine, b: OrderLine): number {
  if (a.pickupTo !== b.pickupTo) {
    if (a.pickupTo === null) return 1
    if (b.pickupTo === null) return -1
    const byPickup = compareStrings(a.pickupTo, b.pickupTo)
    if (byPickup !== 0) return byPickup
  }
  return compareStrings(a.orderId, b.orderId) || a.lineNo - b.lineNo
}

function compareTrucks(a: Truck, b: Truck): number {
  return a.capacityKg - b.capacityKg || compareStrings(a.truckId, b.truckId)
}

function fitsTruckAlone(truck: Truck, line: OrderLine): boolean {
  if (line.weightKg > truck.capacityKg + EPSILON) return false
  if (truck.capacityM3 !== undefined && line.volumeM3 !== undefined) {
    return line.volumeM3 <= truck.capacityM3 + EPSILON
  }
  return true
}

function fitsLoad(load: OpenLoad, line: OrderLine): boolean {
  if (load.kg + line.weightKg > load.truck.capacityKg + EPSILON) return false
  if (load.truck.capacityM3 !== undefined && line.volumeM3 !== undefined) {
    return load.m3 + line.volumeM3 <= load.truck.capacityM3 + EPSILON
  }
  return true
}

function fragileAllowed(load: OpenLoad, line: OrderLine): boolean {
  if (!line.fragile) return true
  return !load.lines.some((other) => !other.stackable && other.weightKg > line.weightKg)
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function planLoads(
  orders: readonly OrderLine[],
  trucks: readonly Truck[],
  options: PlanOptions = {},
): LoadPlan {
  void options

  const routeMap = new Map<string, { pickupSite: string; dropSite: string; lines: OrderLine[] }>()
  for (const order of orders) {
    const key = `${order.pickupSite}\u0000${order.dropSite}`
    const existing = routeMap.get(key)
    if (existing) {
      existing.lines.push(order)
    } else {
      routeMap.set(key, { pickupSite: order.pickupSite, dropSite: order.dropSite, lines: [order] })
    }
  }
  const routes = [...routeMap.values()].sort(
    (a, b) => compareStrings(a.pickupSite, b.pickupSite) || compareStrings(a.dropSite, b.dropSite),
  )

  const free = trucks.filter((truck) => truck.available).sort(compareTrucks)
  const loads: PlannedLoad[] = []
  const unmet: UnmetLine[] = []

  for (const route of routes) {
    const groupOrder = [...route.lines].sort(compareLines)
    const rank = new Map<OrderLine, number>()
    groupOrder.forEach((line, index) => rank.set(line, index))
    const packOrder = [...groupOrder].sort(
      (a, b) => b.weightKg - a.weightKg || (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
    )

    const open: OpenLoad[] = []
    for (const line of packOrder) {
      const target = open.find((load) => fitsLoad(load, line) && fragileAllowed(load, line))
      if (target) {
        target.lines.push(line)
        target.kg += line.weightKg
        target.m3 += line.volumeM3 ?? 0
        continue
      }

      const freeIndex = free.findIndex((truck) => fitsTruckAlone(truck, line))
      if (freeIndex >= 0) {
        const [truck] = free.splice(freeIndex, 1)
        open.push({ truck, lines: [line], kg: line.weightKg, m3: line.volumeM3 ?? 0 })
        continue
      }

      const reason: UnmetReason =
        trucks.length > 0 && !trucks.some((truck) => fitsTruckAlone(truck, line)) ? 'too_heavy' : 'no_truck'
      unmet.push({ orderId: line.orderId, lineNo: line.lineNo, reason })
    }

    for (const load of open) {
      const lines = [...load.lines].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
      const utilization = load.truck.capacityKg > 0 ? (load.kg / load.truck.capacityKg) * 100 : 0
      loads.push({
        truckId: load.truck.truckId,
        lines,
        totalKg: roundTo(load.kg, 3),
        utilizationPct: roundTo(utilization, 1),
        pickupSite: route.pickupSite,
        dropSite: route.dropSite,
      })
    }
  }

  return { loads, unmet }
}
