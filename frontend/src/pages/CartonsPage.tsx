import { useState, useEffect } from 'react'
import { Package, Plus, Edit2, Trash2, ChevronLeft, Search, X, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cartonsApi } from '../services/api'

interface CartonType {
  id: number
  name: string
  length: number
  width: number
  height: number
  weight: number
  category: string
}

export default function CartonsPage() {
  const navigate = useNavigate()
  const [cartons, setCartons] = useState<CartonType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCarton, setEditingCarton] = useState<CartonType | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    length: 0,
    width: 0,
    height: 0,
    weight: 0,
    category: 'Standard'
  })

  useEffect(() => {
    fetchCartons()
  }, [])

  const fetchCartons = async () => {
    try {
      setLoading(true)
      const data = await cartonsApi.getAll()
      setCartons(data)
    } catch (error) {
      console.error('Failed to fetch cartons:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (carton?: CartonType) => {
    if (carton) {
      setEditingCarton(carton)
      setFormData({
        name: carton.name,
        length: carton.length,
        width: carton.width,
        height: carton.height,
        weight: carton.weight,
        category: carton.category
      })
    } else {
      setEditingCarton(null)
      setFormData({
        name: '',
        length: 0,
        width: 0,
        height: 0,
        weight: 0,
        category: 'Standard'
      })
    }
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    try {
      if (editingCarton) {
        await cartonsApi.update(editingCarton.id, formData)
      } else {
        await cartonsApi.create(formData)
      }
      setIsModalOpen(false)
      fetchCartons()
    } catch (error) {
      console.error('Failed to save carton:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this carton type?')) {
      try {
        await cartonsApi.delete(id)
        fetchCartons()
      } catch (error) {
        console.error('Failed to delete carton:', error)
      }
    }
  }

  const filteredCartons = cartons.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/management')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Carton Types</h1>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search cartons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
          />
        </div>
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
          <p className="text-slate-500">Loading carton data...</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCartons.map((carton) => (
            <div 
              key={carton.id}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl text-emerald-600">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{carton.name}</h3>
                    <p className="text-xs text-slate-500">{carton.category}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleOpenModal(carton)}
                    className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(carton.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Dimensions</p>
                  <p className="text-sm font-medium">{carton.length}x{carton.width}x{carton.height}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Weight</p>
                  <p className="text-sm font-medium">{carton.weight}kg</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Volume</p>
                  <p className="text-sm font-medium">{(carton.length * carton.width * carton.height / 1000).toFixed(1)}L</p>
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
              <h2 className="text-xl font-bold">{editingCarton ? 'Edit Carton' : 'Add New Carton'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Carton Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="e.g. Small Box, Large Crate"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option>Standard</option>
                    <option>Fragile</option>
                    <option>Heavy Duty</option>
                    <option>Perishable</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => setFormData({...formData, weight: Number(e.target.value)})}
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
                className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 shadow-lg shadow-primary-600/20 flex items-center justify-center gap-2 transition-all"
              >
                <Save className="w-4 h-4" />
                Save Carton
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
