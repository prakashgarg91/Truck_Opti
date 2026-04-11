/**
 * Web Worker for 3D Bin Packing Algorithm
 * Runs heavy computation off the main thread for smooth UI
 */

import { AdvancedBinPacker, recommendTrucks, type SaleOrderItem, type TruckType } from '../lib/packing'

self.onmessage = (e: MessageEvent) => {
  const { truck, items, algorithm, type } = e.data

  if (type === 'pack') {
    try {
      const startTime = performance.now()
      const packer = new AdvancedBinPacker(truck as TruckType, items as SaleOrderItem[], algorithm, {
        onProgress: (progress) => {
          self.postMessage({
            type: 'progress',
            progress,
          })
        },
      })
      const result = packer.pack()
      const duration = Math.round(performance.now() - startTime)

      self.postMessage({
        type: 'result',
        packed: result.packed,
        unpacked: result.unpacked,
        duration,
        algorithm,
        processedOn: 'client',
      })
    } catch (error: any) {
      self.postMessage({
        type: 'error',
        error: 'Packing failed',
      })
    }
  }

  if (type === 'recommend') {
    try {
      const recommendations = recommendTrucks(items as SaleOrderItem[], algorithm || 'extreme_points', e.data.trucks as TruckType[])

      self.postMessage({
        type: 'recommendations',
        recommendations,
        processedOn: 'client',
      })
    } catch (error: any) {
      self.postMessage({
        type: 'error',
        error: 'Recommendation failed',
      })
    }
  }
}
