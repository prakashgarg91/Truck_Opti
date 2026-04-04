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

function main(): void {
  runSkylineFixture()
  runExtremePointsFixture()
  runRecommendationFixture()
  runGeneticDeterminismFixture()
  console.log('Packing regression complete: 4 checks passed')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Packing regression failed: ${message}`)
  throw error
}