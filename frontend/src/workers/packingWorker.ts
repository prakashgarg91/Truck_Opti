/**
 * Web Worker for 3D Bin Packing Algorithm
 * Runs heavy computation off the main thread for smooth UI
 */

interface TruckType {
  id: string
  name: string
  dimensions: { length: number; width: number; height: number }
  capacity: number
  costPerKm: number
}

interface SaleOrderItem {
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

interface PackedBox {
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

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']

class PackingWorkerEngine {
  private truck: TruckType
  private items: SaleOrderItem[]
  private algorithm: string

  constructor(truck: TruckType, items: SaleOrderItem[], algorithm: string) {
    this.truck = truck
    this.items = items
    this.algorithm = algorithm
  }

  private cmToM(cm: number): number {
    return cm / 100
  }

  private getVolume(l: number, w: number, h: number): number {
    return l * w * h
  }

  private fitsAt(packed: PackedBox[], x: number, y: number, z: number, l: number, w: number, h: number): boolean {
    const { length, width, height } = this.truck.dimensions
    if (x + l > length || y + h > height || z + w > width) return false
    if (x < 0 || y < 0 || z < 0) return false

    for (const box of packed) {
      const overlapX = x < box.x + box.width && x + l > box.x
      const overlapY = y < box.y + box.height && y + h > box.y
      const overlapZ = z < box.z + box.depth && z + w > box.z
      if (overlapX && overlapY && overlapZ) return false
    }
    return true
  }

  private getRotations(l: number, w: number, h: number) {
    return [
      { l, w, h }, { l: w, w: l, h },
      { l, w: h, h: w }, { l: h, w: l, h: w },
      { l: w, w: h, h: l }, { l: h, w, h: l },
    ]
  }

  private expandItems(): { item: SaleOrderItem, index: number }[] {
    const expanded: { item: SaleOrderItem, index: number }[] = []
    this.items.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        expanded.push({ item, index: i })
      }
    })
    return expanded
  }

  private packSkylineBL(): { packed: PackedBox[], unpacked: string[] } {
    const packed: PackedBox[] = []
    const unpacked: string[] = []
    const { length, width, height } = this.truck.dimensions

    const expandedItems = this.expandItems()
    expandedItems.sort((a, b) => {
      const volA = this.getVolume(a.item.length, a.item.width, a.item.height)
      const volB = this.getVolume(b.item.length, b.item.width, b.item.height)
      if (a.item.stackable !== b.item.stackable) return a.item.stackable ? 1 : -1
      return volB - volA
    })

    for (const { item, index } of expandedItems) {
      const itemL = this.cmToM(item.length)
      const itemW = this.cmToM(item.width)
      const itemH = this.cmToM(item.height)
      let placed = false

      const rotations = this.getRotations(itemL, itemW, itemH)
      const step = 0.1

      outerLoop:
      for (const rot of rotations) {
        for (let y = 0; y <= height - rot.h; y += step) {
          for (let z = 0; z <= width - rot.w; z += step) {
            for (let x = 0; x <= length - rot.l; x += step) {
              if (this.fitsAt(packed, x, y, z, rot.l, rot.w, rot.h)) {
                packed.push({
                  id: `${item.id}-${index}`,
                  x: Math.round(x * 100) / 100,
                  y: Math.round(y * 100) / 100,
                  z: Math.round(z * 100) / 100,
                  width: rot.l, height: rot.h, depth: rot.w,
                  color: COLORS[this.items.indexOf(item) % COLORS.length],
                  label: `${item.name.substring(0, 3)}${index + 1}`,
                  itemId: item.id
                })
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

  private packExtremePoints(): { packed: PackedBox[], unpacked: string[] } {
    const packed: PackedBox[] = []
    const unpacked: string[] = []
    const { length, width, height } = this.truck.dimensions
    let extremePoints: { x: number, y: number, z: number }[] = [{ x: 0, y: 0, z: 0 }]

    const expandedItems = this.expandItems()
    expandedItems.sort((a, b) => {
      const volA = this.getVolume(a.item.length, a.item.width, a.item.height)
      const volB = this.getVolume(b.item.length, b.item.width, b.item.height)
      return volB - volA
    })

    for (const { item, index } of expandedItems) {
      const itemL = this.cmToM(item.length)
      const itemW = this.cmToM(item.width)
      const itemH = this.cmToM(item.height)
      let placed = false
      let bestPoint = { x: 0, y: 0, z: 0 }
      let bestRotation = { l: itemL, w: itemW, h: itemH }
      let minWaste = Infinity

      const rotations = this.getRotations(itemL, itemW, itemH)

      for (const rot of rotations) {
        for (const ep of extremePoints) {
          if (this.fitsAt(packed, ep.x, ep.y, ep.z, rot.l, rot.w, rot.h)) {
            const waste = ep.x * 1 + ep.y * 2 + ep.z * 1.5
            if (waste < minWaste) {
              minWaste = waste
              bestPoint = { ...ep }
              bestRotation = { ...rot }
              placed = true
            }
          }
        }
      }

      if (placed) {
        packed.push({
          id: `${item.id}-${index}`,
          x: bestPoint.x, y: bestPoint.y, z: bestPoint.z,
          width: bestRotation.l, height: bestRotation.h, depth: bestRotation.w,
          color: COLORS[this.items.indexOf(item) % COLORS.length],
          label: `${item.name.substring(0, 3)}${index + 1}`,
          itemId: item.id
        })

        extremePoints = extremePoints.filter(ep =>
          !(ep.x === bestPoint.x && ep.y === bestPoint.y && ep.z === bestPoint.z)
        )

        const newPoints = [
          { x: bestPoint.x + bestRotation.l, y: bestPoint.y, z: bestPoint.z },
          { x: bestPoint.x, y: bestPoint.y + bestRotation.h, z: bestPoint.z },
          { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z + bestRotation.w }
        ]

        for (const np of newPoints) {
          if (np.x < length && np.y < height && np.z < width) {
            const exists = extremePoints.some(ep =>
              Math.abs(ep.x - np.x) < 0.01 && Math.abs(ep.y - np.y) < 0.01 && Math.abs(ep.z - np.z) < 0.01
            )
            if (!exists) extremePoints.push(np)
          }
        }

        extremePoints.sort((a, b) => (a.x + a.y * 2 + a.z * 1.5) - (b.x + b.y * 2 + b.z * 1.5))
      } else {
        unpacked.push(`${item.name} #${index + 1}`)
      }
    }

    return { packed, unpacked }
  }

  private packGenetic(): { packed: PackedBox[], unpacked: string[] } {
    const iterations = 12 // More iterations since we're in a worker thread
    let bestResult = { packed: [] as PackedBox[], unpacked: [] as string[] }
    let bestCount = 0

    for (let i = 0; i < iterations; i++) {
      const shuffledItems = [...this.items].sort(() => Math.random() - 0.5)
      const tempPacker = new PackingWorkerEngine(this.truck, shuffledItems, 'extreme_points')
      const result = tempPacker.packExtremePoints()

      if (result.packed.length > bestCount) {
        bestCount = result.packed.length
        bestResult = result
      }

      // Report progress
      self.postMessage({
        type: 'progress',
        progress: Math.round(((i + 1) / iterations) * 100)
      })
    }

    return bestResult
  }

  public pack(): { packed: PackedBox[], unpacked: string[] } {
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

// Worker message handler
self.onmessage = (e: MessageEvent) => {
  const { truck, items, algorithm, type } = e.data

  if (type === 'pack') {
    try {
      const startTime = performance.now()
      const packer = new PackingWorkerEngine(truck, items, algorithm)
      const result = packer.pack()
      const duration = Math.round(performance.now() - startTime)

      self.postMessage({
        type: 'result',
        packed: result.packed,
        unpacked: result.unpacked,
        duration,
        algorithm,
        processedOn: 'client' // This runs on user's device
      })
    } catch (error: any) {
      self.postMessage({
        type: 'error',
        error: error.message || 'Packing failed'
      })
    }
  }

  if (type === 'recommend') {
    try {
      const { trucks } = e.data
      const recommendations = []

      const totalVolume = items.reduce((sum: number, item: SaleOrderItem) => {
        return sum + (item.length * item.width * item.height * item.quantity) / 1000000
      }, 0)

      const totalWeight = items.reduce((sum: number, item: SaleOrderItem) => {
        return sum + item.weight * item.quantity
      }, 0)

      for (const truck of trucks) {
        const packer = new PackingWorkerEngine(truck, items, algorithm || 'extreme_points')
        const result = packer.pack()

        const truckVolume = truck.dimensions.length * truck.dimensions.width * truck.dimensions.height
        const volumeUtil = truckVolume > 0 ? (totalVolume / truckVolume) * 100 : 0
        const weightUtil = truck.capacity > 0 ? (totalWeight / truck.capacity) * 100 : 0

        const totalItems = items.reduce((sum: number, item: SaleOrderItem) => sum + item.quantity, 0)

        recommendations.push({
          truck,
          volumeUtilization: Math.min(volumeUtil, 100),
          weightUtilization: Math.min(weightUtil, 100),
          itemsFit: result.packed.length,
          totalItems,
          costEstimate: truck.costPerKm * 500,
          score: Math.round(
            (result.packed.length / Math.max(totalItems, 1)) * 40 +
            Math.min(volumeUtil, 100) * 0.3 +
            (100 - Math.min(weightUtil, 100)) * 0.15 +
            (1 / Math.max(truck.costPerKm, 0.1)) * 15
          ),
          packed: result.packed,
          unpacked: result.unpacked,
        })
      }

      recommendations.sort((a, b) => b.score - a.score)

      self.postMessage({
        type: 'recommendations',
        recommendations,
        processedOn: 'client'
      })
    } catch (error: any) {
      self.postMessage({
        type: 'error',
        error: error.message || 'Recommendation failed'
      })
    }
  }
}
