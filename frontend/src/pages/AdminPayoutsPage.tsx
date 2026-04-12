import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, CheckCircle2, XCircle, Clock, Search,
  RefreshCw, AlertTriangle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguageStore } from '../stores/languageStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface DriverPayout {
  id: string
  driver_id: string
  amount: number
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  requested_at: string
  processed_at: string | null
  note: string | null
  drivers: {
    full_name: string
    phone: string
  } | null
}

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
  const { language } = useLanguageStore()
  const [payouts, setPayouts] = useState<DriverPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [rejectModal, setRejectModal] = useState<{ payoutId: string; driverName: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchPayouts = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('driver_payouts')
        .select('*, drivers(full_name, phone)')
        .order('requested_at', { ascending: false })

      if (error) {
        logger.error('[AdminPayouts] Fetch error:', error)
        toast.error(language === 'en' ? 'Failed to load payouts' : 'भुगतान लोड करने में विफल')
        return
      }
      setPayouts(data || [])
    } catch (err) {
      logger.error('[AdminPayouts] Exception:', err)
      toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')
    } finally {
      setLoading(false)
    }
  }, [language])

  useEffect(() => {
    fetchPayouts()
  }, [fetchPayouts])

  const handleApprove = async (payoutId: string) => {
    setProcessingId(payoutId)
    try {
      const { error } = await supabase
        .from('driver_payouts')
        .update({ status: 'approved' })
        .eq('id', payoutId)

      if (error) {
        logger.error('[AdminPayouts] Approve error:', error)
        toast.error(language === 'en' ? 'Failed to approve payout' : 'भुगतान स्वीकृत करने में विफल')
        return
      }
      toast.success(language === 'en' ? 'Payout approved' : 'भुगतान स्वीकृत')
      fetchPayouts()
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return

    setProcessingId(rejectModal.payoutId)
    try {
      const { error } = await supabase
        .from('driver_payouts')
        .update({
          status: 'rejected',
          note: rejectReason.trim()
        })
        .eq('id', rejectModal.payoutId)

      if (error) {
        logger.error('[AdminPayouts] Reject error:', error)
        toast.error(language === 'en' ? 'Failed to reject payout' : 'भुगतान अस्वीकार करने में विफल')
        return
      }
      toast.success(language === 'en' ? 'Payout rejected' : 'भुगतान अस्वीकृत')
      setRejectModal(null)
      setRejectReason('')
      fetchPayouts()
    } finally {
      setProcessingId(null)
    }
  }

  const handleMarkPaid = async (payoutId: string) => {
    setProcessingId(payoutId)
    try {
      const { error } = await supabase
        .from('driver_payouts')
        .update({
          status: 'paid',
          processed_at: new Date().toISOString()
        })
        .eq('id', payoutId)

      if (error) {
        logger.error('[AdminPayouts] Mark paid error:', error)
        toast.error(language === 'en' ? 'Failed to mark as paid' : 'भुगतान चिह्नित करने में विफल')
        return
      }
      toast.success(language === 'en' ? 'Marked as paid' : 'भुगतान के रूप में चिह्नित')
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {language === 'en' ? 'Driver Payouts' : 'ड्राइवर भुगतान'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {language === 'en' ? 'Manage driver withdrawal requests' : 'ड्राइवर निकासी अनुरोधों का प्रबंधन करें'}
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={language === 'en' ? 'Search by name or phone...' : 'नाम या फोन से खोजें...'}
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
              {language === 'en' ? 'Refresh' : 'रिफ्रेश'}
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
                {language === 'en'
                  ? status.charAt(0).toUpperCase() + status.slice(1)
                  : status === 'all' ? 'सभी' :
                    status === 'pending' ? 'लंबित' :
                      status === 'approved' ? 'स्वीकृत' :
                        status === 'paid' ? 'भुगतान किया' : 'अस्वीकृत'
                } ({statusCounts[status]})
              </button>
            ))}
          </div>
        </div>

        {/* Payouts Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {loading && payouts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
              {language === 'en' ? 'Loading payouts...' : 'भुगतान लोड हो रहे हैं...'}
            </div>
          ) : filteredPayouts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
              {language === 'en' ? 'No payouts found' : 'कोई भुगतान नहीं मिला'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {language === 'en' ? 'Driver' : 'ड्राइवर'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {language === 'en' ? 'Amount' : 'राशि'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {language === 'en' ? 'Status' : 'स्थिति'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {language === 'en' ? 'Requested' : 'अनुरोधित'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {language === 'en' ? 'Processed' : 'संसाधित'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {language === 'en' ? 'Actions' : 'कार्रवाई'}
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
                          {language === 'en'
                            ? payout.status.charAt(0).toUpperCase() + payout.status.slice(1)
                            : payout.status === 'pending' ? 'लंबित' :
                              payout.status === 'approved' ? 'स्वीकृत' :
                                payout.status === 'paid' ? 'भुगतान किया' : 'अस्वीकृत'
                          }
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
                              {language === 'en' ? 'Approve' : 'स्वीकृत करें'}
                            </button>
                            <button
                              onClick={() => setRejectModal({ payoutId: payout.id, driverName: payout.drivers?.full_name || 'Driver' })}
                              disabled={processingId === payout.id}
                              className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                            >
                              {language === 'en' ? 'Reject' : 'अस्वीकार करें'}
                            </button>
                          </div>
                        )}
                        {payout.status === 'approved' && (
                          <button
                            onClick={() => handleMarkPaid(payout.id)}
                            disabled={processingId === payout.id}
                            className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {language === 'en' ? 'Mark Paid' : 'भुगतान चिह्नित करें'}
                          </button>
                        )}
                        {payout.status === 'paid' && (
                          <span className="text-sm text-gray-400 dark:text-gray-500">
                            {language === 'en' ? 'Completed' : 'पूर्ण'}
                          </span>
                        )}
                        {payout.status === 'rejected' && payout.note && (
                          <span className="text-sm text-gray-500 dark:text-gray-400" title={payout.note}>
                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                            {language === 'en' ? 'Reason provided' : 'कारण दिया गया'}
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
              {language === 'en' ? 'Reject Payout Request' : 'भुगतान अनुरोध अस्वीकार करें'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {language === 'en'
                ? `Are you sure you want to reject the payout request from ${rejectModal.driverName}?`
                : `क्या आप वाकई ${rejectModal.driverName} के भुगतान अनुरोध को अस्वीकार करना चाहते हैं?`
              }
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {language === 'en' ? 'Reason for rejection (required)' : 'अस्वीकृति का कारण (आवश्यक)'}
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder={language === 'en' ? 'Enter reason...' : 'कारण लिखें...'}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectReason('') }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {language === 'en' ? 'Cancel' : 'रद्द करें'}
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || processingId === rejectModal.payoutId}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {language === 'en' ? 'Reject' : 'अस्वीकार करें'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
