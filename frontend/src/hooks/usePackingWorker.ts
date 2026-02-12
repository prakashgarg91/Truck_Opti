import { useRef, useCallback, useEffect, useState } from 'react'

interface PackingWorkerResult {
  packed: any[]
  unpacked: string[]
  duration: number
  algorithm: string
  processedOn: string
}

interface UsePackingWorkerReturn {
  runPacking: (truck: any, items: any[], algorithm: string) => Promise<PackingWorkerResult>
  runRecommendation: (items: any[], trucks: any[], algorithm: string) => Promise<any[]>
  progress: number
  isProcessing: boolean
  isSupported: boolean
}

/**
 * Hook to run packing algorithms in a Web Worker (off main thread)
 * Falls back to main thread if Web Workers aren't supported
 */
export function usePackingWorker(): UsePackingWorkerReturn {
  const workerRef = useRef<Worker | null>(null)
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const isSupported = typeof Worker !== 'undefined'

  useEffect(() => {
    if (isSupported) {
      workerRef.current = new Worker(
        new URL('../workers/packingWorker.ts', import.meta.url),
        { type: 'module' }
      )
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [isSupported])

  const runPacking = useCallback((truck: any, items: any[], algorithm: string): Promise<PackingWorkerResult> => {
    return new Promise((resolve, reject) => {
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
  }, [])

  const runRecommendation = useCallback((items: any[], trucks: any[], algorithm: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
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
  }, [])

  return { runPacking, runRecommendation, progress, isProcessing, isSupported }
}
