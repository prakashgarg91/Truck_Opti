import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Phone, MessageCircle, Send, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguageStore } from '../stores/languageStore'
import {
  clearStoredContactState,
  getPendingContactInquiry,
  getStoredContactDraft,
  persistContactDraft,
  queuePendingContactInquiry,
  submitContactInquiry,
  type ContactInquiryPayload,
  type StoredContactInquiry,
} from '../services/contactInquiry'

const SUBJECTS = ['General', 'Support', 'Sales', 'Partnership']
const SUBJECTS_HI = ['à¤¸à¤¾à¤®à¤¾à¤¨à¥à¤¯', 'à¤¸à¤¹à¤¾à¤¯à¤¤à¤¾', 'à¤¬à¤¿à¤•à¥à¤°à¥€', 'à¤¸à¤¾à¤à¥‡à¤¦à¤¾à¤°à¥€']
const SUPPORT_EMAIL = 'support@truckopti.in'

const getContactFailureMessage = (error: unknown, language: string) => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lowered = message.toLowerCase()

  if (
    lowered.includes('failed to fetch') ||
    lowered.includes('networkerror') ||
    lowered.includes('network request failed') ||
    lowered.includes('err_name_not_resolved') ||
    lowered.includes('load failed')
  ) {
    return language === 'en'
      ? 'Contact service is currently unavailable. Your message is saved on this device and you can email support immediately.'
      : 'à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¸à¥‡à¤µà¤¾ à¤…à¤­à¥€ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ à¤†à¤ªà¤•à¤¾ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤‡à¤¸ à¤¡à¤¿à¤µà¤¾à¤‡à¤¸ à¤ªà¤° à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤¹à¥ˆ à¤”à¤° à¤†à¤ª à¤¤à¥à¤°à¤‚à¤¤ à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ à¤•à¥‹ à¤ˆà¤®à¥‡à¤² à¤•à¤° à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤'
  }

  return language === 'en'
    ? 'Unable to send your message right now. It has been saved here for retry.'
    : 'à¤…à¤­à¥€ à¤†à¤ªà¤•à¤¾ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¤¾ à¤¨à¤¹à¥€à¤‚ à¤œà¤¾ à¤¸à¤•à¤¾à¥¤ à¤‡à¤¸à¥‡ à¤«à¤¿à¤° à¤¸à¥‡ à¤­à¥‡à¤œà¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤¯à¤¹à¤¾à¤ à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤°à¤–à¤¾ à¤—à¤¯à¤¾ à¤¹à¥ˆà¥¤'
}

const buildSupportMailto = (payload: ContactInquiryPayload) => {
  const body = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone || 'Not provided'}`,
    '',
    payload.message,
  ].join('\n')

  const params = new URLSearchParams({
    subject: `[TruckOpti] ${payload.subject}`,
    body,
  })

  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`
}

export default function ContactPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pendingSubmission, setPendingSubmission] = useState<StoredContactInquiry | null>(null)
  const [form, setForm] = useState<ContactInquiryPayload>({
    name: '',
    email: '',
    phone: '',
    subject: 'General',
    message: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    document.title = language === 'en' ? 'Contact Us - TruckOpti' : 'à¤¹à¤®à¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤°à¥‡à¤‚ - TruckOpti'
  }, [language])

  useEffect(() => {
    const savedDraft = getStoredContactDraft()
    const pending = getPendingContactInquiry()

    if (savedDraft) {
      setForm(savedDraft)
    }

    if (pending) {
      setPendingSubmission(pending)
    }
  }, [])

  useEffect(() => {
    persistContactDraft(form)
  }, [form])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = language === 'en' ? 'Name is required' : 'à¤¨à¤¾à¤® à¤†à¤µà¤¶à¥à¤¯à¤• à¤¹à¥ˆ'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = language === 'en' ? 'Valid email is required' : 'à¤¸à¤¹à¥€ à¤ˆà¤®à¥‡à¤² à¤†à¤µà¤¶à¥à¤¯à¤• à¤¹à¥ˆ'
    }
    if (!form.message.trim()) errs.message = language === 'en' ? 'Message is required' : 'à¤¸à¤‚à¤¦à¥‡à¤¶ à¤†à¤µà¤¶à¥à¤¯à¤• à¤¹à¥ˆ'
    return errs
  }

  const clearContactState = () => {
    clearStoredContactState()
    setPendingSubmission(null)
    setSubmitError(null)
  }

  const queuePendingSubmission = (
    payload: ContactInquiryPayload,
    message: string,
    existingClientSubmissionId?: string
  ) => {
    const queued = queuePendingContactInquiry(payload, existingClientSubmissionId || pendingSubmission?.clientSubmissionId)
    setPendingSubmission(queued)
    setSubmitError(message)
  }

  const sendInquiry = async (
    payload: ContactInquiryPayload,
    options: { showSuccessToast: boolean; showFailureToast: boolean }
  ) => {
    setSubmitting(true)
    const clientSubmissionId = pendingSubmission?.clientSubmissionId

    try {
      const storedSubmission = await submitContactInquiry(payload, clientSubmissionId)
      clearContactState()
      setForm({ name: '', email: '', phone: '', subject: 'General', message: '' })
      if (options.showSuccessToast) {
        toast.success(language === 'en'
          ? 'Thank you! We will get back to you soon.'
          : 'à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦! à¤¹à¤® à¤œà¤²à¥à¤¦ à¤†à¤ªà¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤°à¥‡à¤‚à¤—à¥‡à¥¤')
      }
      return storedSubmission
    } catch (error) {
      const fallbackMessage = getContactFailureMessage(error, language)
      queuePendingSubmission(payload, fallbackMessage, clientSubmissionId)
      if (options.showFailureToast) {
        toast.error(fallbackMessage)
      }
      return null
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!pendingSubmission || typeof window === 'undefined') {
      return
    }

    const handleOnline = () => {
      if (!navigator.onLine || submitting) {
        return
      }

      void sendInquiry(pendingSubmission, { showSuccessToast: false, showFailureToast: false })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
    // sendInquiry references language but language is already a dep; adding the function
    // would require useCallback wrapping which adds churn without fixing real staleness
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSubmission, submitting, language])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setSubmitError(null)

    const payload: ContactInquiryPayload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      subject: form.subject,
      message: form.message,
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineMessage = language === 'en'
        ? 'You are offline. Your message is saved on this device. Email support if it is urgent.'
        : 'à¤†à¤ª à¤‘à¤«à¤²à¤¾à¤‡à¤¨ à¤¹à¥ˆà¤‚à¥¤ à¤†à¤ªà¤•à¤¾ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤‡à¤¸ à¤¡à¤¿à¤µà¤¾à¤‡à¤¸ à¤ªà¤° à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤¹à¥ˆà¥¤ à¤œà¤°à¥‚à¤°à¥€ à¤¹à¥‹ à¤¤à¥‹ à¤ˆà¤®à¥‡à¤² à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ à¤•à¤¾ à¤‰à¤ªà¤¯à¥‹à¤— à¤•à¤°à¥‡à¤‚à¥¤'
      queuePendingSubmission(payload, offlineMessage)
      toast.error(offlineMessage)
      return
    }

    await sendInquiry(payload, { showSuccessToast: true, showFailureToast: true })
  }

  const activeInquiry = pendingSubmission ?? form

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
              {language === 'en' ? 'Contact Us' : 'à¤¹à¤®à¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤°à¥‡à¤‚'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {language === 'en' ? "We'd love to hear from you" : 'à¤¹à¤® à¤†à¤ªà¤¸à¥‡ à¤¸à¥à¤¨à¤¨à¤¾ à¤šà¤¾à¤¹à¤¤à¥‡ à¤¹à¥ˆà¤‚'}
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
              <p className="text-xs text-slate-500 dark:text-slate-400">{language === 'en' ? 'Email' : 'à¤ˆà¤®à¥‡à¤²'}</p>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{SUPPORT_EMAIL}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{language === 'en' ? 'Phone' : 'à¤«à¥‹à¤¨'}</p>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">+91 98765 43210</p>
            </div>
          </div>
        </div>

        {pendingSubmission && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-sm font-semibold text-amber-800">
              {language === 'en'
                ? 'Support is temporarily unreachable.'
                : 'à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ à¤…à¤­à¥€ à¤…à¤¸à¥à¤¥à¤¾à¤¯à¥€ à¤°à¥‚à¤ª à¤¸à¥‡ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤'}
            </p>
            <p className="mt-1 text-sm text-amber-700">
              {submitError || (language === 'en'
                ? 'Your message is saved on this device. Retry when the service is back or send it directly by email.'
                : 'à¤†à¤ªà¤•à¤¾ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤‡à¤¸ à¤¡à¤¿à¤µà¤¾à¤‡à¤¸ à¤ªà¤° à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤¹à¥ˆà¥¤ à¤¸à¥‡à¤µà¤¾ à¤µà¤¾à¤ªà¤¸ à¤†à¤¨à¥‡ à¤ªà¤° à¤«à¤¿à¤° à¤•à¥‹à¤¶à¤¿à¤¶ à¤•à¤°à¥‡à¤‚ à¤¯à¤¾ à¤‡à¤¸à¥‡ à¤¸à¥€à¤§à¥‡ à¤ˆà¤®à¥‡à¤² à¤•à¤°à¥‡à¤‚à¥¤')}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void sendInquiry(pendingSubmission, { showSuccessToast: true, showFailureToast: true })}
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {language === 'en' ? 'Retry send' : 'à¤«à¤¿à¤° à¤¸à¥‡ à¤­à¥‡à¤œà¥‡à¤‚'}
              </button>
              <a
                href={buildSupportMailto(activeInquiry)}
                className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-3 font-semibold text-amber-800 transition-colors hover:bg-amber-100"
              >
                <Mail className="h-4 w-4" />
                {language === 'en' ? 'Email support' : 'à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ à¤•à¥‹ à¤ˆà¤®à¥‡à¤² à¤•à¤°à¥‡à¤‚'}
              </a>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-5 h-5 text-primary-500" />
            <span className="font-semibold text-slate-900 dark:text-white">
              {language === 'en' ? 'Send us a message' : 'à¤¹à¤®à¥‡à¤‚ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¥‡à¤‚'}
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Full Name' : 'à¤ªà¥‚à¤°à¤¾ à¤¨à¤¾à¤®'} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={language === 'en' ? 'Your full name' : 'à¤†à¤ªà¤•à¤¾ à¤ªà¥‚à¤°à¤¾ à¤¨à¤¾à¤®'}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Email' : 'à¤ˆà¤®à¥‡à¤²'} *
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
              {language === 'en' ? 'Phone (optional)' : 'à¤«à¥‹à¤¨ (à¤µà¥ˆà¤•à¤²à¥à¤ªà¤¿à¤•)'}
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+91 98765 43210"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {language === 'en' ? 'Subject' : 'à¤µà¤¿à¤·à¤¯'}
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
              {language === 'en' ? 'Message' : 'à¤¸à¤‚à¤¦à¥‡à¤¶'} *
            </label>
            <textarea
              rows={4}
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder={language === 'en' ? 'How can we help you?' : 'à¤¹à¤® à¤†à¤ªà¤•à¥€ à¤•à¥ˆà¤¸à¥‡ à¤®à¤¦à¤¦ à¤•à¤° à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚?'}
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
              <span className="animate-pulse">{language === 'en' ? 'Sending...' : 'à¤­à¥‡à¤œà¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ...'}</span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {language === 'en' ? 'Send Message' : 'à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¥‡à¤‚'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
