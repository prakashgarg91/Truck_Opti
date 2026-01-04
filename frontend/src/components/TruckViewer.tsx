import { useRef, useEffect, useState } from 'react'
import { Maximize2, RotateCcw, ZoomIn, ZoomOut, Move3d } from 'lucide-react'

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
}

interface TruckViewerProps {
  truckDimensions: {
    length: number
    width: number
    height: number
  }
  packedBoxes?: PackedBox[]
  onBoxClick?: (box: PackedBox) => void
}

// Simple 3D-like isometric view without Three.js for initial implementation
export default function TruckViewer({ truckDimensions, packedBoxes = [], onBoxClick }: TruckViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rotation, setRotation] = useState({ x: -30, y: 45 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  const scale = 50 * zoom // pixels per meter
  
  // Convert 3D to 2D isometric projection
  const project = (x: number, y: number, z: number) => {
    const rad = (deg: number) => deg * Math.PI / 180
    const cosX = Math.cos(rad(rotation.x))
    const sinX = Math.sin(rad(rotation.x))
    const cosY = Math.cos(rad(rotation.y))
    const sinY = Math.sin(rad(rotation.y))
    
    // Apply rotation
    const x1 = x * cosY - z * sinY
    const z1 = x * sinY + z * cosY
    const y1 = y * cosX - z1 * sinX
    
    // Isometric projection
    return {
      x: x1 * scale + 200,
      y: -y1 * scale + 250
    }
  }
  
  // Handle mouse drag for rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const deltaX = e.clientX - dragStart.x
    const deltaY = e.clientY - dragStart.y
    setRotation(prev => ({
      x: Math.max(-90, Math.min(0, prev.x + deltaY * 0.5)),
      y: prev.y + deltaX * 0.5
    }))
    setDragStart({ x: e.clientX, y: e.clientY })
  }
  
  const handleMouseUp = () => setIsDragging(false)
  
  // Draw truck outline
  const drawTruck = () => {
    const { length, width, height } = truckDimensions
    const vertices = [
      [0, 0, 0], [length, 0, 0], [length, 0, width], [0, 0, width], // bottom
      [0, height, 0], [length, height, 0], [length, height, width], [0, height, width], // top
    ]
    const projected = vertices.map(v => project(v[0], v[1], v[2]))
    
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // bottom
      [4, 5], [5, 6], [6, 7], [7, 4], // top
      [0, 4], [1, 5], [2, 6], [3, 7], // verticals
    ]
    
    return edges.map((edge, i) => (
      <line
        key={`edge-${i}`}
        x1={projected[edge[0]].x}
        y1={projected[edge[0]].y}
        x2={projected[edge[1]].x}
        y2={projected[edge[1]].y}
        stroke="#94a3b8"
        strokeWidth="2"
        strokeDasharray="5,5"
      />
    ))
  }
  
  // Draw packed boxes
  const drawBoxes = () => {
    return packedBoxes.map((box, idx) => {
      const corners = [
        [box.x, box.y, box.z],
        [box.x + box.width, box.y, box.z],
        [box.x + box.width, box.y, box.z + box.depth],
        [box.x, box.y, box.z + box.depth],
        [box.x, box.y + box.height, box.z],
        [box.x + box.width, box.y + box.height, box.z],
        [box.x + box.width, box.y + box.height, box.z + box.depth],
        [box.x, box.y + box.height, box.z + box.depth],
      ]
      const p = corners.map(c => project(c[0], c[1], c[2]))
      
      // Draw faces (simplified - just top and two visible sides)
      const topFace = `M${p[4].x},${p[4].y} L${p[5].x},${p[5].y} L${p[6].x},${p[6].y} L${p[7].x},${p[7].y} Z`
      const frontFace = `M${p[0].x},${p[0].y} L${p[1].x},${p[1].y} L${p[5].x},${p[5].y} L${p[4].x},${p[4].y} Z`
      const sideFace = `M${p[1].x},${p[1].y} L${p[2].x},${p[2].y} L${p[6].x},${p[6].y} L${p[5].x},${p[5].y} Z`
      
      const center = project(
        box.x + box.width/2,
        box.y + box.height/2,
        box.z + box.depth/2
      )
      
      return (
        <g 
          key={`box-${idx}`} 
          onClick={() => onBoxClick?.(box)}
          className="cursor-pointer hover:opacity-80 transition-opacity"
        >
          <path d={frontFace} fill={box.color} opacity="0.8" stroke="#333" strokeWidth="1" />
          <path d={sideFace} fill={box.color} opacity="0.6" stroke="#333" strokeWidth="1" />
          <path d={topFace} fill={box.color} opacity="0.9" stroke="#333" strokeWidth="1" />
          <text
            x={center.x}
            y={center.y}
            textAnchor="middle"
            fontSize="10"
            fill="white"
            fontWeight="bold"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
          >
            {box.label}
          </text>
        </g>
      )
    })
  }
  
  // Sample boxes for demo
  const sampleBoxes: PackedBox[] = [
    { id: '1', x: 0, y: 0, z: 0, width: 1, height: 0.8, depth: 0.8, color: '#3b82f6', label: 'A1' },
    { id: '2', x: 1.1, y: 0, z: 0, width: 1.2, height: 1, depth: 0.9, color: '#22c55e', label: 'A2' },
    { id: '3', x: 0, y: 0, z: 0.9, width: 0.8, height: 0.6, depth: 0.7, color: '#f59e0b', label: 'B1' },
    { id: '4', x: 0, y: 0.85, z: 0, width: 1, height: 0.5, depth: 0.8, color: '#ef4444', label: 'C1' },
  ]
  
  const displayBoxes = packedBoxes.length > 0 ? packedBoxes : sampleBoxes
  
  return (
    <div className="relative bg-slate-900 rounded-lg overflow-hidden">
      {/* Controls */}
      <div className="absolute top-3 right-3 flex gap-2 z-10">
        <button 
          onClick={() => setZoom(z => Math.min(2, z + 0.2))}
          className="w-8 h-8 bg-white/10 backdrop-blur rounded flex items-center justify-center text-white hover:bg-white/20"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
          className="w-8 h-8 bg-white/10 backdrop-blur rounded flex items-center justify-center text-white hover:bg-white/20"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button 
          onClick={() => { setRotation({ x: -30, y: 45 }); setZoom(1) }}
          className="w-8 h-8 bg-white/10 backdrop-blur rounded flex items-center justify-center text-white hover:bg-white/20"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 bg-white/10 backdrop-blur rounded flex items-center justify-center text-white hover:bg-white/20">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/10 backdrop-blur rounded p-2 text-xs text-white z-10">
        <div className="flex items-center gap-2 mb-1">
          <Move3d className="w-4 h-4" />
          <span>Drag to rotate</span>
        </div>
        <div className="text-slate-400">
          {truckDimensions.length}m × {truckDimensions.width}m × {truckDimensions.height}m
        </div>
      </div>
      
      {/* Stats */}
      <div className="absolute top-3 left-3 bg-white/10 backdrop-blur rounded p-2 z-10">
        <div className="text-xs text-white space-y-1">
          <p><span className="text-slate-400">Boxes:</span> {displayBoxes.length}</p>
          <p><span className="text-slate-400">Utilization:</span> 78%</p>
        </div>
      </div>
      
      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className="h-64 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg width="100%" height="100%" viewBox="0 0 400 300">
          {/* Grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="#0f172a" />
          <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3" />
          
          {/* Truck outline */}
          {drawTruck()}
          
          {/* Packed boxes */}
          {drawBoxes()}
        </svg>
      </div>
    </div>
  )
}
