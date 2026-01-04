import { useRef, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Text, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { Maximize2, RotateCcw, Move3d } from 'lucide-react'

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

function Box({ box, onBoxClick }: { box: PackedBox; onBoxClick?: (box: PackedBox) => void }) {
  const meshRef = useRef<THREE.Mesh>(null)
  
  return (
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
    >
      <boxGeometry args={[box.width, box.height, box.depth]} />
      <meshStandardMaterial color={box.color} opacity={0.8} transparent />
      <Text
        position={[0, 0, box.depth / 2 + 0.01]}
        fontSize={0.1}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {box.label}
      </Text>
    </mesh>
  )
}

function TruckContainer({ dimensions }: { dimensions: { length: number; width: number; height: number } }) {
  return (
    <group>
      {/* Wireframe for the truck */}
      <mesh position={[dimensions.length / 2, dimensions.height / 2, dimensions.width / 2]}>
        <boxGeometry args={[dimensions.length, dimensions.height, dimensions.width]} />
        <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.3} />
      </mesh>
      
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dimensions.length / 2, 0, dimensions.width / 2]}>
        <planeGeometry args={[dimensions.length, dimensions.width]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      
      {/* Grid helper */}
      <gridHelper 
        args={[Math.max(dimensions.length, dimensions.width) * 2, 20, 0x475569, 0x1e293b]} 
        position={[dimensions.length / 2, 0.01, dimensions.width / 2]}
      />
    </group>
  )
}

export default function TruckViewer({ truckDimensions, packedBoxes = [], onBoxClick }: TruckViewerProps) {
  const controlsRef = useRef<any>(null)

  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset()
    }
  }

  const sampleBoxes: PackedBox[] = [
    { id: '1', x: 0, y: 0, z: 0, width: 1, height: 0.8, depth: 0.8, color: '#3b82f6', label: 'A1' },
    { id: '2', x: 1.1, y: 0, z: 0, width: 1.2, height: 1, depth: 0.9, color: '#22c55e', label: 'A2' },
    { id: '3', x: 0, y: 0, z: 0.9, width: 0.8, height: 0.6, depth: 0.7, color: '#f59e0b', label: 'B1' },
    { id: '4', x: 0, y: 0.85, z: 0, width: 1, height: 0.5, depth: 0.8, color: '#ef4444', label: 'C1' },
  ]

  const displayBoxes = packedBoxes.length > 0 ? packedBoxes : sampleBoxes

  return (
    <div className="relative bg-slate-900 rounded-lg overflow-hidden h-[400px] w-full">
      {/* Controls */}
      <div className="absolute top-3 right-3 flex gap-2 z-10">
        <button 
          onClick={resetCamera}
          className="w-8 h-8 bg-white/10 backdrop-blur rounded flex items-center justify-center text-white hover:bg-white/20"
          title="Reset View"
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
          <span>Orbit: Left Click | Pan: Right Click | Zoom: Scroll</span>
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

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[truckDimensions.length * 1.5, truckDimensions.height * 2, truckDimensions.width * 1.5]} fov={50} />
        <OrbitControls ref={controlsRef} makeDefault />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} castShadow />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
        
        <Suspense fallback={null}>
          <TruckContainer dimensions={truckDimensions} />
          {displayBoxes.map((box) => (
            <Box key={box.id} box={box} onBoxClick={onBoxClick} />
          ))}
          <ContactShadows position={[truckDimensions.length / 2, 0, truckDimensions.width / 2]} opacity={0.4} scale={20} blur={2} far={4.5} />
          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  )
}

