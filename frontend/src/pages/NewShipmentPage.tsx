import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, MapPin, Calendar, Scale, FileText, DollarSign, ArrowLeft, Loader2, CheckCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useLanguageStore } from '../stores/languageStore'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const VEHICLE_TYPES = [
  { value: 'tata_407', label: 'Tata 407', capacity: '1.5 Ton' },
  { value: 'eicher_14ft', label: 'Eicher 14ft', capacity: '3 Ton' },
  { value: 'eicher_17ft', label: 'Eicher 17ft', capacity: '5 Ton' },
  { value: 'ashok_19ft', label: 'Ashok Leyland 19ft', capacity: '7 Ton' },
  { value: 'bharatbenz_24ft', label: 'BharatBenz 24ft', capacity: '10 Ton' },
  { value: 'bharatbenz_32ft', label: 'BharatBenz 32ft', capacity: '15 Ton' },
]

interface FormData {
  origin_city: string
  destination_city: string
  vehicle_type: string
  weight_kg: number
  pickup_date: string
  goods_description: string
  estimated_value: number
}

export default function NewShipmentPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { language } = useLanguageStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const [formData, setFormData] = useState<FormData>({
    origin_city: '',
    destination_city: '',
    vehicle_type: 'eicher_14ft',
    weight_kg: 0,
    pickup_date: '',
    goods_description: '',
    estimated_value: 0,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast.error(language === 'en' ? 'Please login first' : 'कृपया पहले लॉगिन करें')
      return
    }

    if (!formData.origin_city || !formData.destination_city || !formData.pickup_date || formData.weight_kg <= 0) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'कृपया सभी आवश्यक फ़ील्ड भरें')
      return
    }

    setIsSubmitting(true)

    try {
      // Step 1: Insert into shipments table
      const { data: shipmentData, error: shipmentError } = await supabase
        .from('shipments')
        .insert({
          customer_id: user.id,
          origin: formData.origin_city,
          destination: formData.destination_city,
          status: 'pending',
          total_weight: formData.weight_kg,
          vehicle_type: formData.vehicle_type,
          pickup_date: formData.pickup_date,
          goods_description: formData.goods_description,
          estimated_value: formData.estimated_value,
        })
        .select()
        .single()

      if (shipmentError) {
        console.error('Shipment insert error:', shipmentError)
        toast.error(language === 'en' ? 'Failed to create booking' : 'बुकिंग बनाने में विफल')
        setIsSubmitting(false)
        return
      }

      // Step 2: Call dispatch_job_to_drivers RPC
      const { data: dispatchResult, error: dispatchError } = await supabase.rpc('dispatch_job_to_drivers', {
        p_shipment_id: shipmentData.id,
        p_vehicle_type: formData.vehicle_type,
      })

      if (dispatchError) {
        console.error('Dispatch error:', dispatchError)
        // Shipment created, but dispatch failed - show warning but continue
        toast(language === 'en'
          ? 'Booking created! Drivers will be notified shortly.'
          : 'बुकिंग बनाई गई! ड्राइवरों को जल्द सूचित किया जाएगा।', { icon: '✅' })
      } else {
        toast(language === 'en'
          ? `Booking created! Notified ${dispatchResult} drivers.`
          : `बुकिंग बनाई गई! ${dispatchResult} ड्राइवरों को सूचित किया गया।`, { icon: '✅' })
      }

      // Show success and redirect
      setShowSuccess(true)
      setTimeout(() => {
        navigate('/tracking')
      }, 2000)

    } catch (error) {
      console.error('Unexpected error:', error)
      toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हो गया')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateField = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900 dark:to-emerald-800 flex items-center justify-center p-4">
        <div className="card p-8 text-center max-w-md">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {language === 'en' ? 'Booking Confirmed!' : 'बुकिंग पुष्टि!'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {language === 'en'
              ? 'Your shipment has been booked. Drivers are being notified.'
              : 'आपकी शिपमेंट बुक हो गई है। ड्राइवरों को सूचित किया जा रहा है।'}
          </p>
          <p className="text-sm text-slate-500">
            {language === 'en' ? 'Redirecting to tracking...' : 'ट्रैकिंग पर रीडायरेक्ट हो रहा है...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                {language === 'en' ? 'Book a Truck' : 'ट्रक बुक करें'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {language === 'en' ? 'New Shipment' : 'नई शिपमेंट'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Origin City */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <MapPin className="w-4 h-4 inline mr-1" />
              {language === 'en' ? 'Pickup City *' : 'पिकअप शहर *'}
            </label>
            <input
              type="text"
              value={formData.origin_city}
              onChange={(e) => updateField('origin_city', e.target.value)}
              placeholder={language === 'en' ? 'e.g., Mumbai' : 'उदा., मुंबई'}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          {/* Destination City */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <MapPin className="w-4 h-4 inline mr-1" />
              {language === 'en' ? 'Delivery City *' : 'डिलीवरी शहर *'}
            </label>
            <input
              type="text"
              value={formData.destination_city}
              onChange={(e) => updateField('destination_city', e.target.value)}
              placeholder={language === 'en' ? 'e.g., Delhi' : 'उदा., दिल्ली'}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          {/* Vehicle Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Truck className="w-4 h-4 inline mr-1" />
              {language === 'en' ? 'Truck Type *' : 'ट्रक प्रकार *'}
            </label>
            <select
              value={formData.vehicle_type}
              onChange={(e) => updateField('vehicle_type', e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {VEHICLE_TYPES.map((vt) => (
                <option key={vt.value} value={vt.value}>
                  {vt.label} ({vt.capacity})
                </option>
              ))}
            </select>
          </div>

          {/* Weight */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Scale className="w-4 h-4 inline mr-1" />
              {language === 'en' ? 'Weight (kg) *' : 'वजन (किग्रा) *'}
            </label>
            <input
              type="number"
              value={formData.weight_kg || ''}
              onChange={(e) => updateField('weight_kg', parseInt(e.target.value) || 0)}
              placeholder={language === 'en' ? 'e.g., 2000' : 'उदा., 2000'}
              min="1"
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          {/* Pickup Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              {language === 'en' ? 'Pickup Date *' : 'पिकअप तिथि *'}
            </label>
            <input
              type="date"
              value={formData.pickup_date}
              onChange={(e) => updateField('pickup_date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          {/* Goods Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              {language === 'en' ? 'Goods Description' : 'सामान का विवरण'}
            </label>
            <textarea
              value={formData.goods_description}
              onChange={(e) => updateField('goods_description', e.target.value)}
              placeholder={language === 'en' ? 'e.g., Electronics, Furniture, etc.' : 'उदा., इलेक्ट्रॉनिक्स, फर्नीचर, आदि'}
              rows={3}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Estimated Value */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <DollarSign className="w-4 h-4 inline mr-1" />
              {language === 'en' ? 'Estimated Value (₹)' : 'अनुमानित मूल्य (₹)'}
            </label>
            <input
              type="number"
              value={formData.estimated_value || ''}
              onChange={(e) => updateField('estimated_value', parseInt(e.target.value) || 0)}
              placeholder={language === 'en' ? 'e.g., 50000 (for e-way bill)' : 'उदा., 50000'}
              min="0"
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 mt-1">
              {language === 'en'
                ? 'Required for e-way bill if value > ₹50,000'
                : '₹50,000 से अधिक मूल्य के लिए ई-वे बिल आवश्यक'}
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {language === 'en' ? 'Creating Booking...' : 'बुकिंग बनाई जा रही है...'}
              </>
            ) : (
              <>
                <Truck className="w-5 h-5 mr-2" />
                {language === 'en' ? 'Book Now' : 'अभी बुक करें'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
