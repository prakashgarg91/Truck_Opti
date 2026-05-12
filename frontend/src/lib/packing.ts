export interface SaleOrderItem {
  id: string
  name: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  fragile: boolean
  stackable: boolean
}

export interface TruckType {
  id: string
  name: string
  dimensions: { length: number; width: number; height: number }
  capacity: number
  costPerKm: number
  available?: number
}

export interface PackedBox {
  id: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  color: string
  label: string
  itemId: string
}

export interface TruckRecommendation {
  truck: TruckType
  itemsFit: number
  totalItems: number
  volumeUtilization: number
  weightUtilization: number
  estimatedCost: number
  packedBoxes: PackedBox[]
  unfitItems: string[]
}

export interface PackingResult {
  packed: PackedBox[]
  unpacked: string[]
}

const POSITION_EPSILON = 1e-9

interface Rotation {
  l: number
  w: number
  h: number
}

interface ItemDimensions {
  length: number
  width: number
  height: number
}

interface ExpandedItem {
  item: SaleOrderItem
  index: number
}

interface SkylinePlacementCandidate {
  x: number
  y: number
  z: number
  rotation: Rotation
}

interface Point3D {
  x: number
  y: number
  z: number
}

interface ExtremePointPlacement {
  point: Point3D
  rotation: Rotation
}

interface ScoredExtremePointPlacement {
  placement: ExtremePointPlacement
  waste: number
}

interface ExtremePointPackingAttempt {
  packedBox: PackedBox | null
  nextExtremePoints: Point3D[]
  unpackedLabel?: string
}

interface PackerOptions {
  geneticIterations?: number
  onProgress?: (progress: number) => void
  random?: () => number
}

interface PackingRuntime {
  truck: TruckType
  items: SaleOrderItem[]
  itemColorIndex: Map<SaleOrderItem, number>
  options: PackerOptions
}

const itemRotationCache = new WeakMap<SaleOrderItem, Rotation[]>()

export const PACKING_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']

function cmToM(cm: number): number {
  return cm / 100
}

function getVolume(length: number, width: number, height: number): number {
  return length * width * height
}

function snapCoordinate(value: number): number {
  return Math.round(value * 100) / 100
}

function createAxisPositions(limit: number, step: number): number[] {
  if (limit < 0) return []

  const positions: number[] = []
  const stepCount = Math.floor(limit / step)

  for (let index = 0; index <= stepCount; index += 1) {
    positions.push(snapCoordinate(index * step))
  }

  const boundary = snapCoordinate(limit)
  if (positions.length === 0 || Math.abs(positions[positions.length - 1] - boundary) > POSITION_EPSILON) {
    positions.push(boundary)
  }

  return positions
}

function fitsAt(truck: TruckType, packed: PackedBox[], x: number, y: number, z: number, length: number, width: number, height: number): boolean {
  const dimensions = truck.dimensions

  if (
    x + length > dimensions.length + POSITION_EPSILON ||
    y + height > dimensions.height + POSITION_EPSILON ||
    z + width > dimensions.width + POSITION_EPSILON
  ) {
    return false
  }

  if (x < 0 || y < 0 || z < 0) return false

  for (const box of packed) {
    const overlapX = x < box.x + box.width - POSITION_EPSILON && x + length > box.x + POSITION_EPSILON
    const overlapY = y < box.y + box.height - POSITION_EPSILON && y + height > box.y + POSITION_EPSILON
    const overlapZ = z < box.z + box.depth - POSITION_EPSILON && z + width > box.z + POSITION_EPSILON

    if (overlapX && overlapY && overlapZ) return false
  }

  return true
}

function getRotations(length: number, width: number, height: number): Rotation[] {
  return [
    { l: length, w: width, h: height },
    { l: width, w: length, h: height },
    { l: length, w: height, h: width },
    { l: height, w: length, h: width },
    { l: width, w: height, h: length },
    { l: height, w: width, h: length },
  ]
}

function getItemDimensionsInMeters(item: SaleOrderItem): ItemDimensions {
  return {
    length: cmToM(item.length),
    width: cmToM(item.width),
    height: cmToM(item.height),
  }
}

function getRotationsForItemDimensions(dimensions: ItemDimensions): Rotation[] {
  return getRotations(dimensions.length, dimensions.width, dimensions.height)
}

function expandItems(items: SaleOrderItem[]): ExpandedItem[] {
  const expandedItems: ExpandedItem[] = []

  items.forEach(item => {
    for (let index = 0; index < item.quantity; index += 1) {
      expandedItems.push({ item, index })
    }
  })

  return expandedItems
}

function shuffleItems(items: SaleOrderItem[], random: () => number): SaleOrderItem[] {
  const shuffledItems = [...items]

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]]
  }

  return shuffledItems
}

function createItemColorIndex(items: SaleOrderItem[]): Map<SaleOrderItem, number> {
  return new Map(items.map((item, index) => [item, index]))
}

function createPackedBox(itemColorIndex: Map<SaleOrderItem, number>, item: SaleOrderItem, index: number, x: number, y: number, z: number, rotation: Rotation): PackedBox {
  const colorIndex = itemColorIndex.get(item) ?? 0

  return {
    id: `${item.id}-${index}`,
    x: snapCoordinate(x),
    y: snapCoordinate(y),
    z: snapCoordinate(z),
    width: rotation.l,
    height: rotation.h,
    depth: rotation.w,
    color: PACKING_COLORS[colorIndex % PACKING_COLORS.length],
    label: `${item.name.substring(0, 3)}${index + 1}`,
    itemId: item.id,
  }
}

function isBetterSkylineCandidate(candidate: SkylinePlacementCandidate, best: SkylinePlacementCandidate | null): boolean {
  if (!best) return true

  if (candidate.y < best.y - POSITION_EPSILON) return true
  if (candidate.y > best.y + POSITION_EPSILON) return false

  if (candidate.z < best.z - POSITION_EPSILON) return true
  if (candidate.z > best.z + POSITION_EPSILON) return false

  if (candidate.x < best.x - POSITION_EPSILON) return true
  if (candidate.x > best.x + POSITION_EPSILON) return false

  if (candidate.rotation.w > best.rotation.w + POSITION_EPSILON) return true
  if (candidate.rotation.w < best.rotation.w - POSITION_EPSILON) return false

  return candidate.rotation.l < best.rotation.l - POSITION_EPSILON
}

function getItemRotations(item: SaleOrderItem): Rotation[] {
  const cachedRotations = itemRotationCache.get(item)
  if (cachedRotations) {
    return cachedRotations
  }

  const rotations = getRotationsForItemDimensions(getItemDimensionsInMeters(item))
  itemRotationCache.set(item, rotations)
  return rotations
}

function sortSkylineItems(items: SaleOrderItem[]): ExpandedItem[] {
  const expandedItems = expandItems(items)

  expandedItems.sort((a, b) => {
    const volumeA = getVolume(a.item.length, a.item.width, a.item.height)
    const volumeB = getVolume(b.item.length, b.item.width, b.item.height)
    if (a.item.stackable !== b.item.stackable) return a.item.stackable ? 1 : -1
    return volumeB - volumeA
  })

  return expandedItems
}

function sortExtremePointItems(items: SaleOrderItem[]): ExpandedItem[] {
  const expandedItems = expandItems(items)

  expandedItems.sort((a, b) => {
    const volumeA = getVolume(a.item.length, a.item.width, a.item.height)
    const volumeB = getVolume(b.item.length, b.item.width, b.item.height)
    return volumeB - volumeA
  })

  return expandedItems
}

function findBestSkylinePlacementForRotation(
  truck: TruckType,
  packed: PackedBox[],
  rotation: Rotation,
  step: number,
): SkylinePlacementCandidate | null {
  const { length, width, height } = truck.dimensions
  const yPositions = createAxisPositions(height - rotation.h, step)
  const zPositions = createAxisPositions(width - rotation.w, step)
  const xPositions = createAxisPositions(length - rotation.l, step)
  let bestPlacement: SkylinePlacementCandidate | null = null

  for (const y of yPositions) {
    for (const z of zPositions) {
      for (const x of xPositions) {
        if (fitsAt(truck, packed, x, y, z, rotation.l, rotation.w, rotation.h)) {
          const candidate = { x, y, z, rotation }
          if (isBetterSkylineCandidate(candidate, bestPlacement)) {
            bestPlacement = candidate
          }
        }
      }
    }
  }

  return bestPlacement
}

function findBestSkylinePlacement(truck: TruckType, packed: PackedBox[], item: SaleOrderItem): SkylinePlacementCandidate | null {
  const rotations = getItemRotations(item)
  const step = 0.1
  let bestPlacement: SkylinePlacementCandidate | null = null

  for (const rotation of rotations) {
    const candidate = findBestSkylinePlacementForRotation(truck, packed, rotation, step)
    if (candidate && isBetterSkylineCandidate(candidate, bestPlacement)) {
      bestPlacement = candidate
    }
  }

  return bestPlacement
}

function calculatePointWaste(point: Point3D): number {
  return point.x * 1 + point.y * 2 + point.z * 1.5
}

function selectBetterExtremePointPlacement(
  bestPlacement: ScoredExtremePointPlacement | null,
  candidate: ScoredExtremePointPlacement,
): ScoredExtremePointPlacement {
  if (!bestPlacement || candidate.waste < bestPlacement.waste) {
    return candidate
  }

  return bestPlacement
}

function findBestExtremePointPlacementForRotation(
  truck: TruckType,
  packed: PackedBox[],
  extremePoints: Point3D[],
  rotation: Rotation,
): ScoredExtremePointPlacement | null {
  let bestPlacement: ScoredExtremePointPlacement | null = null

  for (const point of extremePoints) {
    if (fitsAt(truck, packed, point.x, point.y, point.z, rotation.l, rotation.w, rotation.h)) {
      bestPlacement = selectBetterExtremePointPlacement(bestPlacement, {
        placement: {
          point: { ...point },
          rotation: { ...rotation },
        },
        waste: calculatePointWaste(point),
      })
    }
  }

  return bestPlacement
}

function findBestExtremePointPlacement(
  truck: TruckType,
  packed: PackedBox[],
  extremePoints: Point3D[],
  item: SaleOrderItem,
): ExtremePointPlacement | null {
  const rotations = getItemRotations(item)
  let bestPlacement: ScoredExtremePointPlacement | null = null

  for (const rotation of rotations) {
    const candidate = findBestExtremePointPlacementForRotation(truck, packed, extremePoints, rotation)
    if (candidate) {
      bestPlacement = selectBetterExtremePointPlacement(bestPlacement, candidate)
    }
  }

  return bestPlacement?.placement ?? null
}

function pointExists(points: Point3D[], target: Point3D): boolean {
  return points.some(point =>
    Math.abs(point.x - target.x) < 0.01 &&
    Math.abs(point.y - target.y) < 0.01 &&
    Math.abs(point.z - target.z) < 0.01,
  )
}

function formatUnpackedItemLabel(item: SaleOrderItem, index: number): string {
  return `${item.name} #${index + 1}`
}

function createExtremePointPackingAttempt(
  itemColorIndex: Map<SaleOrderItem, number>,
  truck: TruckType,
  packed: PackedBox[],
  extremePoints: Point3D[],
  expandedItem: ExpandedItem,
): ExtremePointPackingAttempt {
  const bestPlacement = findBestExtremePointPlacement(truck, packed, extremePoints, expandedItem.item)

  if (!bestPlacement) {
    return {
      packedBox: null,
      nextExtremePoints: extremePoints,
      unpackedLabel: formatUnpackedItemLabel(expandedItem.item, expandedItem.index),
    }
  }

  return {
    packedBox: createPackedBox(
      itemColorIndex,
      expandedItem.item,
      expandedItem.index,
      bestPlacement.point.x,
      bestPlacement.point.y,
      bestPlacement.point.z,
      bestPlacement.rotation,
    ),
    nextExtremePoints: updateExtremePoints(truck, extremePoints, bestPlacement.point, bestPlacement.rotation),
  }
}

function updateExtremePoints(truck: TruckType, extremePoints: Point3D[], bestPoint: Point3D, bestRotation: Rotation): Point3D[] {
  const { length, width, height } = truck.dimensions
  const remainingPoints = extremePoints.filter(point =>
    !(point.x === bestPoint.x && point.y === bestPoint.y && point.z === bestPoint.z),
  )

  const newPoints = [
    { x: bestPoint.x + bestRotation.l, y: bestPoint.y, z: bestPoint.z },
    { x: bestPoint.x, y: bestPoint.y + bestRotation.h, z: bestPoint.z },
    { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z + bestRotation.w },
  ]

  for (const point of newPoints) {
    if (point.x < length && point.y < height && point.z < width && !pointExists(remainingPoints, point)) {
      remainingPoints.push(point)
    }
  }

  remainingPoints.sort((a, b) => calculatePointWaste(a) - calculatePointWaste(b))
  return remainingPoints
}

function createPackingRuntime(truck: TruckType, items: SaleOrderItem[], options: PackerOptions = {}): PackingRuntime {
  return { truck, items, itemColorIndex: createItemColorIndex(items), options }
}

function packExpandedItemsWithExtremePoints(runtime: PackingRuntime, expandedItems: ExpandedItem[]): PackingResult {
  const packed: PackedBox[] = []
  const unpacked: string[] = []
  let extremePoints: Point3D[] = [{ x: 0, y: 0, z: 0 }]

  for (const expandedItem of expandedItems) {
    const attempt = createExtremePointPackingAttempt(runtime.itemColorIndex, runtime.truck, packed, extremePoints, expandedItem)

    if (!attempt.packedBox) {
      unpacked.push(attempt.unpackedLabel ?? formatUnpackedItemLabel(expandedItem.item, expandedItem.index))
      continue
    }

    packed.push(attempt.packedBox)
    extremePoints = attempt.nextExtremePoints
  }

  return { packed, unpacked }
}

function executePackingStrategy(runtime: PackingRuntime, algorithm: string): PackingResult {
  switch (algorithm) {
    case 'genetic':
      return packGenetic(runtime)
    case 'extreme_points':
      return packExtremePoints(runtime)
    default:
      return packSkylineBL(runtime)
  }
}

function packSkylineBL(runtime: PackingRuntime): PackingResult {
  const packed: PackedBox[] = []
  const unpacked: string[] = []
  const expandedItems = sortSkylineItems(runtime.items)

  for (const { item, index } of expandedItems) {
    const bestPlacement = findBestSkylinePlacement(runtime.truck, packed, item)

    if (bestPlacement) {
      packed.push(createPackedBox(runtime.itemColorIndex, item, index, bestPlacement.x, bestPlacement.y, bestPlacement.z, bestPlacement.rotation))
    } else {
      unpacked.push(formatUnpackedItemLabel(item, index))
    }
  }

  return { packed, unpacked }
}

function packExtremePoints(runtime: PackingRuntime): PackingResult {
  return packExpandedItemsWithExtremePoints(runtime, sortExtremePointItems(runtime.items))
}

function packGenetic(runtime: PackingRuntime): PackingResult {
  const iterations = runtime.options.geneticIterations ?? 12
  const random = runtime.options.random ?? Math.random
  let bestResult: PackingResult = { packed: [], unpacked: [] }
  let bestCount = 0

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffledItems = shuffleItems(runtime.items, random)
    const shuffledExpandedItems = expandItems(shuffledItems)
    const result = packExpandedItemsWithExtremePoints({ ...runtime, items: shuffledItems }, shuffledExpandedItems)

    if (result.packed.length > bestCount) {
      bestCount = result.packed.length
      bestResult = result
    }

    runtime.options.onProgress?.(Math.round(((iteration + 1) / iterations) * 100))
  }

  return bestResult
}

function packItemsForTruck(truck: TruckType, items: SaleOrderItem[], algorithm: string, options: PackerOptions = {}): PackingResult {
  return executePackingStrategy(createPackingRuntime(truck, items, options), algorithm)
}

function countTotalItems(items: SaleOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

function calculatePackedVolume(packedBoxes: PackedBox[]): number {
  return packedBoxes.reduce((sum, box) => sum + box.width * box.height * box.depth, 0)
}

function calculatePackedWeight(items: SaleOrderItem[], packedBoxes: PackedBox[]): number {
  return packedBoxes.reduce((sum, box) => {
    const item = items.find(candidate => candidate.id === box.itemId)
    return sum + (item?.weight ?? 0)
  }, 0)
}

export function createTruckRecommendation(truck: TruckType, items: SaleOrderItem[], result: PackingResult): TruckRecommendation {
  const truckVolume = truck.dimensions.length * truck.dimensions.width * truck.dimensions.height
  const packedVolume = calculatePackedVolume(result.packed)
  const packedWeight = calculatePackedWeight(items, result.packed)

  return {
    truck,
    itemsFit: result.packed.length,
    totalItems: countTotalItems(items),
    volumeUtilization: truckVolume > 0 ? Math.round((packedVolume / truckVolume) * 100) : 0,
    weightUtilization: truck.capacity > 0 ? Math.round((packedWeight / truck.capacity) * 100) : 0,
    estimatedCost: truck.costPerKm * 100,
    packedBoxes: result.packed,
    unfitItems: result.unpacked,
  }
}

function calculateLoadTotals(items: SaleOrderItem[]): { totalVolume: number; totalWeight: number; totalItems: number } {
  return items.reduce(
    (totals, item) => ({
      totalVolume: totals.totalVolume + (item.length * item.width * item.height * item.quantity) / 1000000,
      totalWeight: totals.totalWeight + item.weight * item.quantity,
      totalItems: totals.totalItems + item.quantity,
    }),
    { totalVolume: 0, totalWeight: 0, totalItems: 0 },
  )
}

function shouldEvaluateTruck(truck: TruckType, totals: { totalVolume: number; totalWeight: number }): boolean {
  const truckVolume = truck.dimensions.length * truck.dimensions.width * truck.dimensions.height
  return !(truckVolume < totals.totalVolume * 0.2 || truck.capacity < totals.totalWeight * 0.3)
}

function buildTruckRecommendation(truck: TruckType, items: SaleOrderItem[], algorithm: string, totalItems: number): TruckRecommendation | null {
  const recommendation = createTruckRecommendation(truck, items, packItemsForTruck(truck, items, algorithm))
  if (recommendation.itemsFit === 0) return null
  return {
    ...recommendation,
    totalItems,
  }
}

function sortTruckRecommendations(a: TruckRecommendation, b: TruckRecommendation): number {
  if (a.itemsFit === a.totalItems && b.itemsFit !== b.totalItems) return -1
  if (b.itemsFit === b.totalItems && a.itemsFit !== a.totalItems) return 1
  if (a.itemsFit !== b.itemsFit) return b.itemsFit - a.itemsFit

  if (Math.abs(a.volumeUtilization - b.volumeUtilization) > 10) {
    return b.volumeUtilization - a.volumeUtilization
  }

  return a.estimatedCost - b.estimatedCost
}

export class AdvancedBinPacker {
  constructor(
    private truck: TruckType,
    private items: SaleOrderItem[],
    private algorithm: string,
    private options: PackerOptions = {},
  ) { }

  pack(): PackingResult {
    return packItemsForTruck(this.truck, this.items, this.algorithm, this.options)
  }
}

export function recommendTrucks(items: SaleOrderItem[], algorithm: string, trucks: TruckType[]): TruckRecommendation[] {
  const recommendations: TruckRecommendation[] = []
  const totals = calculateLoadTotals(items)

  for (const truck of trucks) {
    if (!shouldEvaluateTruck(truck, totals)) continue

    const recommendation = buildTruckRecommendation(truck, items, algorithm, totals.totalItems)
    if (recommendation) recommendations.push(recommendation)
  }

  recommendations.sort(sortTruckRecommendations)

  return recommendations.slice(0, 3)
}
