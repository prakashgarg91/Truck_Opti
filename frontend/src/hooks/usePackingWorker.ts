import { useRef, useCallback, useEffect, useState } from 'react'
import type { PackedBox, SaleOrderItem, TruckRecommendation, TruckType } from '../lib/packing'

interface PackingWorkerResult {
  packed: PackedBox[]
  unpacked: string[]
  duration: number
  algorithm: string
  processedOn: string
}

interface PackingWorkerRecommendationResult {
  recommendations: TruckRecommendation[]
  duration: number
  processedOn: string
}

interface UsePackingWorkerReturn {
  runPacking: (truck: TruckType, items: SaleOrderItem[], algorithm: string) => Promise<PackingWorkerResult>
  runRecommendation: (items: SaleOrderItem[], trucks: TruckType[], algorithm: string) => Promise<PackingWorkerRecommendationResult>
  progress: number
  isProcessing: boolean
  isSupported: boolean
  terminate: () => void
}

type PendingWorkerRequest =
  | {
    requestId: string
    requestType: 'pack'
    resolve: (value: PackingWorkerResult) => void
    reject: (error: Error) => void
  }
  | {
    requestId: string
    requestType: 'recommend'
    resolve: (value: PackingWorkerRecommendationResult) => void
    reject: (error: Error) => void
  }

interface PackingWorkerMessage {
  type: 'progress' | 'result' | 'recommendations' | 'error'
  requestId?: string
  progress?: number
  packed?: PackedBox[]
  unpacked?: string[]
  duration?: number
  algorithm?: string
  processedOn?: string
  recommendations?: TruckRecommendation[]
  error?: string
}

/**
 * Hook to run packing algorithms in a Web Worker (off main thread)
 * Falls back to main thread if Web Workers aren't supported
 * 
 * IMPORTANT: Always call terminate() when the component unmounts or
 * when you're done using the worker to prevent memory leaks.
 */
export function usePackingWorker(): UsePackingWorkerReturn {
  const workerRef = useRef<Worker | null>(null)
  const pendingRequestRef = useRef<PendingWorkerRequest | null>(null)
  const requestCounterRef = useRef(0)
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const isSupported = typeof Worker !== 'undefined'

  const handleWorkerMessage = useCallback((event: MessageEvent<PackingWorkerMessage>) => {
    const pendingRequest = pendingRequestRef.current
    const message = event.data

    if (!pendingRequest || message.requestId !== pendingRequest.requestId) {
      return
    }

    if (message.type === 'progress' && pendingRequest.requestType === 'pack') {
      setProgress(message.progress ?? 0)
      return
    }

    if (message.type === 'result' && pendingRequest.requestType === 'pack') {
      pendingRequestRef.current = null
      setIsProcessing(false)
      setProgress(100)
      pendingRequest.resolve({
        packed: message.packed ?? [],
        unpacked: message.unpacked ?? [],
        duration: message.duration ?? 0,
        algorithm: message.algorithm ?? 'extreme_points',
        processedOn: message.processedOn ?? 'client',
      })
      return
    }

    if (message.type === 'recommendations' && pendingRequest.requestType === 'recommend') {
      pendingRequestRef.current = null
      setIsProcessing(false)
      setProgress(100)
      pendingRequest.resolve({
        recommendations: message.recommendations ?? [],
        duration: message.duration ?? 0,
        processedOn: message.processedOn ?? 'client',
      })
      return
    }

    if (message.type === 'error') {
      pendingRequestRef.current = null
      setIsProcessing(false)
      setProgress(0)
      pendingRequest.reject(new Error(message.error ?? 'Packing worker request failed'))
    }
  }, [])

  const createWorker = useCallback(() => {
    if (!isSupported || workerRef.current) {
      return
    }

    const worker = new Worker(
      new URL('../workers/packingWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.addEventListener('message', handleWorkerMessage)
    workerRef.current = worker
  }, [handleWorkerMessage, isSupported])

  /**
   * Terminate the Web Worker to free up memory
   * Call this when the component unmounts or when done with packing operations
   */
  const terminate = useCallback(() => {
    const pendingRequest = pendingRequestRef.current
    pendingRequestRef.current = null

    if (pendingRequest) {
      pendingRequest.reject(new Error('Packing worker terminated'))
    }

    if (workerRef.current) {
      workerRef.current.removeEventListener('message', handleWorkerMessage)
      workerRef.current.terminate()
      workerRef.current = null
    }

    setIsProcessing(false)
    setProgress(0)
  }, [handleWorkerMessage])

  // Initialize worker on mount
  useEffect(() => {
    createWorker()

    // Cleanup: terminate worker on unmount
    return () => {
      terminate()
    }
  }, [createWorker, terminate])

  /**
   * Recreate the worker if it was terminated
   */
  const ensureWorker = useCallback(() => {
    createWorker()
  }, [createWorker])

  const runPacking = useCallback((truck: TruckType, items: SaleOrderItem[], algorithm: string): Promise<PackingWorkerResult> => {
    return new Promise((resolve, reject) => {
      ensureWorker()

      if (!workerRef.current) {
        reject(new Error('Web Worker not available'))
        return
      }

      if (pendingRequestRef.current) {
        reject(new Error('Packing worker is already processing another request'))
        return
      }

      requestCounterRef.current += 1
      const requestId = `pack-${requestCounterRef.current}`
      pendingRequestRef.current = { requestId, requestType: 'pack', resolve, reject }

      setIsProcessing(true)
      setProgress(0)

      workerRef.current.postMessage({ requestId, type: 'pack', truck, items, algorithm })
    })
  }, [ensureWorker])

  const runRecommendation = useCallback((items: SaleOrderItem[], trucks: TruckType[], algorithm: string): Promise<PackingWorkerRecommendationResult> => {
    return new Promise((resolve, reject) => {
      ensureWorker()

      if (!workerRef.current) {
        reject(new Error('Web Worker not available'))
        return
      }

      if (pendingRequestRef.current) {
        reject(new Error('Packing worker is already processing another request'))
        return
      }

      requestCounterRef.current += 1
      const requestId = `recommend-${requestCounterRef.current}`
      pendingRequestRef.current = { requestId, requestType: 'recommend', resolve, reject }

      setIsProcessing(true)
      setProgress(0)

      workerRef.current.postMessage({ requestId, type: 'recommend', items, trucks, algorithm })
    })
  }, [ensureWorker])

  return { runPacking, runRecommendation, progress, isProcessing, isSupported, terminate }
}
