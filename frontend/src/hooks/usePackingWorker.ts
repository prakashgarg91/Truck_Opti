import { useRef, useCallback, useEffect, useState } from 'react'
import type { PackedBox, SaleOrderItem, TruckRecommendation, TruckType } from '../lib/packing'

interface PackingWorkerResult {
  packed: PackedBox[]
  unpacked: string[]
  duration: number
  algorithm: string
  processedOn: string
}

interface UsePackingWorkerReturn {
  runPacking: (truck: TruckType, items: SaleOrderItem[], algorithm: string) => Promise<PackingWorkerResult>
  runRecommendation: (items: SaleOrderItem[], trucks: TruckType[], algorithm: string) => Promise<TruckRecommendation[]>
  progress: number
  isProcessing: boolean
  isSupported: boolean
  terminate: () => void
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
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const isSupported = typeof Worker !== 'undefined'

  // Initialize worker on mount
  useEffect(() => {
    if (isSupported && !workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/packingWorker.ts', import.meta.url),
        { type: 'module' }
      )
    }

    // Cleanup: terminate worker on unmount
    return () => {
      terminate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported])

  /**
   * Terminate the Web Worker to free up memory
   * Call this when the component unmounts or when done with packing operations
   */
  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    setIsProcessing(false)
    setProgress(0)
  }, [])

  /**
   * Recreate the worker if it was terminated
   */
  const ensureWorker = useCallback(() => {
    if (isSupported && !workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/packingWorker.ts', import.meta.url),
        { type: 'module' }
      )
    }
  }, [isSupported])

  const runPacking = useCallback((truck: TruckType, items: SaleOrderItem[], algorithm: string): Promise<PackingWorkerResult> => {
    return new Promise((resolve, reject) => {
      ensureWorker()
      
      if (!workerRef.current) {
        reject(new Error('Web Worker not available'))
        return
      }

      setIsProcessing(true)
      setProgress(0)

      const handler = (e: MessageEvent) => {
        if (e.data.type === 'progress') {
          setProgress(e.data.progress)
        } else if (e.data.type === 'result') {
          setIsProcessing(false)
          setProgress(100)
          workerRef.current?.removeEventListener('message', handler)
          resolve(e.data)
        } else if (e.data.type === 'error') {
          setIsProcessing(false)
          workerRef.current?.removeEventListener('message', handler)
          reject(new Error(e.data.error))
        }
      }

      workerRef.current.addEventListener('message', handler)
      workerRef.current.postMessage({ type: 'pack', truck, items, algorithm })
    })
  }, [ensureWorker])

  const runRecommendation = useCallback((items: SaleOrderItem[], trucks: TruckType[], algorithm: string): Promise<TruckRecommendation[]> => {
    return new Promise((resolve, reject) => {
      ensureWorker()
      
      if (!workerRef.current) {
        reject(new Error('Web Worker not available'))
        return
      }

      setIsProcessing(true)
      setProgress(0)

      const handler = (e: MessageEvent) => {
        if (e.data.type === 'recommendations') {
          setIsProcessing(false)
          setProgress(100)
          workerRef.current?.removeEventListener('message', handler)
          resolve(e.data.recommendations)
        } else if (e.data.type === 'error') {
          setIsProcessing(false)
          workerRef.current?.removeEventListener('message', handler)
          reject(new Error(e.data.error))
        }
      }

      workerRef.current.addEventListener('message', handler)
      workerRef.current.postMessage({ type: 'recommend', items, trucks, algorithm })
    })
  }, [ensureWorker])

  return { runPacking, runRecommendation, progress, isProcessing, isSupported, terminate }
}
