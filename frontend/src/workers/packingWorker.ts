/**
 * Web Worker for 3D Bin Packing Algorithm
 * Runs heavy computation off the main thread for smooth UI
 */

import { AdvancedBinPacker, recommendTrucks, type SaleOrderItem, type TruckType } from '../lib/packing'

self.onmessage = (e: MessageEvent) => {
  const { requestId, truck, items, algorithm, type, trucks } = e.data

  if (type === 'pack') {
    try {
      const startTime = performance.now()
      const packer = new AdvancedBinPacker(truck as TruckType, items as SaleOrderItem[], algorithm, {
        onProgress: (progress) => {
          self.postMessage({
            requestId,
            type: 'progress',
            progress,
          })
        },
      })
      const result = packer.pack()
      const duration = Math.round(performance.now() - startTime)

      self.postMessage({
        requestId,
        type: 'result',
        packed: result.packed,
        unpacked: result.unpacked,
        duration,
        algorithm,
        processedOn: 'client',
      })
    } catch (_error: unknown) {
      self.postMessage({
        requestId,
        type: 'error',
        error: 'Packing failed',
      })
    }
  }

  if (type === 'recommend') {
    try {
      const startTime = performance.now()
      const recommendations = recommendTrucks(items as SaleOrderItem[], algorithm || 'extreme_points', trucks as TruckType[])
      const duration = Math.round(performance.now() - startTime)

      self.postMessage({
        requestId,
        type: 'recommendations',
        recommendations,
        duration,
        processedOn: 'client',
      })
    } catch (_error: unknown) {
      self.postMessage({
        requestId,
        type: 'error',
        error: 'Recommendation failed',
      })
    }
  }
}
