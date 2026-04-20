import { useState, useEffect } from 'react'
import { Users, Plus, Edit2, Trash2, ChevronLeft, Search, X, Save, MapPin, Phone, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { customersSupabaseApi } from '../services/supabaseApi'
import { useLanguageStore } from '../stores/languageStore'
import { useAuthStore } from '../stores/authStore'
import { customerSchema, getFieldErrors, type CustomerInput } from '../utils/validators'
import { queryClient } from '../lib/queryClient'
import EmptyState from '../components/EmptyState'
import toast from 'react-hot-toast'

interface Customer {
  id: string
  name: string
  email: string | null
  phone: string
  address: string
  city: string
  state?: string
  pincode?: string
  gst_number?: string | null
  pan_number: string
  created_by?: string
}

export default function CustomersPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gst_number: '',
    pan_number: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    document.title = language === 'en' ? 'Customers - TruckOpti' : 'ग्राहक - TruckOpti'
  }, [language])

  // React Query: Fetch customers data
  const {
    data: customers = [],
    isLoading: loading,
    isError: loadError
  } = useQuery({
    queryKey: ['customers'],
    queryFn: customersSupabaseApi.getAll,
  })

  // React Query: Create customer mutation
  const createMutation = useMutation({
    mutationFn: customersSupabaseApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(language === 'en' ? 'Customer added successfully' : 'ग्राहक सफलतापूर्वक जोड़ा गया')
      setIsModalOpen(false)
      resetForm()
    },
    onError: () => {
      toast.error(language === 'en' ? 'Failed to create customer' : 'ग्राहक बनाने में त्रुटि')
    },
  })

  // React Query: Update customer mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Customer> }) =>
      customersSupabaseApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(language === 'en' ? 'Customer updated successfully' : 'ग्राहक सफलतापूर्वक अपडेट किया गया')
      setIsModalOpen(false)
      resetForm()
    },
    onError: () => {
      toast.error(language === 'en' ? 'Failed to update customer' : 'ग्राहक अपडेट करने में त्रुटि')
    },
  })

  // React Query: Delete customer mutation
  const deleteMutation = useMutation({
    mutationFn: customersSupabaseApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(language === 'en' ? 'Customer deleted successfully' : 'ग्राहक सफलतापूर्वक हटा दिया गया')
    },
    onError: () => {
      toast.error(language === 'en' ? 'Failed to delete customer' : 'ग्राहक हटाने में त्रुटि')
    },
  })

  const resetForm = () => {
    setEditingCustomer(null)
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      gst_number: '',
      pan_number: ''
    })
    setErrors({})
  }

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer)
      setFormData({
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state || '',
        pincode: customer.pincode || '',
        gst_number: customer.gst_number || '',
        pan_number: customer.pan_number || ''
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const validateForm = (): boolean => {
    const customerData: CustomerInput = {
      name: formData.name,
      phone: formData.phone.startsWith('+91') ? formData.phone : `+91${formData.phone}`,
      email: formData.email || undefined,
      address: formData.address,
      city: formData.city,
      state: formData.state || '',
      pincode: formData.pincode,
      pan_number: formData.pan_number
    }

    const fieldErrors = getFieldErrors(customerSchema, customerData)

    // Additional GST validation if provided
    if (formData.gst_number && formData.gst_number.length > 0) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
      if (!gstRegex.test(formData.gst_number)) {
        fieldErrors.gst_number = 'Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)'
      }
    }

    if (formData.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan_number.toUpperCase())) {
      fieldErrors.pan_number = 'Invalid PAN format (e.g., ABCDE1234F)'
    }

    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  const handleSave = () => {
    if (!validateForm()) return

    const dataToSave = {
      name: formData.name,
      phone: formData.phone.startsWith('+91') ? formData.phone : `+91${formData.phone}`,
      email: formData.email || null,
      address: formData.address,
      city: formData.city,
      state: formData.state || '',
      pincode: formData.pincode || '',
      gst_number: formData.gst_number || null,
      pan_number: formData.pan_number.toUpperCase(),
      created_by: (!editingCustomer && user) ? user.id : undefined
    }

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: dataToSave })
    } else {
      createMutation.mutate(dataToSave as Customer)
    }
  }

  const handleDelete = (id: string) => {
    if (window.confirm(language === 'en' ? 'Are you sure you want to delete this customer?' : 'क्या आप वाकई इस ग्राहक को हटाना चाहते हैं?')) {
      deleteMutation.mutate(id)
    }
  }

  const filteredCustomers = customers.filter((c: Customer) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase())
  )

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6 pb-8 lg:pb-12">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/management')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {language === 'en' ? 'Customers' : 'ग्राहक'}
        </h1>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder={language === 'en' ? 'Search customers...' : 'ग्राहक खोजें...'}
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
          <p className="text-slate-500">Loading customer directory...</p>
        </div>
      ) : loadError ? (
        <EmptyState
          icon={Users}
          title={language === 'en' ? 'Failed to load customers' : 'ग्राहक लोड करने में विफल'}
          description={language === 'en' ? 'Please check your connection and try again' : 'कृपया अपना कनेक्शन जांचें और पुनः प्रयास करें'}
          actionLabel={language === 'en' ? 'Add Customer' : 'ग्राहक जोड़ें'}
          onAction={() => handleOpenModal()}
        />
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={language === 'en' ? 'No customers found' : 'कोई ग्राहक नहीं मिला'}
          description={
            search
              ? (language === 'en' ? 'Try adjusting your search' : 'अपनी खोज समायोजित करने का प्रयास करें')
              : (language === 'en' ? 'Add your first customer to get started' : 'शुरू करने के लिए अपना पहला ग्राहक जोड़ें')
          }
          actionLabel={!search ? (language === 'en' ? 'Add Customer' : 'ग्राहक जोड़ें') : undefined}
          onAction={!search ? () => handleOpenModal() : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredCustomers.map((customer: Customer) => (
            <div
              key={customer.id}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-100 dark:bg-orange-900/30 rounded-xl text-orange-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{customer.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {customer.city}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenModal(customer)}
                    disabled={isMutating}
                    className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(customer.id)}
                    disabled={deleteMutation.isPending}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Phone className="w-4 h-4 text-slate-400" />
                  {customer.phone}
                </div>
                {customer.email && (
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <Mail className="w-4 h-4 text-slate-400" />
                    {customer.email}
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Users className="w-4 h-4 text-slate-400" />
                  PAN: {customer.pan_number}
                </div>
                <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                  {customer.address}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingCustomer
                  ? (language === 'en' ? 'Edit Customer' : 'ग्राहक संपादित करें')
                  : (language === 'en' ? 'Add New Customer' : 'नया ग्राहक जोड़ें')
                }
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Full Name' : 'पूरा नाम'}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.name ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                  placeholder={language === 'en' ? 'e.g. Reliance Retail' : 'जैसे, रिलायंस रिटेल'}
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Phone' : 'फोन'}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.phone ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder="+91 98765 43210"
                  />
                  {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Email' : 'ईमेल'}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.email ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder="contact@company.com"
                  />
                  {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'City' : 'शहर'}
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.city ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder={language === 'en' ? 'e.g. Mumbai' : 'जैसे, मुंबई'}
                  />
                  {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'State' : 'राज्य'}
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.state ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder={language === 'en' ? 'e.g. Maharashtra' : 'जैसे, महाराष्ट्र'}
                  />
                  {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Pincode' : 'पिनकोड'}
                  </label>
                  <input
                    type="text"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.pincode ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder="400001"
                  />
                  {errors.pincode && <p className="text-red-500 text-sm mt-1">{errors.pincode}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'PAN Number' : 'पैन नंबर'}
                  </label>
                  <input
                    type="text"
                    value={formData.pan_number}
                    onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                    className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.pan_number ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                  {errors.pan_number && <p className="text-red-500 text-sm mt-1">{errors.pan_number}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'GSTIN (Optional)' : 'GSTIN (वैकल्पिक)'}
                </label>
                <input
                  type="text"
                  value={formData.gst_number}
                  onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${errors.gst_number ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                  placeholder="22AAAAA0000A1Z5"
                />
                {errors.gst_number && <p className="text-red-500 text-sm mt-1">{errors.gst_number}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Full Address' : 'पूरा पता'}
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none resize-none ${errors.address ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                  placeholder={language === 'en' ? 'Street address, Landmark' : 'सड़क पता, लैंडमार्क'}
                />
                {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                {language === 'en' ? 'Cancel' : 'रद्द करें'}
              </button>
              <button
                onClick={handleSave}
                disabled={isMutating}
                className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 shadow-lg shadow-primary-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isMutating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {language === 'en' ? 'Save Customer' : 'ग्राहक सहेजें'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
