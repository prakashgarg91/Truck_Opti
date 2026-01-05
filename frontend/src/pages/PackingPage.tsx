import { useState } from 'react'
import { Package, Truck, Play, Settings, Layers, BarChart3, CheckCircle2 } from 'lucide-react'
import TruckViewer from '../components/TruckViewer'
import { useMutation } from '@tanstack/react-query'
import { optimizationApi } from '../services/api'
import toast from 'react-hot-toast'

export default function PackingPage() {
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [algorithm, setAlgorithm] = useState('skyline')
  const [isBenchmarkMode, setIsBenchmarkMode] = useState(false)
  const [selectedAlgorithms, setSelectedAlgorithms] = useState<string[]>(['skyline'])
  const [benchmarkResults, setBenchmarkResults] = useState<any>(null)
  
  const trucks = [
    { id: 'tata-ace', name: 'Tata Ace', dimensions: { length: 2.2, width: 1.5, height: 1.2 }, capacity: '750 kg' },
    { id: 'eicher-14', name: 'Eicher 14ft', dimensions: { length: 4.26, width: 1.8, height: 1.8 }, capacity: '4000 kg' },
    { id: 'bharat-32', name: 'BharatBenz 32ft', dimensions: { length: 9.45, width: 2.4, height: 2.15 }, capacity: '15000 kg' },
  ]
  
  const algorithms = [
    { id: 'skyline', name: 'Skyline BL', description: 'Fast, good for uniform boxes' },
    { id: 'genetic', name: 'Genetic', description: 'Best optimization, slower' },
    { id: 'extreme_points', name: 'Extreme Points', description: 'Balanced performance' },
  ]

  const currentTruck = trucks.find(t => t.id === selectedTruck)

  const benchmarkMutation = useMutation({
    mutationFn: (data: any) => optimizationApi.benchmark(data),
    onSuccess: (data) => {
      setBenchmarkResults(data.results)
      toast.success('Benchmark completed!')
    },
    onError: () => {
      toast.error('Benchmark failed')
    }
  })

  const packMutation = useMutation({
    mutationFn: (data: any) => optimizationApi.pack(data),
    onSuccess: (data) => {
      // Handle packed results, update 3D viewer
      toast.success('Packing optimized!')
    },
    onError: () => {
      toast.error('Optimization failed')
    }
  })

  const handleRunBenchmark = () => {
    if (!selectedTruck) return
    benchmarkMutation.mutate({
      truck_id: 1, // Mock ID
      cartons: [
        { carton_id: 1, quantity: 10 },
        { carton_id: 2, quantity: 5 }
      ],
      algorithms: selectedAlgorithms
    })
  }

  const handleStartOptimization = () => {
    if (!selectedTruck) return
    packMutation.mutate({
      truck_id: 1, // Mock ID
      cartons: [
        { carton_id: 1, quantity: 10 },
        { carton_id: 2, quantity: 5 }
      ],
      algorithm: algorithm as any
    })
  }

  const toggleAlgorithm = (id: string) => {
    if (isBenchmarkMode) {
      setSelectedAlgorithms(prev => 
        prev.includes(id) 
          ? prev.filter(a => a !== id) 
          : [...prev, id]
      )
    } else {
      setAlgorithm(id)
      setSelectedAlgorithms([id])
    }
  }
  
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            3D Bin Packing
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Optimize truck loading with AI algorithms
          </p>
        </div>
        <button
          onClick={() => setIsBenchmarkMode(!isBenchmarkMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            isBenchmarkMode 
              ? 'bg-saffron text-white shadow-lg shadow-saffron/20' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          {isBenchmarkMode ? 'Benchmark Mode ON' : 'Benchmark Mode'}
        </button>
      </div>
      
      {/* Truck Selection */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4" />
          Select Truck
        </h3>
        <div className="space-y-3">
          {trucks.map((truck) => (
            <button
              key={truck.id}
              onClick={() => setSelectedTruck(truck.id)}
              className={`card card-hover w-full p-4 text-left transition-all ${
                selectedTruck === truck.id 
                  ? 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20' 
                  : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white">
                    {truck.name}
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {truck.dimensions.length}×{truck.dimensions.width}×{truck.dimensions.height} m • {truck.capacity}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 ${
                  selectedTruck === truck.id 
                    ? 'bg-primary-500 border-primary-500' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {selectedTruck === truck.id && (
                    <CheckCircle2 className="w-full h-full text-white" />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Algorithm Selection */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          {isBenchmarkMode ? 'Select Algorithms to Compare' : 'Algorithm'}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {algorithms.map((algo) => (
            <button
              key={algo.id}
              onClick={() => toggleAlgorithm(algo.id)}
              className={`p-3 rounded-xl text-center transition-all border-2 ${
                (isBenchmarkMode ? selectedAlgorithms.includes(algo.id) : algorithm === algo.id)
                  ? 'bg-primary-600 border-primary-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400'
              }`}
            >
              <span className="text-sm font-medium">{algo.name}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Cartons Input */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Package className="w-4 h-4" />
          Cartons to Pack
        </h3>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-600 dark:text-slate-400">Total Items</span>
            <span className="font-semibold text-slate-900 dark:text-white">15 items</span>
          </div>
          <button className="btn btn-secondary w-full">
            <Package className="w-4 h-4" />
            Add Cartons
          </button>
        </div>
      </div>
      
      {/* 3D Preview */}
      <div className="card overflow-hidden">
        {selectedTruck ? (
          <TruckViewer 
            truckDimensions={currentTruck!.dimensions}
            packedBoxes={[]} // Will be populated after optimization
          />
        ) : (
          <div className="bg-slate-100 dark:bg-slate-700 h-64 flex items-center justify-center">
            <div className="text-center">
              <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                Select a truck to see 3D visualization
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Benchmark Results */}
      {isBenchmarkMode && benchmarkResults && (
        <div className="card p-4 animate-fade-in">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary-500" />
            Benchmark Results
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-2">Algorithm</th>
                  <th className="px-4 py-2">Utilization</th>
                  <th className="px-4 py-2">Time (ms)</th>
                  <th className="px-4 py-2">Packed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {Object.entries(benchmarkResults).map(([algo, result]: [string, any]) => (
                  <tr key={algo}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white capitalize">{algo}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500" 
                            style={{ width: `${result.utilization_percentage}%` }}
                          />
                        </div>
                        {result.utilization_percentage}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{result.execution_time_ms.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-500">{result.packed_items_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Action Button */}
      <button 
        disabled={!selectedTruck || (isBenchmarkMode && selectedAlgorithms.length === 0) || benchmarkMutation.isPending || packMutation.isPending}
        onClick={isBenchmarkMode ? handleRunBenchmark : handleStartOptimization}
        className={`btn w-full ${isBenchmarkMode ? 'btn-secondary' : 'btn-primary'}`}
      >
        {benchmarkMutation.isPending || packMutation.isPending ? (
          <div className="spinner w-5 h-5" />
        ) : isBenchmarkMode ? (
          <>
            <BarChart3 className="w-5 h-5" />
            Run Benchmark
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            Start Optimization
          </>
        )}
      </button>
    </div>
  )
}

