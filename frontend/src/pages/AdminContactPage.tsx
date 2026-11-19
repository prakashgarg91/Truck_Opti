import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, ChevronLeft, RefreshCw, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminSupabaseApi, type ContactInquiry as Inquiry } from '../services/adminSupabaseApi'
import { useLanguageStore } from '../stores/languageStore'
import { logger } from '../utils/logger'
import AdminLoadError from './AdminLoadError'

export default function AdminContactPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  // Rows requested so far. Resolving an inquiry only changes its status, so the row stays in the list and the offset is unchanged.
  const nextOffsetRef = useRef(0)
  // Bumped on every first-page load so a response from an older request is dropped.
  const requestRef = useRef(0)

  useEffect(() => {
    document.title = 'Contact Inquiries - Admin'
  }, [language])

  const fetchInquiries = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    setLoadingMore(false)
    setLoadMoreError(false)
    try {
      const page = await adminSupabaseApi.getContactInquiriesPage(0)
      if (requestId !== requestRef.current) return
      setInquiries(page.inquiries)
      setHasMore(page.hasMore)
      nextOffsetRef.current = page.inquiries.length
      setLoadError(false)
    } catch (error) {
      if (requestId !== requestRef.current) return
      logger.error('[AdminContactPage] fetchInquiries', error)
      toast.error('Failed to load contact inquiries.')
      setLoadError(true)
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    const requestId = requestRef.current
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const page = await adminSupabaseApi.getContactInquiriesPage(nextOffsetRef.current)
      if (requestId !== requestRef.current) return
      setInquiries(prev => [...prev, ...page.inquiries])
      setHasMore(page.hasMore)
      nextOffsetRef.current += page.inquiries.length
    } catch (error) {
      if (requestId !== requestRef.current) return
      logger.error('[AdminContactPage] loadMore', error)
      setLoadMoreError(true)
    } finally {
      if (requestId === requestRef.current) setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchInquiries()
  }, [fetchInquiries])

  const handleResolve = async (id: string) => {
    setUpdatingId(id)
    try {
      await adminSupabaseApi.resolveContactInquiry(id)

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
        <button aria-label="Back to admin"
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
        <button aria-label="Refresh inquiries"
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
        <div className="flex justify-center py-12" role="status" aria-label="Loading contact inquiries">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError what="contact inquiries" onRetry={fetchInquiries} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          {hasMore ? 'No loaded inquiries match this filter. Load more to see more.' : 'No inquiries found'}
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
      {!loading && !loadError && hasMore && (
        <div className="pt-2 text-center">
          {loadMoreError ? (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-red-600 dark:text-red-400">Could not load more inquiries. The rows above are still here.</p>
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 transition-colors">
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                {'Retry'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors">
              {loadingMore ? 'Loading more...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
