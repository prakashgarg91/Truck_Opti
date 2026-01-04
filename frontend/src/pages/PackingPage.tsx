import { useState } from 'react'
import { Package, Truck, Play, Settings, Layers } from 'lucide-react'

export default function PackingPage() {
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [algorithm, setAlgorithm] = useState('skyline')
  
  const trucks = [
    { id: 'tata-ace', name: 'Tata Ace', dimensions: '220×150×120 cm', capacity: '750 kg' },
    { id: 'eicher-14', name: 'Eicher 14ft', dimensions: '426×180×180 cm', capacity: '4000 kg' },
    { id: 'bharat-32', name: 'BharatBenz 32ft', dimensions: '945×240×215 cm', capacity: '15000 kg' },
  ]
  
  const algorithms = [
    { id: 'skyline', name: 'Skyline BL', description: 'Fast, good for uniform boxes' },
    { id: 'genetic', name: 'Genetic', description: 'Best optimization, slower' },
    { id: 'extreme', name: 'Extreme Points', description: 'Balanced performance' },
  ]
  
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          3D Bin Packing
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Optimize truck loading with AI algorithms
        </p>
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
                    {truck.dimensions} • {truck.capacity}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 ${
                  selectedTruck === truck.id 
                    ? 'bg-primary-500 border-primary-500' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {selectedTruck === truck.id && (
                    <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
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
          Algorithm
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {algorithms.map((algo) => (
            <button
              key={algo.id}
              onClick={() => setAlgorithm(algo.id)}
              className={`p-3 rounded-xl text-center transition-all ${
                algorithm === algo.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
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
            <span className="font-semibold text-slate-900 dark:text-white">0 items</span>
          </div>
          <button className="btn btn-secondary w-full">
            <Package className="w-4 h-4" />
            Add Cartons
          </button>
        </div>
      </div>
      
      {/* 3D Preview Placeholder */}
      <div className="card overflow-hidden">
        <div className="bg-slate-100 dark:bg-slate-700 h-64 flex items-center justify-center">
          <div className="text-center">
            <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              3D visualization will appear here
            </p>
          </div>
        </div>
      </div>
      
      {/* Optimize Button */}
      <button 
        disabled={!selectedTruck}
        className="btn btn-primary w-full"
      >
        <Play className="w-5 h-5" />
        Start Optimization
      </button>
    </div>
  )
}
