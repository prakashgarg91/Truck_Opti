// Pure fleet expense maths: no React, no network, no clock reads.
// Money is integer paise. Dates are ISO calendar days (YYYY-MM-DD) and the
// current time is always passed in by the caller.

export type FuelFill = {
  odometerKm: number
  litres: number
  fullTank: boolean
}

export type FuelAnomalyReason = 'odometer_backwards' | 'bad_litres' | 'implausible_mileage'

export type FuelAnomaly = {
  index: number
  reason: FuelAnomalyReason
}

export type FuelMileageResult = {
  kmPerLitre: number | null
  anomalies: FuelAnomaly[]
}

const MIN_PLAUSIBLE_KM_PER_LITRE = 1
const MAX_PLAUSIBLE_KM_PER_LITRE = 15

const round2 = (value: number): number => Math.round(value * 100) / 100

/**
 * Full-tank-to-full-tank mileage.
 *
 * The first accepted fill only sets the baseline. Litres from partial fills
 * accumulate until the next full tank, which closes a segment. Segments with
 * implausible mileage are excluded from the average. Skipped fills (bad
 * litres or a backwards odometer) do not change the baseline.
 */
export function fuelMileage(fills: readonly FuelFill[]): FuelMileageResult {
  const anomalies: FuelAnomaly[] = []
  let totalKm = 0
  let totalLitres = 0
  let baselineOdo: number | null = null
  let lastOdo: number | null = null
  let litresSinceBaseline = 0

  fills.forEach((fill, index) => {
    if (!(Number.isFinite(fill.litres) && fill.litres > 0)) {
      anomalies.push({ index, reason: 'bad_litres' })
      return
    }
    if (lastOdo !== null && fill.odometerKm < lastOdo) {
      anomalies.push({ index, reason: 'odometer_backwards' })
      return
    }

    lastOdo = fill.odometerKm
    if (baselineOdo === null) {
      baselineOdo = fill.odometerKm
      litresSinceBaseline = 0
      return
    }

    litresSinceBaseline += fill.litres
    if (!fill.fullTank) return

    const km = fill.odometerKm - baselineOdo
    const kmPerLitre = km / litresSinceBaseline
    if (kmPerLitre < MIN_PLAUSIBLE_KM_PER_LITRE || kmPerLitre > MAX_PLAUSIBLE_KM_PER_LITRE) {
      anomalies.push({ index, reason: 'implausible_mileage' })
    } else {
      totalKm += km
      totalLitres += litresSinceBaseline
    }
    baselineOdo = fill.odometerKm
    litresSinceBaseline = 0
  })

  return {
    kmPerLitre: totalLitres > 0 ? round2(totalKm / totalLitres) : null,
    anomalies,
  }
}

export type MaintenanceItem = {
  name: string
  lastServiceKm: number
  intervalKm: number
  lastServiceDateIso: string
  intervalDays: number
}

export type MaintenanceStatus = 'ok' | 'due_soon' | 'overdue'

export type MaintenanceDue = {
  name: string
  dueInKm: number
  dueInDays: number
  status: MaintenanceStatus
}

const DUE_SOON_DAYS = 14
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

function isoDayNumber(iso: string): number {
  if (!ISO_DAY.test(iso)) {
    throw new RangeError(`Expected a YYYY-MM-DD date, got "${iso}"`)
  }
  const [year, month, day] = iso.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

/**
 * Remaining km and days for each maintenance item, in input order.
 *
 * Status:
 * - overdue: a km or a date limit has passed (remaining < 0)
 * - due_soon: remaining km is within 10% of the interval, or remaining days
 *   are within 14, whichever is reached first (both boundaries inclusive)
 * - ok: otherwise
 */
export function maintenanceDue(
  items: readonly MaintenanceItem[],
  currentKm: number,
  todayIso: string,
): MaintenanceDue[] {
  const today = isoDayNumber(todayIso)
  return items.map((item) => {
    const dueInKm = item.lastServiceKm + item.intervalKm - currentKm
    const dueDay = isoDayNumber(item.lastServiceDateIso) + item.intervalDays
    const dueInDays = dueDay - today

    let status: MaintenanceStatus
    if (dueInKm < 0 || dueInDays < 0) {
      status = 'overdue'
    } else if (dueInKm * 10 <= item.intervalKm || dueInDays <= DUE_SOON_DAYS) {
      status = 'due_soon'
    } else {
      status = 'ok'
    }

    return { name: item.name, dueInKm, dueInDays, status }
  })
}

export type Expense = {
  category: string
  amountPaise: number
  dateIso: string
  truckId: string
}

export type ExpenseSummary = {
  totalPaise: number
  byCategory: { category: string; totalPaise: number }[]
  byTruck: { truckId: string; totalPaise: number }[]
}

const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function sortByTotalThenKey<T extends { totalPaise: number }>(
  rows: T[],
  key: (row: T) => string,
): T[] {
  return rows.sort((a, b) => b.totalPaise - a.totalPaise || compareKeys(key(a), key(b)))
}

/**
 * Totals for expenses dated within [fromIso, toIso] (both inclusive).
 * Breakdowns are sorted by total descending, then by name ascending.
 */
export function expenseSummary(
  expenses: readonly Expense[],
  fromIso: string,
  toIso: string,
): ExpenseSummary {
  isoDayNumber(fromIso)
  isoDayNumber(toIso)

  const categoryTotals = new Map<string, number>()
  const truckTotals = new Map<string, number>()
  let totalPaise = 0

  for (const expense of expenses) {
    if (!Number.isSafeInteger(expense.amountPaise)) {
      throw new RangeError(`amountPaise must be an integer, got ${expense.amountPaise}`)
    }
    if (expense.dateIso < fromIso || expense.dateIso > toIso) continue

    totalPaise += expense.amountPaise
    categoryTotals.set(
      expense.category,
      (categoryTotals.get(expense.category) ?? 0) + expense.amountPaise,
    )
    truckTotals.set(expense.truckId, (truckTotals.get(expense.truckId) ?? 0) + expense.amountPaise)
  }

  const byCategory = sortByTotalThenKey(
    [...categoryTotals].map(([category, total]) => ({ category, totalPaise: total })),
    (row) => row.category,
  )
  const byTruck = sortByTotalThenKey(
    [...truckTotals].map(([truckId, total]) => ({ truckId, totalPaise: total })),
    (row) => row.truckId,
  )

  return { totalPaise, byCategory, byTruck }
}
