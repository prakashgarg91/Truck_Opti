import { useState, useMemo, useCallback } from 'react'
import { 
  Package, Truck, Play, Settings, Layers, CheckCircle2, 
  Plus, Trash2, Wand2, AlertTriangle, ChevronDown,
  Zap, Brain, Target, Calculator, ShoppingCart, ArrowRight
} from 'lucide-react'
import TruckViewer from '../components/TruckViewer'
import toast from 'react-hot-toast'

// ============= TYPES =============
interface SaleOrderItem {
  id: string
  name: string
  length: number  // cm
  width: number   // cm
  height: number  // cm
  weight: number  // kg
  quantity: number
  fragile: boolean
  stackable: boolean
}

interface TruckType {
  id: string
  name: string
  nameHi: string
  dimensions: { length: number; width: number; height: number } // meters
  capacity: number // kg
  costPerKm: number // ₹
  available: number
}

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
  itemId: string
}

interface TruckRecommendation {
  truck: TruckType
  itemsFit: number
  totalItems: number
  volumeUtilization: number
  weightUtilization: number
  estimatedCost: number
  packedBoxes: PackedBox[]
  unfitItems: string[]
}

// ============= CONSTANTS =============
const TRUCKS: TruckType[] = [
  { id: 'tata-ace', name: 'Tata Ace', nameHi: 'टाटा एस', dimensions: { length: 2.2, width: 1.5, height: 1.2 }, capacity: 750, costPerKm: 12, available: 5 },
  { id: 'tata-407', name: 'Tata 407', nameHi: 'टाटा 407', dimensions: { length: 4.0, width: 1.8, height: 1.8 }, capacity: 2500, costPerKm: 18, available: 3 },
  { id: 'eicher-14', name: 'Eicher 14ft', nameHi: 'आयशर 14 फुट', dimensions: { length: 4.26, width: 1.8, height: 1.8 }, capacity: 4000, costPerKm: 22, available: 4 },
  { id: 'eicher-17', name: 'Eicher 17ft', nameHi: 'आयशर 17 फुट', dimensions: { length: 5.18, width: 2.1, height: 2.1 }, capacity: 6000, costPerKm: 28, available: 2 },
  { id: 'bharat-24', name: 'BharatBenz 24ft', nameHi: 'भारत बेंज 24 फुट', dimensions: { length: 7.3, width: 2.3, height: 2.1 }, capacity: 9000, costPerKm: 35, available: 3 },
  { id: 'bharat-32', name: 'BharatBenz 32ft', nameHi: 'भारत बेंज 32 फुट', dimensions: { length: 9.45, width: 2.4, height: 2.15 }, capacity: 15000, costPerKm: 45, available: 2 },
]

const ALGORITHMS = [
  { id: 'skyline', name: 'Skyline BL', nameHi: 'स्काईलाइन', icon: Layers, description: 'Fast, good for uniform boxes', speed: 'Fast', quality: 'Good' },
  { id: 'extreme_points', name: 'Extreme Points', nameHi: 'एक्सट्रीम पॉइंट्स', icon: Target, description: 'Balanced performance', speed: 'Medium', quality: 'Better' },
  { id: 'genetic', name: 'Genetic Algorithm', nameHi: 'जेनेटिक', icon: Brain, description: 'Best optimization', speed: 'Slow', quality: 'Best' },
]

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']

// ============= ADVANCED 3D BIN PACKING ALGORITHM =============
class AdvancedBinPacker {
  private truck: TruckType
  private items: SaleOrderItem[]
  private algorithm: string
  
  constructor(truck: TruckType, items: SaleOrderItem[], algorithm: string) {
    this.truck = truck
    this.items = items
    this.algorithm = algorithm
  }
  
  // Convert cm to meters
  private cmToM(cm: number): number {
    return cm / 100
  }
  
  // Calculate volume
  private getVolume(l: number, w: number, h: number): number {
    return l * w * h
  }
  
  // Check if a box fits at a position without collision
  private fitsAt(packed: PackedBox[], x: number, y: number, z: number, l: number, w: number, h: number): boolean {
    const { length, width, height } = this.truck.dimensions
    
    // Check truck bounds
    if (x + l > length || y + h > height || z + w > width) return false
    if (x < 0 || y < 0 || z < 0) return false
    
    // Check collision with existing boxes
    for (const box of packed) {
      const overlapX = x < box.x + box.width && x + l > box.x
      const overlapY = y < box.y + box.height && y + h > box.y
      const overlapZ = z < box.z + box.depth && z + w > box.z
      
      if (overlapX && overlapY && overlapZ) return false
    }
    
    return true
  }
  
  // Skyline Bottom-Left algorithm with improved placement
  private packSkylineBL(): { packed: PackedBox[], unpacked: string[] } {
    const packed: PackedBox[] = []
    const unpacked: string[] = []
    const { length, width, height } = this.truck.dimensions
    
    // Create expanded item list based on quantity
    const expandedItems: { item: SaleOrderItem, index: number }[] = []
    this.items.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        expandedItems.push({ item, index: i })
      }
    })
    
    // Sort by volume (largest first) and stackability
    expandedItems.sort((a, b) => {
      const volA = this.getVolume(a.item.length, a.item.width, a.item.height)
      const volB = this.getVolume(b.item.length, b.item.width, b.item.height)
      if (a.item.stackable !== b.item.stackable) return a.item.stackable ? 1 : -1
      return volB - volA
    })
    
    // Try to place each item
    for (const { item, index } of expandedItems) {
      const itemL = this.cmToM(item.length)
      const itemW = this.cmToM(item.width)
      const itemH = this.cmToM(item.height)
      
      let placed = false
      
      // Try all rotations
      const rotations = [
        { l: itemL, w: itemW, h: itemH },
        { l: itemW, w: itemL, h: itemH },
        { l: itemL, w: itemH, h: itemW },
        { l: itemH, w: itemL, h: itemW },
        { l: itemW, w: itemH, h: itemL },
        { l: itemH, w: itemW, h: itemL },
      ]
      
      // Grid search for position (bottom-left-front first)
      const step = 0.1 // 10cm grid
      
      outerLoop:
      for (const rot of rotations) {
        for (let y = 0; y <= height - rot.h; y += step) {
          for (let z = 0; z <= width - rot.w; z += step) {
            for (let x = 0; x <= length - rot.l; x += step) {
              if (this.fitsAt(packed, x, y, z, rot.l, rot.w, rot.h)) {
                packed.push({
                  id: `${item.id}-${index}`,
                  x: Math.round(x * 100) / 100,
                  y: Math.round(y * 100) / 100,
                  z: Math.round(z * 100) / 100,
                  width: rot.l,
                  height: rot.h,
                  depth: rot.w,
                  color: COLORS[this.items.indexOf(item) % COLORS.length],
                  label: `${item.name.substring(0, 3)}${index + 1}`,
                  itemId: item.id
                })
                placed = true
                break outerLoop
              }
            }
          }
        }
      }
      
      if (!placed) {
        unpacked.push(`${item.name} #${index + 1}`)
      }
    }
    
    return { packed, unpacked }
  }
  
  // Extreme Points algorithm
  private packExtremePoints(): { packed: PackedBox[], unpacked: string[] } {
    const packed: PackedBox[] = []
    const unpacked: string[] = []
    const { length, width, height } = this.truck.dimensions
    
    // Extreme points list - start at origin
    let extremePoints: { x: number, y: number, z: number }[] = [{ x: 0, y: 0, z: 0 }]
    
    const expandedItems: { item: SaleOrderItem, index: number }[] = []
    this.items.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        expandedItems.push({ item, index: i })
      }
    })
    
    // Sort by volume descending
    expandedItems.sort((a, b) => {
      const volA = this.getVolume(a.item.length, a.item.width, a.item.height)
      const volB = this.getVolume(b.item.length, b.item.width, b.item.height)
      return volB - volA
    })
    
    for (const { item, index } of expandedItems) {
      const itemL = this.cmToM(item.length)
      const itemW = this.cmToM(item.width)
      const itemH = this.cmToM(item.height)
      
      let placed = false
      let bestPoint = { x: 0, y: 0, z: 0 }
      let bestRotation = { l: itemL, w: itemW, h: itemH }
      let minWaste = Infinity
      
      const rotations = [
        { l: itemL, w: itemW, h: itemH },
        { l: itemW, w: itemL, h: itemH },
        { l: itemL, w: itemH, h: itemW },
        { l: itemH, w: itemL, h: itemW },
        { l: itemW, w: itemH, h: itemL },
        { l: itemH, w: itemW, h: itemL },
      ]
      
      for (const rot of rotations) {
        for (const ep of extremePoints) {
          if (this.fitsAt(packed, ep.x, ep.y, ep.z, rot.l, rot.w, rot.h)) {
            // Score: prefer bottom-left-front positions
            const waste = ep.x * 1 + ep.y * 2 + ep.z * 1.5
            if (waste < minWaste) {
              minWaste = waste
              bestPoint = { ...ep }
              bestRotation = { ...rot }
              placed = true
            }
          }
        }
      }
      
      if (placed) {
        packed.push({
          id: `${item.id}-${index}`,
          x: bestPoint.x,
          y: bestPoint.y,
          z: bestPoint.z,
          width: bestRotation.l,
          height: bestRotation.h,
          depth: bestRotation.w,
          color: COLORS[this.items.indexOf(item) % COLORS.length],
          label: `${item.name.substring(0, 3)}${index + 1}`,
          itemId: item.id
        })
        
        // Remove used point
        extremePoints = extremePoints.filter(ep => 
          !(ep.x === bestPoint.x && ep.y === bestPoint.y && ep.z === bestPoint.z)
        )
        
        // Generate new extreme points
        const newPoints = [
          { x: bestPoint.x + bestRotation.l, y: bestPoint.y, z: bestPoint.z },
          { x: bestPoint.x, y: bestPoint.y + bestRotation.h, z: bestPoint.z },
          { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z + bestRotation.w }
        ]
        
        // Add only valid points
        for (const np of newPoints) {
          if (np.x < length && np.y < height && np.z < width) {
            const exists = extremePoints.some(ep => 
              Math.abs(ep.x - np.x) < 0.01 && Math.abs(ep.y - np.y) < 0.01 && Math.abs(ep.z - np.z) < 0.01
            )
            if (!exists) extremePoints.push(np)
          }
        }
        
        // Sort by distance from origin
        extremePoints.sort((a, b) => (a.x + a.y * 2 + a.z * 1.5) - (b.x + b.y * 2 + b.z * 1.5))
      } else {
        unpacked.push(`${item.name} #${index + 1}`)
      }
    }
    
    return { packed, unpacked }
  }
  
  // Genetic Algorithm (simplified with multiple iterations)
  private packGenetic(): { packed: PackedBox[], unpacked: string[] } {
    const iterations = 8
    let bestResult = { packed: [] as PackedBox[], unpacked: [] as string[] }
    let bestCount = 0
    
    for (let i = 0; i < iterations; i++) {
      // Create shuffled copy of items
      const shuffledItems = [...this.items].sort(() => Math.random() - 0.5)
      
      // Use extreme points with different item orders
      const tempPacker = new AdvancedBinPacker(this.truck, shuffledItems, 'extreme_points')
      const result = tempPacker.packExtremePoints()
      
      if (result.packed.length > bestCount) {
        bestCount = result.packed.length
        bestResult = result
      }
    }
    
    return bestResult
  }
  
  public pack(): { packed: PackedBox[], unpacked: string[] } {
    switch (this.algorithm) {
      case 'genetic':
        return this.packGenetic()
      case 'extreme_points':
        return this.packExtremePoints()
      default:
        return this.packSkylineBL()
    }
  }
}

// ============= SMART TRUCK RECOMMENDATION ENGINE =============
function recommendTrucks(items: SaleOrderItem[], algorithm: string): TruckRecommendation[] {
  const recommendations: TruckRecommendation[] = []
  
  // Calculate total volume and weight needed
  const totalVolume = items.reduce((sum, item) => {
    return sum + (item.length * item.width * item.height * item.quantity) / 1000000 // cm³ to m³
  }, 0)
  
  const totalWeight = items.reduce((sum, item) => {
    return sum + item.weight * item.quantity
  }, 0)
  
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  
  // Test each truck type
  for (const truck of TRUCKS) {
    const truckVolume = truck.dimensions.length * truck.dimensions.width * truck.dimensions.height
    
    // Skip if truck is clearly too small
    if (truckVolume < totalVolume * 0.2 || truck.capacity < totalWeight * 0.3) continue
    
    const packer = new AdvancedBinPacker(truck, items, algorithm)
    const { packed, unpacked } = packer.pack()
    
    if (packed.length === 0) continue
    
    const packedVolume = packed.reduce((sum, box) => sum + box.width * box.height * box.depth, 0)
    const packedWeight = packed.reduce((sum, box) => {
      const item = items.find(i => i.id === box.itemId)
      return sum + (item?.weight || 0)
    }, 0)
    
    recommendations.push({
      truck,
      itemsFit: packed.length,
      totalItems,
      volumeUtilization: Math.round((packedVolume / truckVolume) * 100),
      weightUtilization: Math.round((packedWeight / truck.capacity) * 100),
      estimatedCost: truck.costPerKm * 100, // Assume 100km trip
      packedBoxes: packed,
      unfitItems: unpacked
    })
  }
  
  // Sort by best fit (items packed, then utilization, then cost)
  recommendations.sort((a, b) => {
    // First priority: fit all items if possible
    if (a.itemsFit === a.totalItems && b.itemsFit !== b.totalItems) return -1
    if (b.itemsFit === b.totalItems && a.itemsFit !== a.totalItems) return 1
    
    // Second priority: more items fit
    if (a.itemsFit !== b.itemsFit) return b.itemsFit - a.itemsFit
    
    // Third priority: better utilization
    if (Math.abs(a.volumeUtilization - b.volumeUtilization) > 10) {
      return b.volumeUtilization - a.volumeUtilization
    }
    
    // Fourth: lower cost
    return a.estimatedCost - b.estimatedCost
  })
  
  return recommendations.slice(0, 3) // Top 3 recommendations
}

// ============= MAIN COMPONENT =============
export default function PackingPage() {
  // State
  const [mode, setMode] = useState<'manual' | 'smart'>('smart')
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [algorithm, setAlgorithm] = useState('extreme_points')
  const [saleOrderItems, setSaleOrderItems] = useState<SaleOrderItem[]>([
    { id: '1', name: 'TV Box', length: 120, width: 80, height: 20, weight: 15, quantity: 3, fragile: true, stackable: false },
    { id: '2', name: 'Refrigerator', length: 70, width: 70, height: 180, weight: 65, quantity: 2, fragile: true, stackable: false },
    { id: '3', name: 'Carton Small', length: 40, width: 30, height: 30, weight: 5, quantity: 20, fragile: false, stackable: true },
    { id: '4', name: 'Carton Medium', length: 60, width: 40, height: 40, weight: 12, quantity: 10, fragile: false, stackable: true },
  ])
  const [recommendations, setRecommendations] = useState<TruckRecommendation[]>([])
  const [selectedRecommendation, setSelectedRecommendation] = useState<TruckRecommendation | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [newItem, setNewItem] = useState<Partial<SaleOrderItem>>({
    name: '', length: 0, width: 0, height: 0, weight: 0, quantity: 1, fragile: false, stackable: true
  })
  const [expandedSection, setExpandedSection] = useState<string | null>('items')
  const [isProcessing, setIsProcessing] = useState(false)

  // Computed
  const totalStats = useMemo(() => {
    const totalItems = saleOrderItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalWeight = saleOrderItems.reduce((sum, item) => sum + item.weight * item.quantity, 0)
    const totalVolume = saleOrderItems.reduce((sum, item) => 
      sum + (item.length * item.width * item.height * item.quantity) / 1000000, 0
    )
    return { totalItems, totalWeight, totalVolume: totalVolume.toFixed(2) }
  }, [saleOrderItems])

  const currentTruck = TRUCKS.find(t => t.id === selectedTruck)

  // Handlers
  const handleAddItem = useCallback(() => {
    if (!newItem.name || !newItem.length || !newItem.width || !newItem.height) {
      toast.error('Please fill all dimensions')
      return
    }
    
    const item: SaleOrderItem = {
      id: Date.now().toString(),
      name: newItem.name || 'Item',
      length: newItem.length || 0,
      width: newItem.width || 0,
      height: newItem.height || 0,
      weight: newItem.weight || 0,
      quantity: newItem.quantity || 1,
      fragile: newItem.fragile || false,
      stackable: newItem.stackable ?? true
    }
    
    setSaleOrderItems(prev => [...prev, item])
    setNewItem({ name: '', length: 0, width: 0, height: 0, weight: 0, quantity: 1, fragile: false, stackable: true })
    setShowItemForm(false)
    toast.success('Item added!')
  }, [newItem])

  const handleRemoveItem = useCallback((id: string) => {
    setSaleOrderItems(prev => prev.filter(item => item.id !== id))
    toast.success('Item removed')
  }, [])

  const handleSmartRecommend = useCallback(() => {
    if (saleOrderItems.length === 0) {
      toast.error('Add items to get recommendations')
      return
    }
    
    setIsProcessing(true)
    toast.loading('Analyzing trucks...', { id: 'recommend' })
    
    // Simulate processing delay for better UX
    setTimeout(() => {
      const recs = recommendTrucks(saleOrderItems, algorithm)
      setRecommendations(recs)
      if (recs.length > 0) {
        setSelectedRecommendation(recs[0])
        setSelectedTruck(recs[0].truck.id)
        toast.success(`Found ${recs.length} truck options!`, { id: 'recommend' })
      } else {
        toast.error('No suitable truck found. Try smaller items.', { id: 'recommend' })
      }
      setIsProcessing(false)
    }, 800)
  }, [saleOrderItems, algorithm])

  const handleManualPack = useCallback(() => {
    if (!selectedTruck || saleOrderItems.length === 0) {
      toast.error('Select truck and add items')
      return
    }
    
    setIsProcessing(true)
    
    setTimeout(() => {
      const truck = TRUCKS.find(t => t.id === selectedTruck)!
      const packer = new AdvancedBinPacker(truck, saleOrderItems, algorithm)
      const { packed, unpacked } = packer.pack()
      
      const truckVolume = truck.dimensions.length * truck.dimensions.width * truck.dimensions.height
      const packedVolume = packed.reduce((sum, box) => sum + box.width * box.height * box.depth, 0)
      const packedWeight = saleOrderItems.reduce((sum, item) => sum + item.weight * item.quantity, 0)
      
      const rec: TruckRecommendation = {
        truck,
        itemsFit: packed.length,
        totalItems: saleOrderItems.reduce((sum, item) => sum + item.quantity, 0),
        volumeUtilization: Math.round((packedVolume / truckVolume) * 100),
        weightUtilization: Math.round((packedWeight / truck.capacity) * 100),
        estimatedCost: truck.costPerKm * 100,
        packedBoxes: packed,
        unfitItems: unpacked
      }
      
      setSelectedRecommendation(rec)
      setRecommendations([rec])
      toast.success(`Packed ${packed.length} items!`)
      setIsProcessing(false)
    }, 500)
  }, [selectedTruck, saleOrderItems, algorithm])

  // Section toggle for mobile accordion
  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800 px-4 py-3 lg:px-6 lg:py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-6 h-6 text-primary-500" />
                3D Bin Packing
                <span className="text-xs font-normal text-slate-500 ml-2 hidden sm:inline">/ 3डी बिन पैकिंग</span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Smart truck selection for your orders / आपके ऑर्डर के लिए स्मार्ट ट्रक चयन
              </p>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setMode('smart')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === 'smart' 
                    ? 'bg-primary-600 text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Wand2 className="w-4 h-4" />
                <span className="hidden sm:inline">Smart Mode</span>
                <span className="sm:hidden">Smart</span>
              </button>
              <button
                onClick={() => setMode('manual')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === 'manual' 
                    ? 'bg-slate-700 text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Manual</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          
          {/* Left Panel - Items & Controls */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            
            {/* Sale Order Items - Collapsible on mobile */}
            <div className="card overflow-hidden">
              <button 
                onClick={() => toggleSection('items')}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary-500" />
                  Sale Order Items / सेल ऑर्डर आइटम
                  <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs px-2 py-0.5 rounded-full">
                    {totalStats.totalItems}
                  </span>
                </h3>
                <ChevronDown className={`w-5 h-5 text-slate-400 lg:hidden transition-transform ${expandedSection === 'items' ? 'rotate-180' : ''}`} />
              </button>
              
              <div className={`${expandedSection === 'items' ? 'block' : 'hidden lg:block'}`}>
                {/* Stats Summary */}
                <div className="px-4 pb-3 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500">Items</p>
                    <p className="font-bold text-slate-900 dark:text-white">{totalStats.totalItems}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500">Weight</p>
                    <p className="font-bold text-slate-900 dark:text-white">{totalStats.totalWeight}kg</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500">Volume</p>
                    <p className="font-bold text-slate-900 dark:text-white">{totalStats.totalVolume}m³</p>
                  </div>
                </div>
                
                {/* Items List */}
                <div className="px-4 pb-4 max-h-48 lg:max-h-64 overflow-y-auto space-y-2">
                  {saleOrderItems.map((item, idx) => (
                    <div 
                      key={item.id}
                      className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg group"
                    >
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {item.name} <span className="text-slate-500">×{item.quantity}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.length}×{item.width}×{item.height}cm • {item.weight}kg
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                {/* Add Item Form */}
                {showItemForm ? (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pt-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <input
                        type="text"
                        placeholder="Item name"
                        value={newItem.name}
                        onChange={e => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                        className="input text-sm col-span-2"
                      />
                      <input
                        type="number"
                        placeholder="L (cm)"
                        value={newItem.length || ''}
                        onChange={e => setNewItem(prev => ({ ...prev, length: +e.target.value }))}
                        className="input text-sm"
                      />
                      <input
                        type="number"
                        placeholder="W (cm)"
                        value={newItem.width || ''}
                        onChange={e => setNewItem(prev => ({ ...prev, width: +e.target.value }))}
                        className="input text-sm"
                      />
                      <input
                        type="number"
                        placeholder="H (cm)"
                        value={newItem.height || ''}
                        onChange={e => setNewItem(prev => ({ ...prev, height: +e.target.value }))}
                        className="input text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Weight (kg)"
                        value={newItem.weight || ''}
                        onChange={e => setNewItem(prev => ({ ...prev, weight: +e.target.value }))}
                        className="input text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={newItem.quantity || ''}
                        onChange={e => setNewItem(prev => ({ ...prev, quantity: +e.target.value }))}
                        className="input text-sm"
                      />
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={newItem.stackable}
                          onChange={e => setNewItem(prev => ({ ...prev, stackable: e.target.checked }))}
                          className="rounded text-primary-600"
                        />
                        Stackable
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowItemForm(false)} className="btn btn-secondary flex-1 py-2">Cancel</button>
                      <button onClick={handleAddItem} className="btn btn-primary flex-1 py-2">Add Item</button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-4">
                    <button
                      onClick={() => setShowItemForm(true)}
                      className="btn btn-outline w-full py-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Item / आइटम जोड़ें
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Algorithm Selection */}
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary-500" />
                Algorithm / एल्गोरिदम
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
                {ALGORITHMS.map(algo => (
                  <button
                    key={algo.id}
                    onClick={() => setAlgorithm(algo.id)}
                    className={`p-3 rounded-xl text-left transition-all border-2 ${
                      algorithm === algo.id
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 shadow-md'
                        : 'bg-slate-50 dark:bg-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <algo.icon className={`w-4 h-4 ${algorithm === algo.id ? 'text-primary-500' : 'text-slate-400'}`} />
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{algo.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${
                        algo.speed === 'Fast' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        algo.speed === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {algo.speed}
                      </span>
                      <span className="text-slate-500">{algo.quality}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Mode: Truck Selection */}
            {mode === 'manual' && (
              <div className="card p-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-primary-500" />
                  Select Truck / ट्रक चुनें
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {TRUCKS.map(truck => (
                    <button
                      key={truck.id}
                      onClick={() => setSelectedTruck(truck.id)}
                      className={`w-full p-3 rounded-xl text-left transition-all border-2 ${
                        selectedTruck === truck.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500'
                          : 'bg-slate-50 dark:bg-slate-800 border-transparent hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{truck.name}</p>
                          <p className="text-xs text-slate-500">
                            {truck.dimensions.length}×{truck.dimensions.width}×{truck.dimensions.height}m • {truck.capacity}kg
                          </p>
                        </div>
                        {selectedTruck === truck.id && (
                          <CheckCircle2 className="w-5 h-5 text-primary-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={mode === 'smart' ? handleSmartRecommend : handleManualPack}
              disabled={saleOrderItems.length === 0 || (mode === 'manual' && !selectedTruck) || isProcessing}
              className={`btn w-full py-4 text-lg shadow-lg ${
                mode === 'smart' 
                  ? 'bg-gradient-to-r from-primary-600 to-saffron text-white hover:from-primary-700 hover:to-orange-500' 
                  : 'btn-primary'
              }`}
            >
              {isProcessing ? (
                <div className="spinner w-6 h-6" />
              ) : mode === 'smart' ? (
                <>
                  <Wand2 className="w-5 h-5" />
                  Find Best Truck / सबसे अच्छा ट्रक खोजें
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Optimize Packing / पैकिंग ऑप्टिमाइज़ करें
                </>
              )}
            </button>
          </div>

          {/* Right Panel - Visualization & Results */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            
            {/* Smart Recommendations */}
            {mode === 'smart' && recommendations.length > 0 && (
              <div className="card p-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Recommended Trucks / अनुशंसित ट्रक
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {recommendations.map((rec, idx) => (
                    <button
                      key={rec.truck.id}
                      onClick={() => {
                        setSelectedRecommendation(rec)
                        setSelectedTruck(rec.truck.id)
                      }}
                      className={`p-4 rounded-xl text-left transition-all border-2 relative ${
                        selectedRecommendation?.truck.id === rec.truck.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 shadow-lg'
                          : 'bg-slate-50 dark:bg-slate-800 border-transparent hover:border-slate-200'
                      }`}
                    >
                      {idx === 0 && (
                        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full shadow-lg">
                          Best Match
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <Truck className={`w-5 h-5 ${idx === 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                        <span className="font-semibold text-slate-900 dark:text-white">{rec.truck.name}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Items Fit</span>
                          <span className={`font-medium ${
                            rec.itemsFit === rec.totalItems ? 'text-green-600' : 'text-amber-600'
                          }`}>
                            {rec.itemsFit}/{rec.totalItems}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Volume</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  rec.volumeUtilization > 70 ? 'bg-green-500' : 
                                  rec.volumeUtilization > 40 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(rec.volumeUtilization, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{rec.volumeUtilization}%</span>
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Est. Cost</span>
                          <span className="font-medium text-slate-900 dark:text-white">₹{rec.estimatedCost}</span>
                        </div>
                      </div>
                      {rec.unfitItems.length > 0 && (
                        <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {rec.unfitItems.length} items won't fit
                          </p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3D Visualization */}
            <div className="card overflow-hidden">
              {selectedRecommendation || (currentTruck && mode === 'manual') ? (
                <TruckViewer
                  truckDimensions={selectedRecommendation?.truck.dimensions || currentTruck!.dimensions}
                  packedBoxes={selectedRecommendation?.packedBoxes || []}
                />
              ) : (
                <div className="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 h-64 lg:h-96 flex items-center justify-center">
                  <div className="text-center px-4">
                    <div className="w-16 h-16 bg-white dark:bg-slate-700 rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4">
                      <Layers className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {mode === 'smart' ? 'Click "Find Best Truck" to see 3D visualization' : 'Select a truck to see 3D preview'}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {mode === 'smart' ? 'स्मार्ट अनुशंसा के लिए ऊपर बटन दबाएं' : 'ट्रक चुनें और विज़ुअलाइज़ेशन देखें'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Packing Details */}
            {selectedRecommendation && (
              <div className="card p-4 animate-fade-in">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-primary-500" />
                  Packing Details / पैकिंग विवरण
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{selectedRecommendation.itemsFit}</p>
                    <p className="text-xs text-green-700 dark:text-green-500">Items Packed</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedRecommendation.volumeUtilization}%</p>
                    <p className="text-xs text-blue-700 dark:text-blue-500">Volume Used</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{selectedRecommendation.weightUtilization}%</p>
                    <p className="text-xs text-purple-700 dark:text-purple-500">Weight Used</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">₹{selectedRecommendation.estimatedCost}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-500">Est. Cost</p>
                  </div>
                </div>

                {selectedRecommendation.unfitItems.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
                    <h4 className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      Items That Won't Fit / जो आइटम नहीं बैठेंगे
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedRecommendation.unfitItems.map((item, idx) => (
                        <span key={idx} className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs px-2 py-1 rounded-full">
                          {item}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-amber-600 dark:text-amber-500 mt-3">
                      Consider using an additional truck or larger vehicle
                    </p>
                  </div>
                )}

                {/* Book Truck Button */}
                <button className="btn bg-gradient-to-r from-green-500 to-emerald-600 text-white w-full py-4 text-lg shadow-lg hover:from-green-600 hover:to-emerald-700">
                  <Truck className="w-5 h-5" />
                  Book {selectedRecommendation.truck.name}
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

