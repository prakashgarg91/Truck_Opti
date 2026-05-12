import { recommendTrucks, type SaleOrderItem, type TruckRecommendation, type TruckType } from '../src/lib/packing.js'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function benchmarkRecommendationPath(
  label: string,
  items: SaleOrderItem[],
  algorithm: string,
  trucks: TruckType[],
  runs = 10,
): void {
  const durations: number[] = []
  let topRecommendation: TruckRecommendation | null = null

  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now()
    const recommendations = recommendTrucks(items, algorithm, trucks)
    const duration = Math.round(performance.now() - startedAt)

    assert(recommendations.length > 0, `${label}: benchmark should produce at least one recommendation`)
    durations.push(duration)

    if (!topRecommendation) {
      topRecommendation = recommendations[0]
    }
  }

  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0)
  const averageDuration = Math.round(totalDuration / durations.length)
  const fastestDuration = Math.min(...durations)
  const slowestDuration = Math.max(...durations)

  console.log(
    `BENCH ${label}: avg=${averageDuration}ms fastest=${fastestDuration}ms slowest=${slowestDuration}ms ` +
    `top=${topRecommendation?.truck.name} fit=${topRecommendation?.itemsFit}/${topRecommendation?.totalItems}`,
  )
}

function benchmarkRecommendationSession(
  label: string,
  items: SaleOrderItem[],
  algorithm: string,
  trucks: TruckType[],
  passes = 3,
): void {
  const durations: number[] = []
  let finalRecommendation: TruckRecommendation | null = null

  for (let pass = 0; pass < passes; pass += 1) {
    const startedAt = performance.now()
    const recommendations = recommendTrucks(items, algorithm, trucks)
    const duration = Math.round(performance.now() - startedAt)

    assert(recommendations.length > 0, `${label}: session benchmark should produce at least one recommendation`)
    durations.push(duration)
    finalRecommendation = recommendations[0]
  }

  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0)
  const warmDurations = durations.slice(1)
  const warmAverageDuration = warmDurations.length > 0
    ? Math.round(warmDurations.reduce((sum, duration) => sum + duration, 0) / warmDurations.length)
    : durations[0]

  console.log(
    `SESSION ${label}: calls=${passes} total=${totalDuration}ms cold=${durations[0]}ms warmAvg=${warmAverageDuration}ms ` +
    `final=${finalRecommendation?.truck.name} fit=${finalRecommendation?.itemsFit}/${finalRecommendation?.totalItems}`,
  )
}

const benchmarkTrucks: TruckType[] = [
  { id: 'truck-01', name: 'Mini Runner', dimensions: { length: 1.8, width: 1.4, height: 1 }, capacity: 280, costPerKm: 9 },
  { id: 'truck-02', name: 'Compact SXL', dimensions: { length: 2, width: 1.5, height: 1 }, capacity: 320, costPerKm: 10 },
  { id: 'truck-03', name: 'Compact Tall', dimensions: { length: 2, width: 1.5, height: 1.2 }, capacity: 360, costPerKm: 11 },
  { id: 'truck-04', name: 'City Carrier', dimensions: { length: 2.2, width: 1.6, height: 1 }, capacity: 400, costPerKm: 12 },
  { id: 'truck-05', name: 'City Carrier Tall', dimensions: { length: 2.2, width: 1.6, height: 1.2 }, capacity: 450, costPerKm: 13 },
  { id: 'truck-06', name: 'Medium Flat', dimensions: { length: 2.4, width: 1.8, height: 1 }, capacity: 520, costPerKm: 14 },
  { id: 'truck-07', name: 'Medium Box', dimensions: { length: 2.4, width: 1.8, height: 1.2 }, capacity: 560, costPerKm: 15 },
  { id: 'truck-08', name: 'Wide Carrier', dimensions: { length: 2.4, width: 2, height: 1 }, capacity: 600, costPerKm: 16 },
  { id: 'truck-09', name: 'Wide Carrier Tall', dimensions: { length: 2.4, width: 2, height: 1.2 }, capacity: 660, costPerKm: 17 },
  { id: 'truck-10', name: 'Long Bed', dimensions: { length: 2.8, width: 1.8, height: 1 }, capacity: 650, costPerKm: 17 },
  { id: 'truck-11', name: 'Long Bed Tall', dimensions: { length: 2.8, width: 1.8, height: 1.2 }, capacity: 700, costPerKm: 18 },
  { id: 'truck-12', name: 'Large Box', dimensions: { length: 3, width: 2, height: 1 }, capacity: 780, costPerKm: 19 },
  { id: 'truck-13', name: 'Large Box Tall', dimensions: { length: 3, width: 2, height: 1.2 }, capacity: 820, costPerKm: 20 },
  { id: 'truck-14', name: 'Regional Hauler', dimensions: { length: 3.2, width: 2, height: 1.2 }, capacity: 900, costPerKm: 21 },
  { id: 'truck-15', name: 'Regional Hauler XL', dimensions: { length: 3.4, width: 2.2, height: 1.2 }, capacity: 980, costPerKm: 22 },
  { id: 'truck-16', name: 'Fleet Max', dimensions: { length: 3.6, width: 2.2, height: 1.2 }, capacity: 1050, costPerKm: 23 },
]

function createBenchmarkTruckSet(multiplier: number): TruckType[] {
  if (multiplier <= 1) {
    return benchmarkTrucks
  }

  return Array.from({ length: multiplier }, (_, batchIndex) => {
    return benchmarkTrucks.map((truck) => {
      if (batchIndex === 0) {
        return truck
      }

      return {
        ...truck,
        id: `${truck.id}-${batchIndex}`,
        name: `${truck.name} ${batchIndex}`,
      }
    })
  }).flat()
}

const mixedLoad: SaleOrderItem[] = [
  {
    id: 'filler-box',
    name: 'Filler Box',
    length: 50,
    width: 50,
    height: 100,
    weight: 10,
    quantity: 3,
    fragile: false,
    stackable: true,
  },
  {
    id: 'cube-box',
    name: 'Cube Box',
    length: 100,
    width: 100,
    height: 100,
    weight: 10,
    quantity: 2,
    fragile: false,
    stackable: true,
  },
  {
    id: 'floor-beam',
    name: 'Floor Beam',
    length: 200,
    width: 50,
    height: 50,
    weight: 10,
    quantity: 5,
    fragile: false,
    stackable: true,
  },
]

const uniformLoad: SaleOrderItem[] = [
  {
    id: 'uniform-cube',
    name: 'Uniform Cube',
    length: 100,
    width: 100,
    height: 100,
    weight: 25,
    quantity: 6,
    fragile: false,
    stackable: true,
  },
  {
    id: 'uniform-slab',
    name: 'Uniform Slab',
    length: 150,
    width: 50,
    height: 50,
    weight: 10,
    quantity: 4,
    fragile: false,
    stackable: true,
  },
]

function main(): void {
  const expandedTruckSet64 = createBenchmarkTruckSet(4)
  const expandedTruckSet128 = createBenchmarkTruckSet(8)

  console.log(
    `Packing benchmark truck sets: baseline=${benchmarkTrucks.length} expanded64=${expandedTruckSet64.length} expanded128=${expandedTruckSet128.length}`,
  )
  benchmarkRecommendationPath('mixed-load / 16 trucks / extreme_points', mixedLoad, 'extreme_points', benchmarkTrucks)
  benchmarkRecommendationPath('uniform-load / 16 trucks / extreme_points', uniformLoad, 'extreme_points', benchmarkTrucks)
  benchmarkRecommendationSession('mixed-load / browser-session / 64 trucks / extreme_points', mixedLoad, 'extreme_points', expandedTruckSet64)
  benchmarkRecommendationSession('mixed-load / browser-session / 128 trucks / extreme_points', mixedLoad, 'extreme_points', expandedTruckSet128)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Packing benchmark failed: ${message}`)
  throw error
}