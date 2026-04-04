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
  nameHi?: string
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

interface PackerOptions {
  geneticIterations?: number
  onProgress?: (progress: number) => void
  random?: () => number
}

export const PACKING_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']

export class AdvancedBinPacker {
  private truck: TruckType
  private items: SaleOrderItem[]
  private algorithm: string
  private options: PackerOptions

  constructor(truck: TruckType, items: SaleOrderItem[], algorithm: string, options: PackerOptions = {}) {
    this.truck = truck
    this.items = items
    this.algorithm = algorithm
    this.options = options
  }

  private cmToM(cm: number): number {
    return cm / 100
  }

  private getVolume(length: number, width: number, height: number): number {
    return length * width * height
  }

  private fitsAt(packed: PackedBox[], x: number, y: number, z: number, length: number, width: number, height: number): boolean {
    const truck = this.truck.dimensions

    if (x + length > truck.length || y + height > truck.height || z + width > truck.width) return false
    if (x < 0 || y < 0 || z < 0) return false

    for (const box of packed) {
      const overlapX = x < box.x + box.width && x + length > box.x
      const overlapY = y < box.y + box.height && y + height > box.y
      const overlapZ = z < box.z + box.depth && z + width > box.z

      if (overlapX && overlapY && overlapZ) return false
    }

    return true
  }

  private getRotations(length: number, width: number, height: number) {
    return [
      { l: length, w: width, h: height },
      { l: width, w: length, h: height },
      { l: length, w: height, h: width },
      { l: height, w: length, h: width },
      { l: width, w: height, h: length },
      { l: height, w: width, h: length },
    ]
  }

  private expandItems(): { item: SaleOrderItem; index: number }[] {
    const expandedItems: { item: SaleOrderItem; index: number }[] = []

    this.items.forEach(item => {
      for (let index = 0; index < item.quantity; index += 1) {
        expandedItems.push({ item, index })
      }
    })

    return expandedItems
  }

  private createPackedBox(item: SaleOrderItem, index: number, x: number, y: number, z: number, rotation: { l: number; w: number; h: number }): PackedBox {
    return {
      id: `${item.id}-${index}`,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.round(z * 100) / 100,
      width: rotation.l,
      height: rotation.h,
      depth: rotation.w,
      color: PACKING_COLORS[this.items.indexOf(item) % PACKING_COLORS.length],
      label: `${item.name.substring(0, 3)}${index + 1}`,
      itemId: item.id,
    }
  }

  private packSkylineBL(): PackingResult {
    const packed: PackedBox[] = []
    const unpacked: string[] = []
    const { length, width, height } = this.truck.dimensions
    const expandedItems = this.expandItems()

    expandedItems.sort((a, b) => {
      const volumeA = this.getVolume(a.item.length, a.item.width, a.item.height)
      const volumeB = this.getVolume(b.item.length, b.item.width, b.item.height)
      if (a.item.stackable !== b.item.stackable) return a.item.stackable ? 1 : -1
      return volumeB - volumeA
    })

    for (const { item, index } of expandedItems) {
      const itemLength = this.cmToM(item.length)
      const itemWidth = this.cmToM(item.width)
      const itemHeight = this.cmToM(item.height)
      const rotations = this.getRotations(itemLength, itemWidth, itemHeight)
      const step = 0.1
      let placed = false

      outerLoop:
      for (const rotation of rotations) {
        for (let y = 0; y <= height - rotation.h; y += step) {
          for (let z = 0; z <= width - rotation.w; z += step) {
            for (let x = 0; x <= length - rotation.l; x += step) {
              if (this.fitsAt(packed, x, y, z, rotation.l, rotation.w, rotation.h)) {
                packed.push(this.createPackedBox(item, index, x, y, z, rotation))
                placed = true
                break outerLoop
              }
            }
          }
        }
      }

      if (!placed) unpacked.push(`${item.name} #${index + 1}`)
    }

    return { packed, unpacked }
  }

  private packExtremePoints(): PackingResult {
    const packed: PackedBox[] = []
    const unpacked: string[] = []
    const { length, width, height } = this.truck.dimensions
    let extremePoints: { x: number; y: number; z: number }[] = [{ x: 0, y: 0, z: 0 }]
    const expandedItems = this.expandItems()

    expandedItems.sort((a, b) => {
      const volumeA = this.getVolume(a.item.length, a.item.width, a.item.height)
      const volumeB = this.getVolume(b.item.length, b.item.width, b.item.height)
      return volumeB - volumeA
    })

    for (const { item, index } of expandedItems) {
      const itemLength = this.cmToM(item.length)
      const itemWidth = this.cmToM(item.width)
      const itemHeight = this.cmToM(item.height)
      const rotations = this.getRotations(itemLength, itemWidth, itemHeight)
      let placed = false
      let bestPoint = { x: 0, y: 0, z: 0 }
      let bestRotation = { l: itemLength, w: itemWidth, h: itemHeight }
      let minWaste = Infinity

      for (const rotation of rotations) {
        for (const point of extremePoints) {
          if (this.fitsAt(packed, point.x, point.y, point.z, rotation.l, rotation.w, rotation.h)) {
            const waste = point.x * 1 + point.y * 2 + point.z * 1.5
            if (waste < minWaste) {
              minWaste = waste
              bestPoint = { ...point }
              bestRotation = { ...rotation }
              placed = true
            }
          }
        }
      }

      if (!placed) {
        unpacked.push(`${item.name} #${index + 1}`)
        continue
      }

      packed.push(this.createPackedBox(item, index, bestPoint.x, bestPoint.y, bestPoint.z, bestRotation))

      extremePoints = extremePoints.filter(point =>
        !(point.x === bestPoint.x && point.y === bestPoint.y && point.z === bestPoint.z),
      )

      const newPoints = [
        { x: bestPoint.x + bestRotation.l, y: bestPoint.y, z: bestPoint.z },
        { x: bestPoint.x, y: bestPoint.y + bestRotation.h, z: bestPoint.z },
        { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z + bestRotation.w },
      ]

      for (const point of newPoints) {
        if (point.x < length && point.y < height && point.z < width) {
          const exists = extremePoints.some(existing =>
            Math.abs(existing.x - point.x) < 0.01 &&
            Math.abs(existing.y - point.y) < 0.01 &&
            Math.abs(existing.z - point.z) < 0.01,
          )

          if (!exists) extremePoints.push(point)
        }
      }

      extremePoints.sort((a, b) => a.x + a.y * 2 + a.z * 1.5 - (b.x + b.y * 2 + b.z * 1.5))
    }

    return { packed, unpacked }
  }

  private packGenetic(): PackingResult {
    const iterations = this.options.geneticIterations ?? 12
    const random = this.options.random ?? Math.random
    let bestResult: PackingResult = { packed: [], unpacked: [] }
    let bestCount = 0

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const shuffledItems = [...this.items].sort(() => random() - 0.5)
      const tempPacker = new AdvancedBinPacker(this.truck, shuffledItems, 'extreme_points')
      const result = tempPacker.packExtremePoints()

      if (result.packed.length > bestCount) {
        bestCount = result.packed.length
        bestResult = result
      }

      this.options.onProgress?.(Math.round(((iteration + 1) / iterations) * 100))
    }

    return bestResult
  }

  pack(): PackingResult {
    switch (this.algorithm) {
      case 'genetic':
        return this.packGenetic()
      case 'extreme_points':
        return this.packExtremePoints()
      default:
        return this.packSkylineBL()
    }
  }
}

export function recommendTrucks(items: SaleOrderItem[], algorithm: string, trucks: TruckType[]): TruckRecommendation[] {
  const recommendations: TruckRecommendation[] = []
  const totalVolume = items.reduce((sum, item) => {
    return sum + (item.length * item.width * item.height * item.quantity) / 1000000
  }, 0)
  const totalWeight = items.reduce((sum, item) => sum + item.weight * item.quantity, 0)
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

  for (const truck of trucks) {
    const truckVolume = truck.dimensions.length * truck.dimensions.width * truck.dimensions.height

    if (truckVolume < totalVolume * 0.2 || truck.capacity < totalWeight * 0.3) continue

    const packer = new AdvancedBinPacker(truck, items, algorithm)
    const { packed, unpacked } = packer.pack()

    if (packed.length === 0) continue

    const packedVolume = packed.reduce((sum, box) => sum + box.width * box.height * box.depth, 0)
    const packedWeight = packed.reduce((sum, box) => {
      const item = items.find(candidate => candidate.id === box.itemId)
      return sum + (item?.weight ?? 0)
    }, 0)

    recommendations.push({
      truck,
      itemsFit: packed.length,
      totalItems,
      volumeUtilization: Math.round((packedVolume / truckVolume) * 100),
      weightUtilization: Math.round((packedWeight / truck.capacity) * 100),
      estimatedCost: truck.costPerKm * 100,
      packedBoxes: packed,
      unfitItems: unpacked,
    })
  }

  recommendations.sort((a, b) => {
    if (a.itemsFit === a.totalItems && b.itemsFit !== b.totalItems) return -1
    if (b.itemsFit === b.totalItems && a.itemsFit !== a.totalItems) return 1
    if (a.itemsFit !== b.itemsFit) return b.itemsFit - a.itemsFit

    if (Math.abs(a.volumeUtilization - b.volumeUtilization) > 10) {
      return b.volumeUtilization - a.volumeUtilization
    }

    return a.estimatedCost - b.estimatedCost
  })

  return recommendations.slice(0, 3)
}
