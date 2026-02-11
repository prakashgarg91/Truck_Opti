import { useState } from 'react'
import { Truck, Plus, Edit2, Trash2, ChevronLeft, Search, X, Save, Database } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { trucksSupabaseApi } from '../services/supabaseApi'
import { useLanguageStore } from '../stores/languageStore'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { queryClient } from '../lib/queryClient'

interface TruckType {
  id: string
  name: string
  name_hi?: string
  length: number
  width: number
  height: number
  capacity: number
  cost_per_km?: number
  available?: number
  category?: string
}

const DEFAULT_INDIAN_TRUCKS = [
  {
    name: 'Tata Ace 7.5ft',
    name_hi: 'टाटा एस 7.5 फुट',
    length: 228, // 7.5 ft in cm
    width: 152,  // 5 ft in cm
    height: 152, // 5 ft in cm
    capacity: 750,
    cost_per_km: 12,
    available: 10,
    category: 'Mini Truck'
  },
  {
    name: 'Tata 407 9ft',
    name_hi: 'टाटा 407 9 फुट',
    length: 274, // 9 ft in cm
    width: 183,  // 6 ft in cm
    height: 183, // 6 ft in cm
    capacity: 2500,
    cost_per_km: 18,
    available: 8,
    category: 'Light Commercial'
  },
  {
    name: 'Eicher 14ft',
    name_hi: 'आयशर 14 फुट',
    length: 427, // 14 ft in cm
    width: 198,  // 6.5 ft in cm
    height: 198, // 6.5 ft in cm
    capacity: 4000,
    cost_per_km: 22,
    available: 6,
    category: 'Medium Commercial'
  },
  {
    name: 'Eicher 17ft',
    name_hi: 'आयशर 17 फुट',
    length: 518, // 17 ft in cm
    width: 213,  // 7 ft in cm
    height: 213, // 7 ft in cm
    capacity: 6000,
    cost_per_km: 28,
    available: 5,
    category: 'Medium Commercial'
  },
  {
    name: 'Eicher 19ft',
    name_hi: 'आयशर 19 फुट',
    length: 579, // 19 ft in cm
    width: 213,  // 7 ft in cm
    height: 213, // 7 ft in cm
    capacity: 7500,
    cost_per_km: 32,
    available: 4,
    category: 'Heavy Commercial'
  },
  {
    name: 'BharatBenz 32ft',
    name_hi: 'भारतबेंज 32 फुट',
    length: 975, // 32 ft in cm
    width: 244,  // 8 ft in cm
    height: 244, // 8 ft in cm
    capacity: 15000,
    cost_per_km: 45,
    available: 3,
    category: 'Heavy Commercial'
  },
  {
    name: 'Tata LPT 3718 36ft',
    name_hi: 'टाटा एलपीटी 3718 36 फुट',
    length: 1097, // 36 ft in cm
    width: 259,   // 8.5 ft in cm
    height: 259,  // 8.5 ft in cm
    capacity: 20000,
    cost_per_km: 55,
    available: 2,
    category: 'Extra Heavy'
  }
]

export default function TrucksPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTruck, setEditingTruck] = useState<TruckType | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    name_hi: '',
    length: 0,
    width: 0,
    height: 0,
    capacity: 0,
    cost_per_km: 0,
    available: 1
  })

  // React Query: Fetch trucks data
  const { 
    data: trucks = [], 
    isLoading: loading
  } = useQuery({
    queryKey: ['trucks'],
    queryFn: trucksSupabaseApi.getAll,
  })

  // React Query: Create truck mutation
  const createMutation = useMutation({
    mutationFn: trucksSupabaseApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      toast.success('Truck added successfully')
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      console.error('Failed to create truck:', error)
      toast.error(error.message || 'Failed to create truck')
    },
  })

  // React Query: Update truck mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TruckType> }) =>
      trucksSupabaseApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      toast.success('Truck updated successfully')
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      console.error('Failed to update truck:', error)
      toast.error(error.message || 'Failed to update truck')
    },
  })

  // React Query: Delete truck mutation
  const deleteMutation = useMutation({
    mutationFn: trucksSupabaseApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      toast.success('Truck deleted successfully')
    },
    onError: (error: any) => {
      console.error('Failed to delete truck:', error)
      toast.error(error.message || 'Failed to delete truck')
    },
  })

  // React Query: Seed default trucks mutation
  const seedMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('Please login to seed trucks')
      }

      // Check if trucks already exist
      const { data: existingTrucks } = await supabase
        .from('trucks')
        .select('name')
        .in('name', DEFAULT_INDIAN_TRUCKS.map(t => t.name))

      const existingNames = new Set(existingTrucks?.map((t: any) => t.name) || [])
      const trucksToAdd = DEFAULT_INDIAN_TRUCKS.filter(t => !existingNames.has(t.name))

      if (trucksToAdd.length === 0) {
        throw new Error('All default trucks already exist!')
      }

      // Insert trucks
      const { error } = await supabase
        .from('trucks')
        .insert(trucksToAdd)

      if (error) throw error
      return trucksToAdd.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] })
      toast.success(`Added ${count} default Indian trucks!`)
    },
    onError: (error: any) => {
      console.error('Failed to seed trucks:', error)
      if (error.message === 'All default trucks already exist!') {
        toast(error.message)
      } else {
        toast.error(error.message || 'Failed to seed trucks')
      }
    },
  })

  const resetForm = () => {
    setEditingTruck(null)
    setFormData({
      name: '',
      name_hi: '',
      length: 0,
      width: 0,
      height: 0,
      capacity: 0,
      cost_per_km: 0,
      available: 1
    })
  }

  const handleOpenModal = (truck?: TruckType) => {
    if (truck) {
      setEditingTruck(truck)
      setFormData({
        name: truck.name,
        name_hi: truck.name_hi || '',
        length: truck.length,
        width: truck.width,
        height: truck.height,
        capacity: truck.capacity,
        cost_per_km: truck.cost_per_km || 0,
        available: truck.available || 1
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const handleSave = () => {
    if (editingTruck) {
      updateMutation.mutate({ id: editingTruck.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this truck type?')) {
      deleteMutation.mutate(id)
    }
  }

  const filteredTrucks = trucks.filter((t: TruckType) => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.name_hi && t.name_hi.toLowerCase().includes(search.toLowerCase()))
  )

  const formatDimension = (cm: number) => {
    const feet = cm / 30.48
    return `${Math.round(feet)}ft`
  }

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || seedMutation.isPending

  return (
    <div className="p-4 space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/management')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {language === 'en' ? 'Truck Types' : 'ट्रक प्रकार'}
        </h1>
      </div>

      {/* Seed Default Trucks Button */}
      {trucks.length === 0 && !loading && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6 text-center">
          <Database className="w-12 h-12 text-blue-500 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
            {language === 'en' ? 'No Trucks Found' : 'कोई ट्रक नहीं मिला'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {language === 'en' 
              ? 'Seed the database with 7 standard Indian truck types'
              : '7 मानक भारतीय ट्रक प्रकारों के साथ डेटाबेस सीड करें'}
          </p>
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="btn btn-primary"
          >
            {seedMutation.isPending ? (
              <>
                <div className="spinner w-4 h-4" />
                {language === 'en' ? 'Seeding...' : 'सीडिंग...'}
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                {language === 'en' ? 'Seed Default Trucks' : 'डिफॉल्ट ट्रक सीड करें'}
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder={language === 'en' ? 'Search trucks...' : 'ट्रक खोजें...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
          />
        </div>
        {trucks.length > 0 && (
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 p-2.5 rounded-xl transition-all"
            title={language === 'en' ? 'Seed default trucks' : 'डिफॉल्ट ट्रक सीड करें'}
          >
            {seedMutation.isPending ? <div className="spinner w-5 h-5" /> : <Database className="w-5 h-5" />}
          </button>
        )}
        <button 
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white p-2.5 rounded-xl shadow-lg shadow-primary-600/20 transition-all"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500">Loading fleet data...</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredTrucks.map((truck: TruckType) => (
            <div 
              key={truck.id}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{truck.name}</h3>
                    {truck.name_hi && <p className="text-xs text-slate-500">{truck.name_hi}</p>}
                    {truck.category && (
                      <span className="inline-block mt-1 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                        {truck.category}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleOpenModal(truck)}
                    disabled={isMutating}
                    className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(truck.id)}
                    disabled={deleteMutation.isPending}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="mt-4 grid grid-cols-4 gap-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Dimensions</p>
                  <p className="text-xs font-medium">{formatDimension(truck.length)} × {formatDimension(truck.width)} × {formatDimension(truck.height)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Capacity</p>
                  <p className="text-xs font-medium">{(truck.capacity / 1000).toFixed(1)}T</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Volume</p>
                  <p className="text-xs font-medium">{(truck.length * truck.width * truck.height / 1000000).toFixed(1)}m³</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Cost/km</p>
                  <p className="text-xs font-medium">₹{truck.cost_per_km || 0}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingTruck ? 'Edit Truck' : 'Add New Truck'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Truck Name (English)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="e.g. Tata 407, Eicher 10.50"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Truck Name (Hindi)</label>
                <input
                  type="text"
                  value={formData.name_hi}
                  onChange={(e) => setFormData({...formData, name_hi: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="e.g. टाटा 407"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Capacity (kg)</label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => setFormData({...formData, capacity: Number(e.target.value)})}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cost per km (₹)</label>
                  <input
                    type="number"
                    value={formData.cost_per_km}
                    onChange={(e) => setFormData({...formData, cost_per_km: Number(e.target.value)})}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Length (cm)</label>
                  <input
                    type="number"
                    value={formData.length}
                    onChange={(e) => setFormData({...formData, length: Number(e.target.value)})}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="e.g. 427 for 14ft"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Width (cm)</label>
                  <input
                    type="number"
                    value={formData.width}
                    onChange={(e) => setFormData({...formData, width: Number(e.target.value)})}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Height (cm)</label>
                  <input
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData({...formData, height: Number(e.target.value)})}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Available Count</label>
                <input
                  type="number"
                  value={formData.available}
                  onChange={(e) => setFormData({...formData, available: Number(e.target.value)})}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  min={0}
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 shadow-lg shadow-primary-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <div className="spinner w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Truck
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
