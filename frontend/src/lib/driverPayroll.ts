// TO-150: driver pay and report aggregation (pure library).
// No React, no network, no clock, no randomness: every result is a pure
// function of its arguments. All money is integer paise. Distance is
// normalised to whole metres and load to whole kilograms before any
// multiplication, so rounding is done in integer arithmetic only.

export type DriverPayTrip = {
  tripId: string
  distanceKm: number
  loadedKg: number
  dateIso: string
}

export type PayDeduction = {
  reason: string
  amountPaise: number
}

export type DriverPayInput = {
  basePaise: number
  trips: DriverPayTrip[]
  perKmPaise: number
  perTonnePaise: number
  advancesPaise: number
  deductions: PayDeduction[]
  periodStartIso: string
  periodEndIso: string
}

export type PayLine =
  | { kind: 'base'; amountPaise: number }
  | { kind: 'distance'; tripId: string; amountPaise: number }
  | { kind: 'tonnage'; tripId: string; amountPaise: number }
  | { kind: 'advance'; amountPaise: number }
  | { kind: 'deduction'; reason: string; amountPaise: number }

export type DriverPayResult = {
  earningsPaise: number
  deductionsPaise: number
  advancesPaise: number
  netPaise: number
  shortfallPaise: number
  lines: PayLine[]
  ignoredTripIds: string[]
}

export type ReportTrip = {
  tripId: string
  driverId: string | null
  truckId: string | null
  dateIso: string
  distanceKm: number
  loadedKg: number
}

export type ReportGroupBy = 'driver' | 'truck' | 'month'

export type TripAggregate = {
  key: string
  tripCount: number
  distanceKm: number
  loadedKg: number
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function assertIsoDate(name: string, value: string): void {
  const m = DATE_RE.exec(value)
  if (!m) throw new RangeError(`${name} must be YYYY-MM-DD, got "${value}"`)
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`${name} is not a valid calendar date: "${value}"`)
  }
}

function assertPaise(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer paise amount, got ${value}`)
  }
}

function assertDistanceKm(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative distance, got ${value}`)
  }
}

function assertLoadKg(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole kilogram value, got ${value}`)
  }
}

// Round n / d half-up for non-negative integers, d a positive integer.
function roundHalfUpDiv(n: number, d: number): number {
  return Math.floor((n + d / 2) / d)
}

// Distance paise: metres x paise-per-km, divided by 1000, half-up.
function distancePaise(distanceKm: number, perKmPaise: number): number {
  const metres = Math.round(distanceKm * 1000)
  return roundHalfUpDiv(metres * perKmPaise, 1000)
}

// Tonnage paise: kg x paise-per-tonne, divided by 1000, half-up.
function tonnagePaise(loadedKg: number, perTonnePaise: number): number {
  return roundHalfUpDiv(loadedKg * perTonnePaise, 1000)
}

export function computeDriverPay(input: DriverPayInput): DriverPayResult {
  assertIsoDate('periodStartIso', input.periodStartIso)
  assertIsoDate('periodEndIso', input.periodEndIso)
  if (input.periodStartIso > input.periodEndIso) {
    throw new RangeError('periodStartIso must not be after periodEndIso')
  }
  assertPaise('basePaise', input.basePaise)
  assertPaise('perKmPaise', input.perKmPaise)
  assertPaise('perTonnePaise', input.perTonnePaise)
  assertPaise('advancesPaise', input.advancesPaise)
  for (const d of input.deductions) assertPaise(`deduction "${d.reason}"`, d.amountPaise)

  const lines: PayLine[] = []
  const ignoredTripIds: string[] = []

  if (input.basePaise > 0) lines.push({ kind: 'base', amountPaise: input.basePaise })

  let earningsPaise = input.basePaise
  for (const t of input.trips) {
    assertIsoDate(`dateIso of trip ${t.tripId}`, t.dateIso)
    assertDistanceKm(`distanceKm of trip ${t.tripId}`, t.distanceKm)
    assertLoadKg(`loadedKg of trip ${t.tripId}`, t.loadedKg)

    // Period bounds are inclusive on both ends.
    const inPeriod = t.dateIso >= input.periodStartIso && t.dateIso <= input.periodEndIso
    if (!inPeriod) {
      ignoredTripIds.push(t.tripId)
      continue
    }

    const dist = distancePaise(t.distanceKm, input.perKmPaise)
    if (dist > 0) {
      lines.push({ kind: 'distance', tripId: t.tripId, amountPaise: dist })
      earningsPaise += dist
    }
    const ton = tonnagePaise(t.loadedKg, input.perTonnePaise)
    if (ton > 0) {
      lines.push({ kind: 'tonnage', tripId: t.tripId, amountPaise: ton })
      earningsPaise += ton
    }
  }

  if (input.advancesPaise > 0) lines.push({ kind: 'advance', amountPaise: input.advancesPaise })

  let deductionsPaise = 0
  for (const d of input.deductions) {
    deductionsPaise += d.amountPaise
    if (d.amountPaise > 0) {
      lines.push({ kind: 'deduction', reason: d.reason, amountPaise: d.amountPaise })
    }
  }

  const obligationsPaise = deductionsPaise + input.advancesPaise
  // Net is clamped at zero; the unrecovered part is reported as shortfall
  // so the carry is visible to the caller rather than silently lost.
  const netPaise = Math.max(0, earningsPaise - obligationsPaise)
  const shortfallPaise = Math.max(0, obligationsPaise - earningsPaise)

  return {
    earningsPaise,
    deductionsPaise,
    advancesPaise: input.advancesPaise,
    netPaise,
    shortfallPaise,
    lines,
    ignoredTripIds,
  }
}

function reportKey(t: ReportTrip, groupBy: ReportGroupBy): string {
  if (groupBy === 'driver') return t.driverId ?? 'unassigned'
  if (groupBy === 'truck') return t.truckId ?? 'unassigned'
  return t.dateIso.slice(0, 7)
}

export function tripsByDriverReport(
  trips: ReportTrip[],
  groupBy: ReportGroupBy,
): TripAggregate[] {
  // Accumulate distance in whole metres and load in whole kg so sums are exact.
  const groups = new Map<string, { tripCount: number; metres: number; loadedKg: number }>()

  for (const t of trips) {
    assertDistanceKm(`distanceKm of trip ${t.tripId}`, t.distanceKm)
    assertLoadKg(`loadedKg of trip ${t.tripId}`, t.loadedKg)
    const key = reportKey(t, groupBy)
    const g = groups.get(key) ?? { tripCount: 0, metres: 0, loadedKg: 0 }
    g.tripCount += 1
    g.metres += Math.round(t.distanceKm * 1000)
    g.loadedKg += t.loadedKg
    groups.set(key, g)
  }

  const out: TripAggregate[] = Array.from(groups, ([key, g]) => ({
    key,
    tripCount: g.tripCount,
    distanceKm: g.metres / 1000,
    loadedKg: g.loadedKg,
  }))

  // Keys are unique, so ordering is fully determined; Array.prototype.sort is
  // stable regardless, and the comparator uses plain code-unit order so the
  // result does not depend on the runtime locale.
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return out
}
