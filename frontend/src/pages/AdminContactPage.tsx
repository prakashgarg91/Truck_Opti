import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, ChevronLeft, RefreshCw, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useLanguageStore } from '../stores/languageStore'
import { logger } from '../utils/logger'

interface Inquiry {
  id: string
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  status: 'open' | 'resolved'
  created_at: string
}

export default function AdminContactPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Contact Inquiries - Admin'
  }, [language])

  const fetchInquiries = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setInquiries(data || [])
    } catch (error) {
      logger.error('[AdminContactPage] fetchInquiries', error)
      toast.error('Failed to load contact inquiries.')
    } finally {
      setLoading(false)
    }
  }, [language])

  useEffect(() => {
    fetchInquiries()
  }, [fetchInquiries])

  const handleResolve = async (id: string) => {
    setUpdatingId(id)
    try {
      const { error } = await supabase
        .from('contact_inquiries')
        .update({ status: 'resolved' })
        .eq('id', id)

      if (error) {
        throw error
      }

      setInquiries(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i))
      toast.success('Marked as resolved')
    } catch (error) {
      logger.error('[AdminContactPage] handleResolve', error)
      toast.error('Failed to update inquiry.')
    } finally {
      setUpdatingId(null)
    }
  }

  const filtered = inquiries.filter(i => statusFilter === 'all' || i.status === statusFilter)

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin')}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-orange-500" />
            {'Contact Inquiries'}
          </h1>
          <p className="text-sm text-slate-500">{filtered.length} {'inquiries'}</p>
        </div>
        <button
          onClick={fetchInquiries}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700"
        >
          <RefreshCw className={`w-5 h-5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 bg-white dark:bg-slate-800 rounded-2xl p-1 shadow-sm border border-slate-100 dark:border-slate-700">
        {(['all', 'open', 'resolved'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${statusFilter === tab
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
          >
            {tab === 'all'
              ? ('All')
              : tab === 'open'
                ? ('Open')
                : ('Resolved')}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          {'No inquiries found'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inquiry => (
            <div
              key={inquiry.id}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-3"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{inquiry.name}</p>
                  <p className="text-sm text-slate-500">{inquiry.email}</p>
                  {inquiry.phone && (
                    <p className="text-sm text-slate-500">{inquiry.phone}</p>
                  )}
                </div>
                <span className={`px-2 py-1 text-xs rounded-full font-medium flex items-center gap-1 whitespace-nowrap ${inquiry.status === 'open'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                  {inquiry.status === 'open'
                    ? <><Clock className="w-3 h-3" />{'Open'}</>
                    : <><CheckCircle2 className="w-3 h-3" />{'Resolved'}</>}
                </span>
              </div>

              {/* Subject + message */}
              <div>
                <span className="inline-block text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full mb-1">
                  {inquiry.subject}
                </span>
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">{inquiry.message}</p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {new Date(inquiry.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </p>
                {inquiry.status === 'open' && (
                  <button
                    onClick={() => handleResolve(inquiry.id)}
                    disabled={updatingId === inquiry.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {updatingId === inquiry.id
                      ? ('Updating...')
                      : ('Mark Resolved')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
