import { AdvancedBinPacker, recommendTrucks, type PackedBox, type PackingResult, type SaleOrderItem, type TruckRecommendation, type TruckType } from '../src/lib/packing.js'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`)
  }
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function simplifyResult(result: PackingResult): string {
  return JSON.stringify({
    packed: result.packed.map((box: PackedBox) => ({
      id: box.id,
      x: box.x,
      y: box.y,
      z: box.z,
      width: box.width,
      height: box.height,
      depth: box.depth,
    })),
    unpacked: result.unpacked,
  })
}

function simplifyPackedPositions(packed: PackedBox[]): string {
  return packed
    .map((box: PackedBox) => `${box.x},${box.y},${box.z}`)
    .sort()
    .join('|')
}

function logPass(label: string, detail: string): void {
  console.log(`PASS ${label}: ${detail}`)
}

const trucks: TruckType[] = [
  {
    id: 'mini',
    name: 'Mini Truck',
    dimensions: { length: 2, width: 1, height: 1 },
    capacity: 250,
    costPerKm: 10,
  },
  {
    id: 'medium',
    name: 'Medium Truck',
    dimensions: { length: 2, width: 2, height: 1 },
    capacity: 600,
    costPerKm: 14,
  },
  {
    id: 'large',
    name: 'Large Truck',
    dimensions: { length: 3, width: 2, height: 1 },
    capacity: 900,
    costPerKm: 20,
  },
]

function runSkylineFixture(): void {
  const items: SaleOrderItem[] = [
    {
      id: 'slim-box',
      name: 'Slim Box',
      length: 50,
      width: 100,
      height: 100,
      weight: 50,
      quantity: 4,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[1], items, 'skyline').pack()
  assertEqual(result.packed.length, 4, 'Skyline should pack all four slim boxes into the medium truck')
  assertEqual(result.unpacked.length, 0, 'Skyline should leave no unpacked items in the medium truck slim-box fixture')
  logPass('skyline fixture', 'packed 4 of 4 slim boxes into the medium truck')
}

function runSkylineBoundaryFixture(): void {
  const items: SaleOrderItem[] = [
    {
      id: 'cube',
      name: 'Cube',
      length: 100,
      width: 100,
      height: 100,
      weight: 100,
      quantity: 4,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[1], items, 'skyline').pack()
  assertEqual(result.packed.length, 4, 'Skyline should pack all four cubes into the medium truck boundary fixture')
  assertEqual(result.unpacked.length, 0, 'Skyline should leave no unpacked items in the medium truck boundary fixture')
  assertEqual(
    simplifyPackedPositions(result.packed),
    '0,0,0|0,0,1|1,0,0|1,0,1',
    'Skyline should place cubes on exact boundary-aligned coordinates in the medium truck boundary fixture',
  )
  logPass('skyline boundary fixture', 'packed 4 cubes on exact boundary-aligned coordinates')
}

function runExtremePointsFixture(): void {
  const items: SaleOrderItem[] = [
    {
      id: 'dense-cube',
      name: 'Dense Cube',
      length: 100,
      width: 100,
      height: 100,
      weight: 100,
      quantity: 3,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[0], items, 'extreme_points').pack()
  assertEqual(result.packed.length, 2, 'Extreme points should pack only two cubes into the mini truck')
  assertEqual(result.unpacked.length, 1, 'Extreme points should leave one cube unpacked in the mini truck fixture')
  assertEqual(result.unpacked[0], 'Dense Cube #3', 'Extreme points should report the third cube as unpacked')
  logPass('extreme points fixture', 'packed 2 cubes and left 1 unpacked in the mini truck')
}

function runRecommendationFixture(): void {
  const items: SaleOrderItem[] = [
    {
      id: 'cube',
      name: 'Cube',
      length: 100,
      width: 100,
      height: 100,
      weight: 100,
      quantity: 4,
      fragile: false,
      stackable: true,
    },
  ]

  const recommendations: TruckRecommendation[] = recommendTrucks(items, 'extreme_points', trucks)
  assertEqual(recommendations.length, 3, 'Recommendation fixture should evaluate all three candidate trucks')
  assertEqual(recommendations[0].truck.id, 'medium', 'Recommendation ranking should prefer the medium truck for the balanced full-fit fixture')
  assertEqual(recommendations[0].itemsFit, 4, 'Top recommendation should fit all four cubes')
  assertEqual(recommendations[recommendations.length - 1].truck.id, 'mini', 'Mini truck should rank last because it cannot fit all cubes')
  logPass('recommendation fixture', 'ranked medium first and mini last for the balanced cube load')
}

function runGeneticDeterminismFixture(): void {
  const items: SaleOrderItem[] = [
    {
      id: 'wide-box',
      name: 'Wide Box',
      length: 100,
      width: 100,
      height: 100,
      weight: 80,
      quantity: 2,
      fragile: false,
      stackable: true,
    },
    {
      id: 'slim-box',
      name: 'Slim Box',
      length: 50,
      width: 100,
      height: 100,
      weight: 40,
      quantity: 2,
      fragile: false,
      stackable: true,
    },
  ]

  const firstRun = new AdvancedBinPacker(trucks[1], items, 'genetic', {
    geneticIterations: 6,
    random: createSeededRandom(42),
  }).pack()

  const secondRun = new AdvancedBinPacker(trucks[1], items, 'genetic', {
    geneticIterations: 6,
    random: createSeededRandom(42),
  }).pack()

  assertEqual(simplifyResult(firstRun), simplifyResult(secondRun), 'Seeded genetic packing should stay deterministic for regression proof')
  assertEqual(firstRun.packed.length, 4, 'Seeded genetic packing should fit all boxes in the mixed fixture')
  logPass('genetic determinism fixture', 'produced stable seeded output and packed all boxes')
}

function runOversizedItemFixture(): void {
  // An item bigger than the truck in every dimension must remain unpacked
  const items: SaleOrderItem[] = [
    {
      id: 'giant',
      name: 'Giant Crate',
      length: 300, // 3 m — larger than mini truck (2 m)
      width: 200,
      height: 200,
      weight: 50,
      quantity: 1,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[0], items, 'extreme_points').pack()
  assertEqual(result.packed.length, 0, 'Oversized item should have 0 packed boxes in a mini truck')
  assertEqual(result.unpacked.length, 1, 'Oversized item should appear as 1 unpacked entry')
  assertEqual(result.unpacked[0], 'Giant Crate #1', 'Unpacked entry should match the oversized item name')
  logPass('oversized item fixture', 'giant crate correctly rejected from mini truck')
}

function runRotationBenefitFixture(): void {
  // A 50 x 200 x 50 cm plank cannot fit upright (200 cm > medium truck height 100 cm)
  // but can fit rotated flat (200 → length dimension, height 50 cm ≤ 100 cm truck height)
  const items: SaleOrderItem[] = [
    {
      id: 'plank',
      name: 'Plank',
      length: 50,
      width: 200,
      height: 50,
      weight: 30,
      quantity: 1,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[1], items, 'extreme_points').pack()
  assertEqual(result.packed.length, 1, 'Rotation benefit: plank fitting flat should be packed (1 of 1)')
  assertEqual(result.unpacked.length, 0, 'Rotation benefit: no items should be unpacked when rotation fits')
  logPass('rotation benefit fixture', 'plank packed via dimension rotation in medium truck')
}

function runWeightCapacityFilterFixture(): void {
  // Items whose combined weight is far above every truck's capacity
  // recommendTrucks guards: truck.capacity < totalWeight * 0.3  → excludes truck
  // For mini (capacity 250 kg): totalWeight = 3000 kg → 250 < 900 → excluded
  // For medium (600 kg): 600 < 900 → excluded
  // For large (900 kg): 900 < 900 → NOT excluded (equal, fails the strict-less-than)
  const heavyItems: SaleOrderItem[] = [
    {
      id: 'lead-block',
      name: 'Lead Block',
      length: 50,
      width: 50,
      height: 50,
      weight: 1000, // 1000 kg each × 3 = 3000 kg total
      quantity: 3,
      fragile: false,
      stackable: true,
    },
  ]

  const recs = recommendTrucks(heavyItems, 'extreme_points', trucks)
  // Mini (250 kg) and Medium (600 kg) should be filtered out (250 < 900, 600 < 900)
  const truckIds = recs.map(r => r.truck.id)
  assert(!truckIds.includes('mini'), 'Mini truck should be excluded when load weight far exceeds capacity')
  assert(!truckIds.includes('medium'), 'Medium truck should be excluded when load weight far exceeds capacity')
  logPass('weight capacity filter fixture', 'mini and medium excluded for overweight load')
}

function runVolumeUtilizationFixture(): void {
  // A single 1m×1m×1m cube in a 2×2×1 medium truck should give 25% volume utilisation
  const items: SaleOrderItem[] = [
    {
      id: 'unit-cube',
      name: 'Unit Cube',
      length: 100,
      width: 100,
      height: 100,
      weight: 10,
      quantity: 1,
      fragile: false,
      stackable: true,
    },
  ]

  const recs = recommendTrucks(items, 'extreme_points', trucks)
  const mediumRec = recs.find(r => r.truck.id === 'medium')
  assert(mediumRec !== undefined, 'Volume utilisation fixture: medium truck recommendation must exist')
  // Truck volume = 2 × 2 × 1 = 4 m³; one 1m³ cube = 25%
  assertEqual(mediumRec!.volumeUtilization, 25, 'Volume utilisation should be 25% for one 1m³ cube in a 4m³ truck')
  logPass('volume utilisation fixture', `medium truck reports ${mediumRec!.volumeUtilization}% for single 1m³ cube in 4m³ truck`)
}

function main(): void {
  runSkylineFixture()
  runSkylineBoundaryFixture()
  runExtremePointsFixture()
  runRecommendationFixture()
  runGeneticDeterminismFixture()
  runOversizedItemFixture()
  runRotationBenefitFixture()
  runWeightCapacityFilterFixture()
  runVolumeUtilizationFixture()
  console.log('Packing regression complete: 9 checks passed')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Packing regression failed: ${message}`)
  throw error
}
