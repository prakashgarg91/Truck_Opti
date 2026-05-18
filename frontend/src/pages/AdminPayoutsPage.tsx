import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, CheckCircle2, XCircle, Clock, Search,
  RefreshCw, AlertTriangle, ChevronLeft
} from 'lucide-react'
import { adminPayoutsApi, type DriverPayout } from '../services/supabaseApi'
import { useLanguageStore } from '../stores/languageStore'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

type StatusFilter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminPayoutsPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const { user, isLoading: authLoading } = useAuthStore()
  const [payouts, setPayouts] = useState<DriverPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [rejectModal, setRejectModal] = useState<{ payoutId: string; driverName: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchPayouts = useCallback(async () => {
    if (authLoading) return

    if (user?.role !== 'admin') {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const payouts = await adminPayoutsApi.getAll()
      setPayouts(payouts)
    } catch (error) {
      logger.error('[AdminPayouts] Fetch error:', error)
      toast.error('Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }, [authLoading, language, user?.role])

  useEffect(() => {
    if (!authLoading) {
      fetchPayouts()
    }
  }, [authLoading, fetchPayouts])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-gray-800">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Admin access required</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This payouts console is only available to admin users.
          </p>
        </div>
      </div>
    )
  }

  const handleApprove = async (payoutId: string) => {
    setProcessingId(payoutId)
    try {
      await adminPayoutsApi.approve(payoutId)
      toast.success('Payout approved')
      fetchPayouts()
    } catch (error) {
      logger.error('[AdminPayouts] Approve error:', error)
      toast.error('Failed to approve payout')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return

    setProcessingId(rejectModal.payoutId)
    try {
      await adminPayoutsApi.reject(rejectModal.payoutId, rejectReason.trim())
      toast.success('Payout rejected')
      setRejectModal(null)
      setRejectReason('')
      fetchPayouts()
    } catch (error) {
      logger.error('[AdminPayouts] Reject error:', error)
      toast.error('Failed to reject payout')
    } finally {
      setProcessingId(null)
    }
  }

  const handleMarkPaid = async (payoutId: string) => {
    setProcessingId(payoutId)
    try {
      await adminPayoutsApi.markAsPaid(payoutId)
      toast.success('Marked as paid')
      fetchPayouts()
    } finally {
      setProcessingId(null)
    }
  }

  const filteredPayouts = payouts.filter(p => {
    const matchesSearch = !search ||
      p.drivers?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.drivers?.phone?.includes(search)
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusCounts = {
    all: payouts.length,
    pending: payouts.filter(p => p.status === 'pending').length,
    approved: payouts.filter(p => p.status === 'approved').length,
    paid: payouts.filter(p => p.status === 'paid').length,
    rejected: payouts.filter(p => p.status === 'rejected').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              aria-label="Back to admin dashboard"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {'Driver Payouts'}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {'Manage driver withdrawal requests'}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={'Search by name or phone...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchPayouts}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {'Refresh'}
            </button>
          </div>

          {/* Status Tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            {(['all', 'pending', 'approved', 'paid', 'rejected'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status]})
              </button>
            ))}
          </div>
        </div>

        {/* Payouts Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {loading && payouts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
              {'Loading payouts...'}
            </div>
          ) : filteredPayouts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
              {'No payouts found'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {'Driver'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {'Amount'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {'Status'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {'Requested'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {'Processed'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredPayouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {payout.drivers?.full_name || 'Unknown'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {payout.drivers?.phone || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-lg font-semibold text-gray-900 dark:text-white">
                          ₹{Number(payout.amount).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payout.status]}`}>
                          {payout.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                          {payout.status === 'approved' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {payout.status === 'paid' && <DollarSign className="w-3 h-3 mr-1" />}
                          {payout.status === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
                          {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(payout.requested_at)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {payout.processed_at ? formatDate(payout.processed_at) : '-'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {payout.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleApprove(payout.id)}
                              disabled={processingId === payout.id}
                              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {'Approve'}
                            </button>
                            <button
                              onClick={() => setRejectModal({ payoutId: payout.id, driverName: payout.drivers?.full_name || 'Driver' })}
                              disabled={processingId === payout.id}
                              className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                            >
                              {'Reject'}
                            </button>
                          </div>
                        )}
                        {payout.status === 'approved' && (
                          <button
                            onClick={() => handleMarkPaid(payout.id)}
                            disabled={processingId === payout.id}
                            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {'Mark Paid'}
                          </button>
                        )}
                        {payout.status === 'paid' && (
                          <span className="text-sm text-gray-400 dark:text-gray-500">
                            {'Completed'}
                          </span>
                        )}
                        {payout.status === 'rejected' && payout.note && (
                          <span className="text-sm text-gray-500 dark:text-gray-400" title={payout.note}>
                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                            {'Reason provided'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {'Reject Payout Request'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {`Are you sure you want to reject the payout request from ${rejectModal.driverName}?`}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {'Reason for rejection (required)'}
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder={'Enter reason...'}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectReason('') }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {'Cancel'}
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || processingId === rejectModal.payoutId}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
