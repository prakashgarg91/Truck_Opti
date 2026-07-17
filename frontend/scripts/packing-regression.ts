import { AdvancedBinPacker, createTruckRecommendation, recommendTrucks, type PackedBox, type PackingResult, type SaleOrderItem, type TruckRecommendation, type TruckType } from '../src/lib/packing.js'

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

function runSkylineMixedLoadFixture(): void {
  const items: SaleOrderItem[] = [
    {
      id: 'tall-panel',
      name: 'Tall Panel',
      length: 50,
      width: 150,
      height: 100,
      weight: 10,
      quantity: 1,
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
      quantity: 3,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[1], items, 'skyline').pack()
  assertEqual(result.packed.length, 4, 'Skyline should pack the mixed tall-panel and floor-beam load into the medium truck')
  assertEqual(result.unpacked.length, 0, 'Skyline should leave no unpacked items in the mixed-load fixture')

  const beamPlacements = result.packed.filter(box => box.itemId === 'floor-beam')
  assertEqual(beamPlacements.length, 3, 'Skyline should pack all three floor beams in the mixed-load fixture')
  assert(
    beamPlacements.some(box => box.depth === 2 && box.width === 0.5),
    'Skyline should rotate at least one floor beam to use the full truck depth in the mixed-load fixture',
  )

  logPass('skyline mixed-load fixture', 'packed the mixed tall-panel and floor-beam load without leaving a beam unpacked')
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

function runGeneticVariantSelectionFixture(): void {
  const items: SaleOrderItem[] = [
    {
      id: 'cube-pack',
      name: 'Cube Pack',
      length: 100,
      width: 100,
      height: 100,
      weight: 50,
      quantity: 2,
      fragile: false,
      stackable: true,
    },
    {
      id: 'beam-pack',
      name: 'Beam Pack',
      length: 200,
      width: 50,
      height: 50,
      weight: 10,
      quantity: 3,
      fragile: false,
      stackable: true,
    },
  ]

  const extremePointsRun = new AdvancedBinPacker(trucks[1], items, 'extreme_points').pack()
  const geneticRun = new AdvancedBinPacker(trucks[1], items, 'genetic', {
    geneticIterations: 1,
    random: createSeededRandom(1),
  }).pack()

  assertEqual(geneticRun.packed.length, 5, 'Genetic order-preservation fixture should still pack all boxes')
  assert(
    geneticRun.packed.length >= extremePointsRun.packed.length,
    'Genetic variant-selection fixture should not underperform plain extreme points',
  )

  logPass('genetic variant-selection fixture', 'selected a full-packing seeded variant without underperforming extreme points')
}

function runGeneticMixedLoadBenchmarkFixture(): void {
  const items: SaleOrderItem[] = [
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

  const extremePointsRun = new AdvancedBinPacker(trucks[1], items, 'extreme_points').pack()
  const geneticRun = new AdvancedBinPacker(trucks[1], items, 'genetic', {
    geneticIterations: 6,
    random: createSeededRandom(1),
  }).pack()

  assert(
    extremePointsRun.packed.length >= 6,
    'Genetic mixed-load benchmark should keep extreme points at or above its current 6-item floor on the medium truck',
  )
  assert(
    geneticRun.packed.length >= 8,
    'Genetic mixed-load benchmark should keep genetic packing at or above its current 8-item floor on the medium truck',
  )
  assert(
    geneticRun.packed.length >= extremePointsRun.packed.length,
    'Genetic mixed-load benchmark should not underperform extreme points on this mixed load',
  )

  logPass('genetic mixed-load benchmark', `extreme_points=${extremePointsRun.packed.length}, genetic=${geneticRun.packed.length} on the medium mixed-load benchmark`)
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

function runPackedWeightUtilizationFixture(): void {
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
  const recommendation = createTruckRecommendation(trucks[0], items, result)

  assertEqual(recommendation.itemsFit, 2, 'Packed weight utilisation fixture should pack only two dense cubes into the mini truck')
  assertEqual(recommendation.weightUtilization, 80, 'Weight utilisation should be based on packed cubes only, not the full requested load')
  logPass('packed weight utilisation fixture', `mini truck reports ${recommendation.weightUtilization}% for the two packed cubes only`)
}

function runFragmentedSpaceGapFixture(): void {
  // Gap: After placing two large items, small items should fit in remaining gaps
  // but current extreme_points may fail due to suboptimal placement ordering
  const items: SaleOrderItem[] = [
    {
      id: 'large-block',
      name: 'Large Block',
      length: 100,
      width: 100,
      height: 100,
      weight: 10,
      quantity: 2,
      fragile: false,
      stackable: true,
    },
    {
      id: 'small-filler',
      name: 'Small Filler',
      length: 50,
      width: 50,
      height: 50,
      weight: 5,
      quantity: 8,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[1], items, 'extreme_points').pack()
  assertEqual(result.packed.length, 10, 'Fragmented space gap fixture should pack all items (2 large + 8 small) into medium truck')
  assertEqual(result.unpacked.length, 0, 'Fragmented space gap fixture should leave no unpacked items')
  logPass('fragmented space gap fixture', 'packed all 10 items by utilizing fragmented space efficiently')
}

function runLayerOptimizationGapFixture(): void {
  // Gap: Flat items should maximize layer utilization but current algorithm
  // may not prioritize height-minimizing rotations properly
  const items: SaleOrderItem[] = [
    {
      id: 'flat-panel',
      name: 'Flat Panel',
      length: 200,
      width: 100,
      height: 25,
      weight: 10,
      quantity: 4,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[1], items, 'extreme_points').pack()
  assertEqual(result.packed.length, 4, 'Layer optimization gap fixture should pack all 4 flat panels into medium truck')
  assertEqual(result.unpacked.length, 0, 'Layer optimization gap fixture should leave no unpacked items')
  const placements = result.packed.filter(box => box.itemId === 'flat-panel')
  const maxLayerHeight = Math.max(...placements.map(box => box.y + box.height))
  assert(
    maxLayerHeight <= 0.6,
    `Layer optimization gap fixture should stack panels efficiently (max height ${maxLayerHeight}m should be ≤ 0.6m for 4 layers of 0.25m panels)`,
  )
  logPass('layer optimization gap fixture', 'packed all 4 flat panels with efficient layer stacking')
}

function runComplexMixedLoadGapFixture(): void {
  // Gap: Complex load with varying dimensions should achieve higher utilization
  // than current 6/10 (extreme_points) baseline
  const items: SaleOrderItem[] = [
    {
      id: 'tiny-cube',
      name: 'Tiny Cube',
      length: 25,
      width: 25,
      height: 25,
      weight: 2,
      quantity: 16,
      fragile: false,
      stackable: true,
    },
    {
      id: 'medium-box',
      name: 'Medium Box',
      length: 75,
      width: 75,
      height: 75,
      weight: 8,
      quantity: 4,
      fragile: false,
      stackable: true,
    },
    {
      id: 'large-rect',
      name: 'Large Rect',
      length: 150,
      width: 100,
      height: 50,
      weight: 15,
      quantity: 2,
      fragile: false,
      stackable: true,
    },
  ]

  const extremePointsResult = new AdvancedBinPacker(trucks[1], items, 'extreme_points').pack()
  const geneticResult = new AdvancedBinPacker(trucks[1], items, 'genetic', {
    geneticIterations: 8,
    random: createSeededRandom(123),
  }).pack()

  assert(
    extremePointsResult.packed.length >= 18,
    `Complex mixed-load gap fixture: extreme_points should pack at least 18 of 22 items (currently ${extremePointsResult.packed.length})`,
  )
  assert(
    geneticResult.packed.length >= 20,
    `Complex mixed-load gap fixture: genetic should pack at least 20 of 22 items (currently ${geneticResult.packed.length})`,
  )
  assert(
    geneticResult.packed.length >= extremePointsResult.packed.length,
    'Complex mixed-load gap fixture: genetic should not underperform extreme_points',
  )
  logPass('complex mixed-load gap fixture', `extreme_points=${extremePointsResult.packed.length}/22, genetic=${geneticResult.packed.length}/22`)
}

function runSmallItemFillingGapFixture(): void {
  // Gap: Many small items should fill gaps around larger items better
  const items: SaleOrderItem[] = [
    {
      id: 'big-cube',
      name: 'Big Cube',
      length: 150,
      width: 150,
      height: 100,
      weight: 20,
      quantity: 1,
      fragile: false,
      stackable: true,
    },
    {
      id: 'mini-cube',
      name: 'Mini Cube',
      length: 25,
      width: 25,
      height: 25,
      weight: 1,
      quantity: 32,
      fragile: false,
      stackable: true,
    },
  ]

  const result = new AdvancedBinPacker(trucks[2], items, 'extreme_points').pack()
  const packedMiniCubes = result.packed.filter(box => box.itemId === 'mini-cube').length
  assert(
    packedMiniCubes >= 24,
    `Small item filling gap fixture should pack at least 24 of 32 mini cubes around the big cube (currently ${packedMiniCubes})`,
  )
  assert(
    result.packed.length >= 25,
    `Small item filling gap fixture should pack at least 25 total items (1 big + 24 mini) (currently ${result.packed.length})`,
  )
  logPass('small item filling gap fixture', `packed ${packedMiniCubes}/32 mini cubes around the big cube`)
}

function main(): void {
  runSkylineFixture()
  runSkylineBoundaryFixture()
  runSkylineMixedLoadFixture()
  runExtremePointsFixture()
  runRecommendationFixture()
  runGeneticDeterminismFixture()
  runGeneticVariantSelectionFixture()
  runGeneticMixedLoadBenchmarkFixture()
  runOversizedItemFixture()
  runRotationBenefitFixture()
  runWeightCapacityFilterFixture()
  runVolumeUtilizationFixture()
  runPackedWeightUtilizationFixture()
  runFragmentedSpaceGapFixture()
  runLayerOptimizationGapFixture()
  runComplexMixedLoadGapFixture()
  runSmallItemFillingGapFixture()
  console.log('Packing regression complete: 18 checks passed')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Packing regression failed: ${message}`)
  throw error
}
