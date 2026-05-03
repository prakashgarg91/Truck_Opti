import { useState, useEffect } from 'react'
import { Package, Plus, Edit2, Trash2, ChevronLeft, Search, X, Save, AlertTriangle, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { cartonsSupabaseApi } from '../services/supabaseApi'
import { useLanguageStore } from '../stores/languageStore'
import { itemSchema, validateWithZod } from '../utils/validators'
import { queryClient } from '../lib/queryClient'
import EmptyState from '../components/EmptyState'
import toast from 'react-hot-toast'

interface CartonType {
  id: string
  name: string
  length: number
  width: number
  height: number
  weight: number
  fragile: boolean
  stackable: boolean
}

export default function CartonsPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCarton, setEditingCarton] = useState<CartonType | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    length: 0,
    width: 0,
    height: 0,
    weight: 0,
    fragile: false,
    stackable: true
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    document.title = 'Carton Types - TruckOpti'
  }, [language])

  // React Query: Fetch cartons data
  const {
    data: cartons = [],
    isLoading: loading,
    isError: loadError
  } = useQuery({
    queryKey: ['cartons'],
    queryFn: cartonsSupabaseApi.getAll,
  })

  // React Query: Create carton mutation
  const createMutation = useMutation({
    mutationFn: cartonsSupabaseApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartons'] })
      toast.success('Carton type added')
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: Error) => {
      void error
      toast.error('Failed to create carton')
    },
  })

  // React Query: Update carton mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CartonType> }) =>
      cartonsSupabaseApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartons'] })
      toast.success('Carton type updated')
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: Error) => {
      void error
      toast.error('Failed to update carton')
    },
  })

  // React Query: Delete carton mutation
  const deleteMutation = useMutation({
    mutationFn: cartonsSupabaseApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartons'] })
      toast.success('Carton type deleted')
    },
    onError: (error: Error) => {
      void error
      toast.error('Failed to delete carton')
    },
  })

  const resetForm = () => {
    setEditingCarton(null)
    setFormData({
      name: '',
      length: 0,
      width: 0,
      height: 0,
      weight: 0,
      fragile: false,
      stackable: true
    })
    setErrors({})
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
        fragile: carton.fragile,
        stackable: carton.stackable
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Map form data to schema format (name -> product_name, add quantity default)
    const validationData = {
      product_name: formData.name,
      length: formData.length,
      width: formData.width,
      height: formData.height,
      weight: formData.weight,
      quantity: 1, // Default quantity for carton types
      fragile: formData.fragile,
      stackable: formData.stackable
    }

    const result = validateWithZod(itemSchema, validationData)

    if (!result.success) {
      // Map schema field names back to form field names for display
      const formattedErrors = result.errors?.reduce((acc: Record<string, string>, err: string) => {
        const [field, msg] = err.split(': ')
        // Map product_name back to name for display
        const formField = field === 'product_name' ? 'name' : field
        acc[formField] = msg
        return acc
      }, {}) || {}
      setErrors(formattedErrors)
      return
    }

    // Clear errors and proceed with save
    setErrors({})

    if (editingCarton) {
      updateMutation.mutate({ id: editingCarton.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this carton type?')) {
      deleteMutation.mutate(id)
    }
  }

  const filteredCartons = cartons.filter((c: CartonType) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-8 md:pb-12">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/management')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {'Carton Types'}
        </h1>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder={'Search cartons...'}
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
      ) : loadError ? (
        <EmptyState
          icon={Package}
          title={'Failed to load cartons'}
          description={'Please check your connection and try again'}
          actionLabel={'Add Carton Type'}
          onAction={() => handleOpenModal()}
        />
      ) : filteredCartons.length === 0 ? (
        <EmptyState
          icon={Package}
          title={'No carton types found'}
          description={
            search
              ? ('Try adjusting your search')
              : ('Add your first carton type to get started')
          }
          actionLabel={!search ? ('Add Carton Type') : undefined}
          onAction={!search ? () => handleOpenModal() : undefined}
        />
      ) : (
        <div className="grid gap-4">
          {filteredCartons.map((carton: CartonType) => (
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
                    <div className="flex gap-2 mt-1">
                      {carton.fragile && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Fragile
                        </span>
                      )}
                      {carton.stackable && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                          <Layers className="w-3 h-3" /> Stackable
                        </span>
                      )}
                    </div>
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
                    disabled={deleteMutation.isPending}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-50"
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
                  <p className="text-sm font-medium">{carton.weight} kg</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center">
                  <p className="text-[10px] uppercase text-slate-400 font-bold">Volume</p>
                  <p className="text-sm font-medium">{((carton.length * carton.width * carton.height) / 1000000).toFixed(3)} m³</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingCarton
                  ? ('Edit Carton Type')
                  : ('Add Carton Type')
                }
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {'Name'}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 rounded-xl border ${errors.name ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'} focus:ring-2 focus:ring-primary-500 outline-none`}
                  placeholder={'e.g., Standard Box'}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {'Length (cm)'}
                  </label>
                  <input
                    type="number"
                    value={formData.length || ''}
                    onChange={(e) => setFormData({ ...formData, length: Number(e.target.value) })}
                    className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-xl border ${errors.length ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'} focus:ring-2 focus:ring-primary-500 outline-none`}
                  />
                  {errors.length && <p className="mt-1 text-xs text-red-500">{errors.length}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {'Width (cm)'}
                  </label>
                  <input
                    type="number"
                    value={formData.width || ''}
                    onChange={(e) => setFormData({ ...formData, width: Number(e.target.value) })}
                    className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-xl border ${errors.width ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'} focus:ring-2 focus:ring-primary-500 outline-none`}
                  />
                  {errors.width && <p className="mt-1 text-xs text-red-500">{errors.width}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {'Height (cm)'}
                  </label>
                  <input
                    type="number"
                    value={formData.height || ''}
                    onChange={(e) => setFormData({ ...formData, height: Number(e.target.value) })}
                    className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-xl border ${errors.height ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'} focus:ring-2 focus:ring-primary-500 outline-none`}
                  />
                  {errors.height && <p className="mt-1 text-xs text-red-500">{errors.height}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {'Weight (kg)'}
                </label>
                <input
                  type="number"
                  value={formData.weight || ''}
                  onChange={(e) => setFormData({ ...formData, weight: Number(e.target.value) })}
                  className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 rounded-xl border ${errors.weight ? 'border-red-500' : 'border-slate-200 dark:border-slate-600'} focus:ring-2 focus:ring-primary-500 outline-none`}
                />
                {errors.weight && <p className="mt-1 text-xs text-red-500">{errors.weight}</p>}
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.fragile}
                    onChange={(e) => setFormData({ ...formData, fragile: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {'Fragile'}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.stackable}
                    onChange={(e) => setFormData({ ...formData, stackable: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {'Stackable'}
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                >
                  {'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isMutating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
