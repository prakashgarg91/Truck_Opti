import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Phone, MessageCircle, Send, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useLanguageStore } from '../stores/languageStore'

const SUBJECTS = ['General', 'Support', 'Sales', 'Partnership']
const SUBJECTS_HI = ['सामान्य', 'सहायता', 'बिक्री', 'साझेदारी']

export default function ContactPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'General',
    message: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    document.title = language === 'en' ? 'Contact Us - TruckOpti' : 'हमसे संपर्क करें - TruckOpti'
  }, [language])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = language === 'en' ? 'Name is required' : 'नाम आवश्यक है'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = language === 'en' ? 'Valid email is required' : 'सही ईमेल आवश्यक है'
    }
    if (!form.message.trim()) errs.message = language === 'en' ? 'Message is required' : 'संदेश आवश्यक है'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setSubmitting(true)
    try {
      const { error } = await supabase.from('contact_inquiries').insert({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        subject: form.subject,
        message: form.message.trim()
      })
      if (error) throw error
      toast.success(language === 'en'
        ? 'Thank you! We will get back to you soon.'
        : 'धन्यवाद! हम जल्द आपसे संपर्क करेंगे।')
      setForm({ name: '', email: '', phone: '', subject: 'General', message: '' })
    } catch {
      toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pt-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {language === 'en' ? 'Contact Us' : 'हमसे संपर्क करें'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {language === 'en' ? "We'd love to hear from you" : 'हम आपसे सुनना चाहते हैं'}
            </p>
          </div>
        </div>

        {/* Contact Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{language === 'en' ? 'Email' : 'ईमेल'}</p>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">support@truckopti.in</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{language === 'en' ? 'Phone' : 'फोन'}</p>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">+91 98765 43210</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-5 h-5 text-primary-500" />
            <span className="font-semibold text-slate-900 dark:text-white">
              {language === 'en' ? 'Send us a message' : 'हमें संदेश भेजें'}
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Full Name' : 'पूरा नाम'} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={language === 'en' ? 'Your full name' : 'आपका पूरा नाम'}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Email' : 'ईमेल'} *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Phone (optional)' : 'फोन (वैकल्पिक)'}
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder={language === 'en' ? '+91 98765 43210' : '+91 98765 43210'}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Subject' : 'विषय'}
            </label>
            <select
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {SUBJECTS.map((s, i) => (
                <option key={s} value={s}>{language === 'en' ? s : SUBJECTS_HI[i]}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Message' : 'संदेश'} *
            </label>
            <textarea
              rows={4}
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder={language === 'en' ? 'How can we help you?' : 'हम आपकी कैसे मदद कर सकते हैं?'}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            {errors.message && <p className="text-xs text-red-500 mt-1">{errors.message}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold transition-colors"
          >
            {submitting ? (
              <span className="animate-pulse">{language === 'en' ? 'Sending...' : 'भेजा जा रहा है...'}</span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {language === 'en' ? 'Send Message' : 'संदेश भेजें'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
