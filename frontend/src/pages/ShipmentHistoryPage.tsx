import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, Search,
  CheckCircle2, XCircle, Clock, RefreshCw, Truck
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface Shipment {
  id: string
  shipment_id: string
  origin: string
  destination: string
  status: string
  vehicle_type: string
  total_weight: number
  created_at: string
  estimated_cost: number
}

type FilterStatus = 'all' | 'delivered' | 'cancelled' | 'pending' | 'in_transit'

export default function ShipmentHistoryPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')

  const fetchShipments = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setShipments(data ?? [])
    } catch (err) {
      logger.error('Failed to load shipments:', err)
      toast.error('Failed to load shipment history')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchShipments()
  }, [fetchShipments])

  const filteredShipments = shipments.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false
    if (search) {
      const searchLower = search.toLowerCase()
      return (
        s.origin?.toLowerCase().includes(searchLower) ||
        s.destination?.toLowerCase().includes(searchLower) ||
        s.shipment_id?.toLowerCase().includes(searchLower)
      )
    }
    return true
  })

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'delivered':
        return { icon: CheckCircle2, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Delivered' }
      case 'cancelled':
        return { icon: XCircle, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Cancelled' }
      case 'in_transit':
        return { icon: Truck, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'In Transit' }
      default:
        return { icon: Clock, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Pending' }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Shipment History</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{filteredShipments.length} shipments</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by route or ID..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'delivered', 'in_transit', 'cancelled'] as FilterStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {f === 'all' ? 'All' : f === 'in_transit' ? 'In Transit' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Shipments List */}
      {filteredShipments.length === 0 ? (
        <div className="text-center py-16">
          <Package size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">No shipments found</p>
          <p className="text-slate-400 text-xs mt-1">
            {search || filter !== 'all' ? 'Try adjusting your filters' : 'Your shipment history will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredShipments.map((shipment) => {
            const statusConfig = getStatusConfig(shipment.status)
            const StatusIcon = statusConfig.icon

            return (
              <div
                key={shipment.id}
                onClick={() => navigate('/tracking')}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <Package size={16} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        #{shipment.shipment_id?.slice(-8) || shipment.id.slice(-8)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(shipment.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${statusConfig.color}`}>
                    <StatusIcon size={12} />
                    {statusConfig.label}
                  </span>
                </div>

                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                      {shipment.origin || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                      {shipment.destination || '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Truck size={10} />
                    {shipment.vehicle_type || 'Truck'}
                  </span>
                  <span>•</span>
                  <span>{shipment.total_weight || 0} kg</span>
                  {shipment.estimated_cost > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-green-600 font-semibold">
                        ₹{shipment.estimated_cost.toLocaleString('en-IN')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
