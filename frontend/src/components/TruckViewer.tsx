import { useRef, Suspense, useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { RotateCcw, Move3d, Eye, Layers } from 'lucide-react'

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
  itemId?: string
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

function Box({ box, onBoxClick, isHovered, onHover }: { 
  box: PackedBox; 
  onBoxClick?: (box: PackedBox) => void
  isHovered: boolean
  onHover: (id: string | null) => void 
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  
  // Memoize geometries to prevent recreation on each render
  const boxGeometry = useMemo(() => {
    const geom = new THREE.BoxGeometry(box.width * 0.98, box.height * 0.98, box.depth * 0.98)
    return geom
  }, [box.width, box.height, box.depth])
  
  const edgesGeometry = useMemo(() => {
    const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(box.width * 0.98, box.height * 0.98, box.depth * 0.98))
    return geom
  }, [box.width, box.height, box.depth])
  
  // Memoize materials
  const boxMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: box.color,
      opacity: isHovered ? 1 : 0.85,
      transparent: true,
      roughness: 0.3,
      metalness: 0.1
    })
  }, [box.color, isHovered])
  
  const edgesMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: isHovered ? '#ffffff' : '#000000',
      opacity: 0.3,
      transparent: true
    })
  }, [isHovered])
  
  // Cleanup geometries and materials on unmount or when dependencies change
  useEffect(() => {
    return () => {
      boxGeometry.dispose()
      edgesGeometry.dispose()
      boxMaterial.dispose()
      edgesMaterial.dispose()
    }
  }, [boxGeometry, edgesGeometry, boxMaterial, edgesMaterial])
  
  return (
    <group>
      <mesh
        ref={meshRef}
        position={[
          box.x + box.width / 2,
          box.y + box.height / 2,
          box.z + box.depth / 2
        ]}
        onClick={(e) => {
          e.stopPropagation()
          onBoxClick?.(box)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          onHover(box.id)
        }}
        onPointerOut={() => onHover(null)}
        geometry={boxGeometry}
        material={boxMaterial}
      />
      {/* Box edges for better visibility */}
      <lineSegments
        position={[
          box.x + box.width / 2,
          box.y + box.height / 2,
          box.z + box.depth / 2
        ]}
        geometry={edgesGeometry}
        material={edgesMaterial}
      />
    </group>
  )
}

function TruckContainer({ dimensions }: { dimensions: { length: number; width: number; height: number } }) {
  // Memoize geometries
  const wireframeGeometry = useMemo(() => {
    return new THREE.BoxGeometry(dimensions.length, dimensions.height, dimensions.width)
  }, [dimensions.length, dimensions.height, dimensions.width])
  
  const wallGeometry1 = useMemo(() => {
    return new THREE.PlaneGeometry(dimensions.length, dimensions.height)
  }, [dimensions.length, dimensions.height])
  
  const wallGeometry2 = useMemo(() => {
    return new THREE.PlaneGeometry(dimensions.width, dimensions.height)
  }, [dimensions.width, dimensions.height])
  
  const floorGeometry = useMemo(() => {
    return new THREE.PlaneGeometry(dimensions.length, dimensions.width)
  }, [dimensions.length, dimensions.width])
  
  const markerGeometry = useMemo(() => {
    return new THREE.BoxGeometry(dimensions.length, 0.02, 0.02)
  }, [dimensions.length])
  
  // Memoize materials
  const wireframeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({ color: '#64748b', wireframe: true, transparent: true, opacity: 0.4 })
  }, [])
  
  const wallMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({ color: '#1e293b', transparent: true, opacity: 0.1, side: THREE.DoubleSide })
  }, [])
  
  const floorMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: '#334155' })
  }, [])
  
  const markerMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({ color: '#f59e0b' })
  }, [])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wireframeGeometry.dispose()
      wallGeometry1.dispose()
      wallGeometry2.dispose()
      floorGeometry.dispose()
      markerGeometry.dispose()
      wireframeMaterial.dispose()
      wallMaterial.dispose()
      floorMaterial.dispose()
      markerMaterial.dispose()
    }
  }, [wireframeGeometry, wallGeometry1, wallGeometry2, floorGeometry, markerGeometry, wireframeMaterial, wallMaterial, floorMaterial, markerMaterial])
  
  return (
    <group>
      {/* Wireframe for the truck */}
      <mesh 
        position={[dimensions.length / 2, dimensions.height / 2, dimensions.width / 2]}
        geometry={wireframeGeometry}
        material={wireframeMaterial}
      />
      
      {/* Truck walls - semi-transparent */}
      <mesh 
        position={[dimensions.length / 2, dimensions.height / 2, 0]}
        geometry={wallGeometry1}
        material={wallMaterial}
      />
      <mesh 
        position={[0, dimensions.height / 2, dimensions.width / 2]} 
        rotation={[0, Math.PI / 2, 0]}
        geometry={wallGeometry2}
        material={wallMaterial}
      />
      
      {/* Floor */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[dimensions.length / 2, 0.01, dimensions.width / 2]}
        geometry={floorGeometry}
        material={floorMaterial}
      />
      
      {/* Grid helper - Note: gridHelper is not a standard mesh, handled by Three.js internally */}
      <gridHelper 
        args={[Math.max(dimensions.length, dimensions.width) * 1.5, 20, 0x475569, 0x1e293b]} 
        position={[dimensions.length / 2, 0.02, dimensions.width / 2]}
      />
      
      {/* Dimension markers */}
      <group position={[dimensions.length / 2, -0.1, dimensions.width + 0.2]}>
        <mesh
          geometry={markerGeometry}
          material={markerMaterial}
        />
      </group>
    </group>
  )
}

export default function TruckViewer({ truckDimensions, packedBoxes = [], onBoxClick }: TruckViewerProps) {
  const controlsRef = useRef<any>(null)
  const [hoveredBox, setHoveredBox] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'3d' | 'top' | 'side'>('3d')

  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset()
    }
  }

  // Use actual packed boxes or sample if empty
  const displayBoxes = packedBoxes.length > 0 ? packedBoxes : []
  
  // Calculate utilization
  const truckVolume = truckDimensions.length * truckDimensions.width * truckDimensions.height
  const packedVolume = displayBoxes.reduce((sum, box) => sum + box.width * box.height * box.depth, 0)
  const utilization = truckVolume > 0 ? Math.round((packedVolume / truckVolume) * 100) : 0

  // Camera positions for different views
  const getCameraPosition = () => {
    const { length, width, height } = truckDimensions
    switch (viewMode) {
      case 'top':
        return [length / 2, Math.max(length, width) * 1.5, width / 2]
      case 'side':
        return [length * 1.5, height / 2, width / 2]
      default:
        return [length * 1.3, height * 1.5, width * 1.8]
    }
  }

  return (
    <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-lg overflow-hidden h-[300px] sm:h-[350px] lg:h-[400px] w-full">
      {/* Controls - Responsive */}
      <div className="absolute top-2 sm:top-3 right-2 sm:right-3 flex flex-col sm:flex-row gap-1 sm:gap-2 z-10">
        <button 
          onClick={resetCamera}
          className="w-8 h-8 bg-white/10 backdrop-blur rounded flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setViewMode('3d')}
          className={`w-8 h-8 backdrop-blur rounded flex items-center justify-center transition-colors ${viewMode === '3d' ? 'bg-primary-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          title="3D View"
        >
          <Layers className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setViewMode('top')}
          className={`w-8 h-8 backdrop-blur rounded flex items-center justify-center transition-colors ${viewMode === 'top' ? 'bg-primary-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          title="Top View"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
      
      {/* Legend - Responsive */}
      <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 bg-black/40 backdrop-blur-md rounded-lg p-2 text-xs text-white z-10 max-w-[200px] sm:max-w-none">
        <div className="flex items-center gap-2 mb-1">
          <Move3d className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Orbit: Drag | Pan: Right Click | Zoom: Scroll</span>
          <span className="sm:hidden">Drag to rotate</span>
        </div>
        <div className="text-slate-300">
          {truckDimensions.length}m × {truckDimensions.width}m × {truckDimensions.height}m
        </div>
      </div>
      
      {/* Stats - Responsive */}
      <div className="absolute top-2 sm:top-3 left-2 sm:left-3 bg-black/40 backdrop-blur-md rounded-lg p-2 z-10">
        <div className="text-xs text-white space-y-1">
          <p className="flex items-center justify-between gap-4">
            <span className="text-slate-300">Boxes:</span> 
            <span className="font-semibold">{displayBoxes.length}</span>
          </p>
          <p className="flex items-center justify-between gap-4">
            <span className="text-slate-300">Utilization:</span>
            <span className={`font-semibold ${utilization > 70 ? 'text-green-400' : utilization > 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {utilization}%
            </span>
          </p>
        </div>
        {/* Mini progress bar */}
        <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${utilization > 70 ? 'bg-green-500' : utilization > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${Math.min(utilization, 100)}%` }}
          />
        </div>
      </div>

      {/* Empty state */}
      {displayBoxes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center text-white/60">
            <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Run optimization to see packed boxes</p>
          </div>
        </div>
      )}

      <Canvas shadows>
        <PerspectiveCamera 
          makeDefault 
          position={getCameraPosition() as [number, number, number]} 
          fov={50} 
        />
        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          enableDamping
          dampingFactor={0.05}
          minDistance={1}
          maxDistance={Math.max(truckDimensions.length, truckDimensions.width) * 3}
        />
        
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1} castShadow />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={0.8} castShadow />
        <directionalLight position={[5, 5, 5]} intensity={0.5} />
        
        <Suspense fallback={null}>
          <TruckContainer dimensions={truckDimensions} />
          {displayBoxes.map((box) => (
            <Box 
              key={box.id} 
              box={box} 
              onBoxClick={onBoxClick}
              isHovered={hoveredBox === box.id}
              onHover={setHoveredBox}
            />
          ))}
          <ContactShadows 
            position={[truckDimensions.length / 2, 0, truckDimensions.width / 2]} 
            opacity={0.4} 
            scale={Math.max(truckDimensions.length, truckDimensions.width) * 2} 
            blur={2} 
            far={4.5} 
          />
          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  )
}

