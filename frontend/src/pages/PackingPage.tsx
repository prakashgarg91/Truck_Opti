import { useState, useMemo, useCallback, useEffect, memo, lazy, Suspense } from 'react'
import {
  Package, Truck, Play, Settings, Layers, CheckCircle2,
  Plus, Trash2, Wand2, AlertTriangle, ChevronDown,
  Zap, Brain, Target, Calculator, ShoppingCart, ArrowRight, Globe,
  Save, Edit2, Check, X, Loader2
} from 'lucide-react'
// Lazy load 3D viewer to reduce initial bundle size
const TruckViewer = lazy(() => import('../components/TruckViewer'))
import toast from 'react-hot-toast'
import { trucksSupabaseApi, packingJobsSupabaseApi, shipmentsSupabaseApi, customersSupabaseApi, notificationsSupabaseApi, saleOrdersSupabaseApi } from '../services/supabaseApi'
import { useNavigate, useLocation } from 'react-router-dom'
import { itemSchema, getFieldErrors, type ItemInput } from '../utils/validators'
import { usePackingWorker } from '../hooks/usePackingWorker'
import { useSubscription } from '../hooks/useSubscription'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import { AdvancedBinPacker, PACKING_COLORS, recommendTrucks, type PackedBox, type SaleOrderItem, type TruckRecommendation, type TruckType } from '../lib/packing'
import { logger } from '../utils/logger'
import { formatPercent, formatCurrency } from '../utils/formatters'

// ============= LANGUAGE =============
type Language = 'en' | 'hi'
const t = {
  en: {
    title: '3D Bin Packing',
    subtitle: 'Smart Truck Recommendation System',
    smartMode: 'Smart',
    manualMode: 'Manual',
    saleOrderItems: 'Sale Order Items',
    addItem: 'Add Item',
    algorithm: 'Algorithm',
    selectTruck: 'Select Truck',
    findBestTruck: 'Find Best Truck',
    optimizePacking: 'Optimize Packing',
    recommendedTrucks: 'Recommended Trucks',
    packingDetails: 'Packing Details',
    itemsPacked: 'Items Packed',
    volumeUsed: 'Volume Used',
    weightUsed: 'Weight Used',
    estCost: 'Est. Cost',
    itemsWontFit: "Items That Won't Fit",
    additionalTruck: 'Consider using an additional truck or larger vehicle',
    book: 'Book',
    saveJob: 'Save Job',
    noItems: 'No items added',
    addFirstItem: 'Add your first item above',
    selectTruckPrompt: 'Select a truck to see 3D preview',
    smartPrompt: 'Click "Find Best Truck" to see 3D visualization',
    itemName: 'Item',
    length: 'L (cm)',
    width: 'W (cm)',
    height: 'H (cm)',
    weight: 'Wt (kg)',
    qty: 'Qty',
    fragile: 'Fragile',
    stackable: 'Stackable',
    itemsFit: 'Items Fit',
    volume: 'Volume',
    best: 'Best',
    wontFit: "items won't fit",
    validation: {
      nameRequired: 'Name is required',
      lengthPositive: 'Length must be greater than 0',
      widthPositive: 'Width must be greater than 0',
      heightPositive: 'Height must be greater than 0',
      weightPositive: 'Weight must be greater than 0',
      quantityMin: 'Quantity must be at least 1'
    }
  },
  hi: {
    title: '3डी बिन पैकिंग',
    subtitle: 'स्मार्ट ट्रक अनुशंसा प्रणाली',
    smartMode: 'स्मार्ट',
    manualMode: 'मैन्युअल',
    saleOrderItems: 'सेल ऑर्डर आइटम',
    addItem: 'आइटम जोड़ें',
    algorithm: 'एल्गोरिदम',
    selectTruck: 'ट्रक चुनें',
    findBestTruck: 'सबसे अच्छा ट्रक खोजें',
    optimizePacking: 'पैकिंग ऑप्टिमाइज़ करें',
    recommendedTrucks: 'अनुशंसित ट्रक',
    packingDetails: 'पैकिंग विवरण',
    itemsPacked: 'पैक किए गए',
    volumeUsed: 'वॉल्यूम',
    weightUsed: 'वजन',
    estCost: 'अनुमानित लागत',
    itemsWontFit: 'जो आइटम नहीं बैठेंगे',
    additionalTruck: 'अतिरिक्त ट्रक या बड़ा वाहन उपयोग करें',
    book: 'बुक करें',
    saveJob: 'जॉब सेव करें',
    noItems: 'कोई आइटम नहीं',
    addFirstItem: 'ऊपर पहला आइटम जोड़ें',
    selectTruckPrompt: 'ट्रक चुनें और देखें',
    smartPrompt: 'बटन दबाएं',
    itemName: 'आइटम',
    length: 'लं (सेमी)',
    width: 'चौ (सेमी)',
    height: 'ऊँ (सेमी)',
    weight: 'वज़न (किग्रा)',
    qty: 'मात्रा',
    fragile: 'नाज़ुक',
    stackable: 'स्टैक',
    itemsFit: 'फिट',
    volume: 'वॉल्यूम',
    best: 'बेस्ट',
    wontFit: 'फिट नहीं होंगे',
    validation: {
      nameRequired: 'नाम आवश्यक है',
      lengthPositive: 'लंबाई 0 से अधिक होनी चाहिए',
      widthPositive: 'चौड़ाई 0 से अधिक होनी चाहिए',
      heightPositive: 'ऊंचाई 0 से अधिक होनी चाहिए',
      weightPositive: 'वजन 0 से अधिक होना चाहिए',
      quantityMin: 'मात्रा कम से कम 1 होनी चाहिए'
    }
  }
}

// ============= TYPES =============
interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  address: string
  city: string
  state?: string
}

// ============= CONSTANTS =============
const ALGORITHMS = [
  { id: 'skyline', name: 'Skyline BL', nameHi: 'स्काईलाइन', icon: Layers, description: 'Fast, good for uniform boxes', speed: 'Fast', quality: 'Good' },
  { id: 'extreme_points', name: 'Extreme Points', nameHi: 'एक्सट्रीम पॉइंट्स', icon: Target, description: 'Balanced performance', speed: 'Medium', quality: 'Better' },
  { id: 'genetic', name: 'Genetic Algorithm', nameHi: 'जेनेटिक', icon: Brain, description: 'Best optimization', speed: 'Slow', quality: 'Best' },
]

// Memoized Packing Stats Component to prevent unnecessary re-renders
const PackingStats = memo(({ 
  selectedRecommendation, 
  lang 
}: { 
  selectedRecommendation: TruckRecommendation
  lang: Language 
}) => {
  const stats = useMemo(() => ({
    itemsPacked: `${selectedRecommendation.itemsFit}/${selectedRecommendation.totalItems}`,
    volumeUsed: formatPercent(selectedRecommendation.volumeUtilization),
    weightUsed: formatPercent(selectedRecommendation.weightUtilization),
    estCost: formatCurrency(selectedRecommendation.estimatedCost),
    unfitItems: selectedRecommendation.unfitItems
  }), [selectedRecommendation])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
        <p className="text-xs text-slate-500">{t[lang].itemsPacked}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.itemsPacked}</p>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
        <p className="text-xs text-slate-500">{t[lang].volumeUsed}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.volumeUsed}</p>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
        <p className="text-xs text-slate-500">{t[lang].weightUsed}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.weightUsed}</p>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
        <p className="text-xs text-slate-500">{t[lang].estCost}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.estCost}</p>
      </div>
    </div>
  )
})

PackingStats.displayName = 'PackingStats'

// Memoized recommendation cards to prevent unnecessary re-renders
const RecommendationCard = memo(({
  rec,
  index,
  isSelected,
  onSelect,
  lang
}: {
  rec: TruckRecommendation
  index: number
  isSelected: boolean
  onSelect: () => void
  lang: Language
}) => {
  return (
    <button
      onClick={onSelect}
      className={`p-4 rounded-xl text-left transition-all border-2 relative ${
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 shadow-lg'
          : 'bg-slate-50 dark:bg-slate-800 border-transparent hover:border-slate-200'
      }`}
    >
      {index === 0 && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full shadow-lg">
          {t[lang].best}
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <Truck className={`w-5 h-5 ${index === 0 ? 'text-amber-500' : 'text-slate-400'}`} />
        <span className="font-semibold text-slate-900 dark:text-white">{lang === 'en' ? rec.truck.name : rec.truck.nameHi}</span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">{t[lang].itemsFit}</span>
          <span className={`font-medium ${
            rec.itemsFit === rec.totalItems ? 'text-green-600' : 'text-amber-600'
          }`}>
            {rec.itemsFit}/{rec.totalItems}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">{t[lang].volume}</span>
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
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{formatPercent(rec.volumeUtilization)}</span>
          </div>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">{t[lang].estCost}</span>
          <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(rec.estimatedCost)}</span>
        </div>
      </div>
      {rec.unfitItems.length > 0 && (
        <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {rec.unfitItems.length} {t[lang].wontFit}
          </p>
        </div>
      )}
    </button>
  )
})

RecommendationCard.displayName = 'RecommendationCard'

// ============= MAIN COMPONENT =============
export default function PackingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const { language } = useLanguageStore()
  const { isExpired, checkLimit, showUpgradePrompt } = useSubscription()
  const isAdmin = user?.role === 'admin'

  const [lang, setLang] = useState<Language>('en')
  const [mode, setMode] = useState<'manual' | 'smart'>('smart')
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [algorithm, setAlgorithm] = useState('extreme_points')
  const [trucks, setTrucks] = useState<TruckType[]>([])
  const [loadingTrucks, setLoadingTrucks] = useState(true)
  const [saleOrderItems, setSaleOrderItems] = useState<SaleOrderItem[]>([])
  const [linkedSaleOrderId, setLinkedSaleOrderId] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<TruckRecommendation[]>([])
  const [selectedRecommendation, setSelectedRecommendation] = useState<TruckRecommendation | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<Partial<SaleOrderItem>>({
    name: '', length: 0, width: 0, height: 0, weight: 0, quantity: 1, fragile: false, stackable: true
  })
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [expandedSection, setExpandedSection] = useState<string | null>('items')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Booking modal state
  const [showBookModal, setShowBookModal] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [, setLoadingCustomers] = useState(false)
  const [bookForm, setBookForm] = useState({
    origin: '',
    destination: '',
    customerId: '',
    driverName: '',
    driverPhone: '',
    vehicleNumber: ''
  })
  const [bookError, setBookError] = useState('')
  const [bookingInProgress, setBookingInProgress] = useState(false)

  // Web Worker for client-side algorithm processing
  const { runPacking, runRecommendation, isSupported: workerSupported, terminate } = usePackingWorker()
  
  // Cleanup: Terminate worker on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      terminate()
    }
  }, [terminate])

  // Set document title based on language
  useEffect(() => {
    document.title = lang === 'en' ? '3D Packing - TruckOpti' : '3D पैकिंग - TruckOpti'
  }, [lang])

  // Pre-populate items if navigated from SaleOrdersPage — validate each item before accepting
  useEffect(() => {
    const state = location.state as { saleOrderItems?: SaleOrderItem[]; saleOrderId?: string } | null
    if (state?.saleOrderItems && state.saleOrderItems.length > 0) {
      const validItems = state.saleOrderItems.filter(
        (item) => item.length > 0 && item.width > 0 && item.height > 0 && item.weight > 0 && item.quantity > 0
      )
      const dropped = state.saleOrderItems.length - validItems.length
      if (dropped > 0) {
        toast.error(`${dropped} item(s) from sale order skipped due to invalid dimensions`)
      }
      setSaleOrderItems(validItems)
      if (state.saleOrderId) setLinkedSaleOrderId(state.saleOrderId)
      if (validItems.length > 0) toast.success(`${validItems.length} items loaded from sale order`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch trucks from Supabase on mount
  useEffect(() => {
    fetchTrucks()
  }, [])

  const fetchTrucks = async () => {
    try {
      setLoadingTrucks(true)
      const data = await trucksSupabaseApi.getAll()
      const mappedTrucks: TruckType[] = data
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          nameHi: t.name_hi || t.name,
          dimensions: { length: t.length / 100, width: t.width / 100, height: t.height / 100 },
          capacity: t.capacity,
          costPerKm: t.cost_per_km,
          available: t.available
        }))
        .filter((truck: TruckType) =>
          truck.dimensions.length > 0 &&
          truck.dimensions.width > 0 &&
          truck.dimensions.height > 0 &&
          truck.capacity > 0
        )
      setTrucks(mappedTrucks)
    } catch (error) {
      logger.error('Failed to fetch trucks:', error)
      toast.error('Failed to load trucks')
    } finally {
      setLoadingTrucks(false)
    }
  }

  const totalStats = useMemo(() => {
    const totalItems = saleOrderItems.reduce((sum, item) => sum + item.quantity, 0)
    const totalWeight = saleOrderItems.reduce((sum, item) => sum + item.weight * item.quantity, 0)
    const totalVolume = saleOrderItems.reduce((sum, item) => 
      sum + (item.length * item.width * item.height * item.quantity) / 1000000, 0
    )
    return { totalItems, totalWeight, totalVolume: totalVolume.toFixed(2) }
  }, [saleOrderItems])

  const currentTruck = trucks.find(t => t.id === selectedTruck)

  // Validation using Zod
  const validateItem = (item: Partial<SaleOrderItem>): Record<string, string> => {
    // Transform to match Zod schema
    const itemData: Partial<ItemInput> = {
      product_name: item.name,
      length: item.length,
      width: item.width,
      height: item.height,
      weight: item.weight,
      quantity: item.quantity,
      fragile: item.fragile,
      stackable: item.stackable
    }
    
    // Use Zod schema for validation
    const errors = getFieldErrors(itemSchema, itemData)
    
    // Map 'product_name' error back to 'name' for UI compatibility
    if (errors.product_name && !errors.name) {
      errors.name = errors.product_name
      delete errors.product_name
    }
    
    return errors
  }

  const handleAddItem = useCallback(() => {
    const errors = validateItem(newItem)
    setValidationErrors(errors)
    
    if (Object.keys(errors).length > 0) {
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
    setValidationErrors({})
    toast.success('Item added!')
  }, [newItem, lang])

  const handleEditItem = (item: SaleOrderItem) => {
    setNewItem({ ...item })
    setEditingItem(item.id)
    setShowItemForm(true)
  }

  const handleUpdateItem = useCallback(() => {
    const errors = validateItem(newItem)
    setValidationErrors(errors)
    
    if (Object.keys(errors).length > 0) {
      return
    }
    
    if (!editingItem) return
    
    setSaleOrderItems(prev => prev.map(item => 
      item.id === editingItem 
        ? { ...item, ...newItem } as SaleOrderItem
        : item
    ))
    setNewItem({ name: '', length: 0, width: 0, height: 0, weight: 0, quantity: 1, fragile: false, stackable: true })
    setShowItemForm(false)
    setEditingItem(null)
    setValidationErrors({})
    toast.success('Item updated!')
  }, [newItem, editingItem])

  const handleRemoveItem = useCallback((id: string) => {
    setSaleOrderItems(prev => prev.filter(item => item.id !== id))
    toast.success('Item removed')
  }, [])

  const handleSmartRecommend = useCallback(async () => {
    if (saleOrderItems.length === 0) {
      toast.error('Add items to get recommendations')
      return
    }

    if (trucks.length === 0) {
      toast.error('No trucks available')
      return
    }

    // Check subscription limit before running optimization
    const allowed = await checkLimit('packing_optimizations')
    if (!allowed) {
      showUpgradePrompt('packing optimizations')
      return
    }
    
    setIsProcessing(true)
    toast.loading('Processing on your device...', { id: 'recommend', icon: '💻' })
    
    try {
      if (workerSupported) {
        // Use Web Worker (runs on user's CPU, not server)
        const recs = await runRecommendation(saleOrderItems, trucks, algorithm) as TruckRecommendation[]
        setRecommendations(recs)
        if (recs.length > 0) {
          setSelectedRecommendation(recs[0])
          setSelectedTruck(recs[0].truck.id)
          toast.success(`Found ${recs.length} truck options! (processed locally)`, { id: 'recommend' })
        } else {
          toast.error('No suitable truck found.', { id: 'recommend' })
        }
      } else {
        // Fallback: run on main thread  
        const recs = recommendTrucks(saleOrderItems, algorithm, trucks)
        setRecommendations(recs)
        if (recs.length > 0) {
          setSelectedRecommendation(recs[0])
          setSelectedTruck(recs[0].truck.id)
          toast.success(`Found ${recs.length} truck options!`, { id: 'recommend' })
        } else {
          toast.error('No suitable truck found.', { id: 'recommend' })
        }
      }
    } catch (_err) {
      // Fallback to main thread on error
      const recs = recommendTrucks(saleOrderItems, algorithm, trucks)
      setRecommendations(recs)
      if (recs.length > 0) {
        setSelectedRecommendation(recs[0])
        setSelectedTruck(recs[0].truck.id)
        toast.success(`Found ${recs.length} truck options!`, { id: 'recommend' })
      }
    } finally {
      setIsProcessing(false)
    }
  }, [saleOrderItems, algorithm, trucks, workerSupported, runRecommendation])

  const handleManualPack = useCallback(async () => {
    if (!selectedTruck || saleOrderItems.length === 0) {
      toast.error('Select truck and add items')
      return
    }
    
    setIsProcessing(true)
    
    const truck = trucks.find(t => t.id === selectedTruck)!
    
    try {
      let packed: PackedBox[], unpacked: string[]
      
      if (workerSupported) {
        // Use Web Worker (runs on user's CPU)
        const result = await runPacking(truck, saleOrderItems, algorithm)
        packed = result.packed
        unpacked = result.unpacked
        toast.success(`Packed ${packed.length} items in ${result.duration}ms (on your device)`, { icon: '💻' })
      } else {
        // Fallback: main thread
        const packer = new AdvancedBinPacker(truck, saleOrderItems, algorithm)
        const result = packer.pack()
        packed = result.packed
        unpacked = result.unpacked
        toast.success(`Packed ${packed.length} items!`)
      }
      
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
    } catch (_err) {
      // Fallback
      const packer = new AdvancedBinPacker(truck, saleOrderItems, algorithm)
      const { packed, unpacked } = packer.pack()
      const truckVolume = truck.dimensions.length * truck.dimensions.width * truck.dimensions.height
      const packedVolume = packed.reduce((sum, box) => sum + box.width * box.height * box.depth, 0)
      const packedWeight = saleOrderItems.reduce((sum, item) => sum + item.weight * item.quantity, 0)
      
      setSelectedRecommendation({
        truck,
        itemsFit: packed.length,
        totalItems: saleOrderItems.reduce((sum, item) => sum + item.quantity, 0),
        volumeUtilization: Math.round((packedVolume / truckVolume) * 100),
        weightUtilization: Math.round((packedWeight / truck.capacity) * 100),
        estimatedCost: truck.costPerKm * 100,
        packedBoxes: packed,
        unfitItems: unpacked
      })
      toast.success(`Packed ${packed.length} items!`)
    } finally {
      setIsProcessing(false)
    }
  }, [selectedTruck, saleOrderItems, algorithm, trucks, workerSupported, runPacking])

  const handleSavePackingJob = async () => {
    if (!selectedRecommendation) {
      toast.error('No packing result to save')
      return
    }

    try {
      setIsSaving(true)

      if (!user) {
        toast.error('Please login to save packing job')
        return
      }

      // Create packing job
      const job = await packingJobsSupabaseApi.createJob({
        user_id: user.id,
        truck_id: selectedRecommendation.truck.id,
        status: 'completed',
        items: [],
        volume_utilization: selectedRecommendation.volumeUtilization,
        weight_utilization: selectedRecommendation.weightUtilization,
        total_cost: selectedRecommendation.estimatedCost,
        algorithm,
        optimization_goal: 'space',
        result_data: {
          packed_boxes: selectedRecommendation.packedBoxes,
          unfit_items: selectedRecommendation.unfitItems,
          items_fit: selectedRecommendation.itemsFit,
          total_items: selectedRecommendation.totalItems
        }
      })

      // Add packing items
      const packingItems = saleOrderItems.map(item => ({
        job_id: job.id!,
        name: item.name,
        length: item.length,
        width: item.width,
        height: item.height,
        weight: item.weight,
        quantity: item.quantity,
        fragile: item.fragile,
        stackable: item.stackable
      }))

      await packingJobsSupabaseApi.addJobItems(packingItems)

      toast.success('Packing job saved successfully!')
    } catch (error: any) {
      logger.error('Failed to save packing job:', error)
      toast.error(lang === 'en' ? 'Failed to save packing job' : 'पैकिंग जॉब सेव करने में विफल')
    } finally {
      setIsSaving(false)
    }
  }

  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true)
      const data = await customersSupabaseApi.getAll()
      setCustomers(data)
    } catch (error) {
      logger.error('Failed to fetch customers:', error)
    } finally {
      setLoadingCustomers(false)
    }
  }

  const handleBookTruckClick = () => {
    if (!selectedRecommendation) {
      toast.error('No truck selected')
      return
    }
    
    fetchCustomers()
    setShowBookModal(true)
  }

  const handleBookTruckSubmit = async () => {
    if (!selectedRecommendation) {
      setBookError('No truck selected')
      return
    }

    // Validate form
    if (!bookForm.origin.trim()) {
      setBookError('Please enter origin city')
      return
    }
    if (!bookForm.destination.trim()) {
      setBookError('Please enter destination city')
      return
    }

    setBookingInProgress(true)
    setBookError('')

    try {

      if (!user) {
        setBookError('Please login to book truck')
        return
      }

      // Create shipment with complete data
      await shipmentsSupabaseApi.create({
        shipment_id: `SHP-${Date.now()}`,
        customer_id: bookForm.customerId || '',
        created_by: user.id,  // Required for RLS policy
        truck_id: selectedRecommendation.truck.id,
        origin: bookForm.origin,
        destination: bookForm.destination,
        status: 'pending',
        total_weight: saleOrderItems.reduce((sum, item) => sum + item.weight * item.quantity, 0),
        total_volume: saleOrderItems.reduce((sum, item) => sum + (item.length * item.width * item.height * item.quantity) / 1000000, 0),
        estimated_cost: selectedRecommendation.estimatedCost,
        driver_name: bookForm.driverName || null,
        driver_phone: bookForm.driverPhone ? `+91${bookForm.driverPhone.replace(/^\+91/, '')}` : null,
        vehicle_number: bookForm.vehicleNumber || null,
        latitude: null,
        longitude: null,
        sale_order_id: linkedSaleOrderId || null
      })

      // Update sale order status to processing
      if (linkedSaleOrderId) {
        try {
          await saleOrdersSupabaseApi.updateStatus(linkedSaleOrderId, 'processing')
        } catch { /* non-critical */ }
      }

      toast.success(`${selectedRecommendation.truck.name} booked successfully!`)
      // Create booking notification
      try {
        await notificationsSupabaseApi.create({
          title: 'Truck Booked',
          message: `${selectedRecommendation.truck.name} booked for ${bookForm.origin} → ${bookForm.destination}`,
          type: 'success',
          action_url: '/tracking',
          action_label: 'Track Shipment'
        })
      } catch { /* non-critical */ }
      setShowBookModal(false)
      setBookForm({
        origin: '',
        destination: '',
        customerId: '',
        driverName: '',
        driverPhone: '',
        vehicleNumber: ''
      })
      navigate('/tracking')
    } catch (error: any) {
      logger.error('Failed to book truck:', error)
      console.error('[PackingPage]', error)
      setBookError(language === 'en' ? 'Failed to book truck.' : 'ट्रक बुक करने में विफल।')
    } finally {
      setBookingInProgress(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  // Subscription expired check - block expired users
  if (!isAdmin && isExpired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-2">
          {language === 'en' ? 'Subscription Expired' : 'सदस्यता समाप्त'}
        </h2>
        <p className="text-gray-600 mb-6">
          {language === 'en'
            ? 'Your trial has ended. Upgrade to continue using 3D packing.'
            : 'आपका परीक्षण समाप्त हो गया है। 3D पैकिंग जारी रखने के लिए अपग्रेड करें।'}
        </p>
        <button
          onClick={() => navigate('/pricing')}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold"
        >
          {language === 'en' ? 'View Plans' : 'प्लान देखें'}
        </button>
      </div>
    )
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
                {t[lang].title}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {t[lang].subtitle}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                <Globe className="w-4 h-4" />
                {lang === 'en' ? 'हिंदी' : 'English'}
              </button>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setMode('smart')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    mode === 'smart' 
                      ? 'bg-primary-600 text-white shadow-md' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Wand2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{t[lang].smartMode}</span>
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
                  <span className="hidden sm:inline">{t[lang].manualMode}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          
          {/* Left Panel - Items & Controls */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            
            {/* Sale Order Items */}
            <div className="card overflow-hidden">
              <button 
                onClick={() => toggleSection('items')}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary-500" />
                  {t[lang].saleOrderItems}
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
                    <p className="text-xs text-slate-500">{t[lang].itemName}</p>
                    <p className="font-bold text-slate-900 dark:text-white">{totalStats.totalItems}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500">{t[lang].weight}</p>
                    <p className="font-bold text-slate-900 dark:text-white">{totalStats.totalWeight}kg</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500">{t[lang].volume}</p>
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
                        style={{ backgroundColor: PACKING_COLORS[idx % PACKING_COLORS.length] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {item.name} <span className="text-slate-500">×{item.quantity}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.length}×{item.width}×{item.height}cm • {item.weight}kg
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Add Item Form */}
                {showItemForm ? (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pt-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder={t[lang].itemName}
                          value={newItem.name}
                          onChange={e => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                          className={`input text-sm w-full ${validationErrors.name ? 'border-red-500' : ''}`}
                        />
                        {validationErrors.name && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.name}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder={t[lang].length}
                          value={newItem.length || ''}
                          onChange={e => setNewItem(prev => ({ ...prev, length: +e.target.value }))}
                          className={`input text-sm w-full ${validationErrors.length ? 'border-red-500' : ''}`}
                        />
                        {validationErrors.length && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.length}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder={t[lang].width}
                          value={newItem.width || ''}
                          onChange={e => setNewItem(prev => ({ ...prev, width: +e.target.value }))}
                          className={`input text-sm w-full ${validationErrors.width ? 'border-red-500' : ''}`}
                        />
                        {validationErrors.width && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.width}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder={t[lang].height}
                          value={newItem.height || ''}
                          onChange={e => setNewItem(prev => ({ ...prev, height: +e.target.value }))}
                          className={`input text-sm w-full ${validationErrors.height ? 'border-red-500' : ''}`}
                        />
                        {validationErrors.height && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.height}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder={t[lang].weight}
                          value={newItem.weight || ''}
                          onChange={e => setNewItem(prev => ({ ...prev, weight: +e.target.value }))}
                          className={`input text-sm w-full ${validationErrors.weight ? 'border-red-500' : ''}`}
                        />
                        {validationErrors.weight && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.weight}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder={t[lang].qty}
                          value={newItem.quantity || ''}
                          onChange={e => setNewItem(prev => ({ ...prev, quantity: +e.target.value }))}
                          className={`input text-sm w-full ${validationErrors.quantity ? 'border-red-500' : ''}`}
                          min={1}
                        />
                        {validationErrors.quantity && (
                          <p className="text-xs text-red-500 mt-1">{validationErrors.quantity}</p>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={newItem.stackable}
                          onChange={e => setNewItem(prev => ({ ...prev, stackable: e.target.checked }))}
                          className="rounded text-primary-600"
                        />
                        {t[lang].stackable}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={newItem.fragile}
                          onChange={e => setNewItem(prev => ({ ...prev, fragile: e.target.checked }))}
                          className="rounded text-primary-600"
                        />
                        {t[lang].fragile}
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setShowItemForm(false)
                          setEditingItem(null)
                          setNewItem({ name: '', length: 0, width: 0, height: 0, weight: 0, quantity: 1, fragile: false, stackable: true })
                          setValidationErrors({})
                        }} 
                        className="btn btn-secondary flex-1 py-2"
                      >
                        <X className="w-4 h-4" />
                        {lang === 'en' ? 'Cancel' : 'रद्द करें'}
                      </button>
                      <button 
                        onClick={editingItem ? handleUpdateItem : handleAddItem} 
                        className="btn btn-primary flex-1 py-2"
                      >
                        <Check className="w-4 h-4" />
                        {editingItem ? (lang === 'en' ? 'Update' : 'अपडेट') : t[lang].addItem}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-4">
                    <button
                      onClick={() => setShowItemForm(true)}
                      className="btn btn-outline w-full py-2"
                    >
                      <Plus className="w-4 h-4" />
                      {t[lang].addItem}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Algorithm Selection */}
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary-500" />
                {t[lang].algorithm}
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
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{lang === 'en' ? algo.name : algo.nameHi}</span>
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
                  {t[lang].selectTruck}
                </h3>
                {loadingTrucks ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {trucks.map(truck => (
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
                            <p className="font-medium text-slate-900 dark:text-white">{lang === 'en' ? truck.name : truck.nameHi}</p>
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
                )}
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={mode === 'smart' ? handleSmartRecommend : handleManualPack}
              disabled={saleOrderItems.length === 0 || (mode === 'manual' && !selectedTruck) || isProcessing || loadingTrucks}
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
                  {t[lang].findBestTruck}
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  {t[lang].optimizePacking}
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
                  {t[lang].recommendedTrucks}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {recommendations.map((rec, idx) => (
                    <RecommendationCard
                      key={rec.truck.id}
                      rec={rec}
                      index={idx}
                      isSelected={selectedRecommendation?.truck.id === rec.truck.id}
                      onSelect={() => {
                        setSelectedRecommendation(rec)
                        setSelectedTruck(rec.truck.id)
                      }}
                      lang={lang}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 3D Visualization */}
            <div className="card overflow-hidden">
              {selectedRecommendation || (currentTruck && mode === 'manual') ? (
                <Suspense fallback={
                  <div className="h-64 lg:h-96 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {lang === 'en' ? 'Loading 3D view...' : '3D व्यू लोड हो रहा है...'}
                      </p>
                    </div>
                  </div>
                }>
                  <TruckViewer
                    truckDimensions={selectedRecommendation?.truck.dimensions || currentTruck!.dimensions}
                    packedBoxes={selectedRecommendation?.packedBoxes || []}
                  />
                </Suspense>
              ) : (
                <div className="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 h-64 lg:h-96 flex items-center justify-center">
                  <div className="text-center px-4">
                    <div className="w-16 h-16 bg-white dark:bg-slate-700 rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4">
                      <Layers className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {mode === 'smart' ? t[lang].smartPrompt : t[lang].selectTruckPrompt}
                    </h3>
                  </div>
                </div>
              )}
            </div>

            {/* Packing Details */}
            {selectedRecommendation && (
              <div className="card p-4 animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-primary-500" />
                    {t[lang].packingDetails}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSavePackingJob}
                      disabled={isSaving}
                      className="btn btn-secondary py-2 px-4"
                    >
                      {isSaving ? (
                        <div className="spinner w-4 h-4" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {t[lang].saveJob}
                    </button>
                    <button
                      onClick={handleBookTruckClick}
                      className="btn btn-primary py-2 px-4"
                    >
                      <ArrowRight className="w-4 h-4" />
                      {t[lang].book} {lang === 'en' ? selectedRecommendation.truck.name : selectedRecommendation.truck.nameHi}
                    </button>
                  </div>
                </div>
                
                {/* Memoized packing stats for better performance */}
                <PackingStats selectedRecommendation={selectedRecommendation} lang={lang} />
                
                {selectedRecommendation.unfitItems.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {t[lang].itemsWontFit}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                      {selectedRecommendation.unfitItems.slice(0, 5).join(', ')}
                      {selectedRecommendation.unfitItems.length > 5 && ` +${selectedRecommendation.unfitItems.length - 5} more`}
                    </p>
                    <p className="text-xs text-amber-500 mt-2">{t[lang].additionalTruck}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Book Truck Modal */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {lang === 'hi' ? 'ट्रक बुक करें' : 'Book Truck'}
              </h3>
              <button
                onClick={() => setShowBookModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bookError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{bookError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'hi' ? 'ग्राहक चुनें' : 'Select Customer'}
                </label>
                <select
                  value={bookForm.customerId}
                  onChange={e => setBookForm(prev => ({ ...prev, customerId: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">{lang === 'hi' ? 'ग्राहक चुनें' : 'Select Customer'}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'hi' ? 'प्रस्थान स्थान' : 'Origin'}
                </label>
                <input
                  type="text"
                  value={bookForm.origin}
                  onChange={e => setBookForm(prev => ({ ...prev, origin: e.target.value }))}
                  placeholder={lang === 'hi' ? 'जैसे: मुंबई, महाराष्ट्र' : 'e.g., Mumbai, Maharashtra'}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'hi' ? 'गंतव्य स्थान' : 'Destination'}
                </label>
                <input
                  type="text"
                  value={bookForm.destination}
                  onChange={e => setBookForm(prev => ({ ...prev, destination: e.target.value }))}
                  placeholder={lang === 'hi' ? 'जैसे: दिल्ली, एनसीआर' : 'e.g., Delhi, NCR'}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowBookModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              >
                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                onClick={handleBookTruckSubmit}
                disabled={bookingInProgress}
                className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {bookingInProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {lang === 'hi' ? 'बुकिंग...' : 'Booking...'}
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4" />
                    {lang === 'hi' ? 'बुक करें' : 'Book Truck'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
