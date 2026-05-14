import { useState, useEffect, useCallback } from 'react'
import {
  Users, Truck, Package, DollarSign, TrendingUp,
  RefreshCw, Building2, Calendar, Wallet, MessageSquare, Download, Shield, CreditCard
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatCurrency } from '../utils/formatters'
import { downloadCsv, downloadJson, downloadXlsx, type ExportColumn } from '../utils/dataExport'
import { logger } from '../utils/logger'

interface Analytics {
  totalRevenue: number
  agencyRevenue: number
  driverRevenue: number
  directAppRevenue: number
  directAppBookingValue: number
  directAppBookingCount: number
  totalAgencies: number
  totalDrivers: number
  totalShipments: number
  platformFee: number
}

interface RevenueEvent {
  id: string
  source: string
  ownerName: string
  origin: string
  destination: string
  amount: number
  eventDate: string
}

interface DriverLeaderboardRow {
  driverName: string
  trips: number
  revenue: number
}

interface ShipmentRelation {
  origin?: string | null
  destination?: string | null
  shipment_id?: string | null
  estimated_cost?: number | null
}

interface AgencyJobRow {
  id: string
  agency_id: string | null
  shipment_id: string | null
  fare: number | null
  created_at: string
  updated_at?: string | null
  shipments?: ShipmentRelation | ShipmentRelation[] | null
}

interface DriverJobRow {
  id: string
  shipment_id: string | null
  driver_id: string | null
  delivered_at: string | null
  shipments?: ShipmentRelation | ShipmentRelation[] | null
}

interface ShipmentRow {
  id: string
  shipment_id: string
  origin: string
  destination: string
  estimated_cost: number | null
  status: string
  created_at: string
  updated_at: string | null
  created_by: string | null
}

interface AdminExportRow {
  source: string
  owner: string
  shipmentRef: string
  route: string
  status: string
  amount: number
  date: string
}

const adminExportColumns: ExportColumn<AdminExportRow>[] = [
  { label: 'Source', value: (row) => row.source },
  { label: 'Owner', value: (row) => row.owner },
  { label: 'Shipment Ref', value: (row) => row.shipmentRef },
  { label: 'Route', value: (row) => row.route },
  { label: 'Status', value: (row) => row.status },
  { label: 'Amount (INR)', value: (row) => row.amount },
  { label: 'Date', value: (row) => row.date },
]

function getShipmentRelation(shipments: ShipmentRelation | ShipmentRelation[] | null | undefined) {
  if (!shipments) {
    return null
  }

  return Array.isArray(shipments) ? (shipments[0] ?? null) : shipments
}

export default function AdminDashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [analytics, setAnalytics] = useState<Analytics>({
    totalRevenue: 0,
    agencyRevenue: 0,
    driverRevenue: 0,
    directAppRevenue: 0,
    directAppBookingValue: 0,
    directAppBookingCount: 0,
    totalAgencies: 0,
    totalDrivers: 0,
    totalShipments: 0,
    platformFee: 0,
  })
  const [recentJobs, setRecentJobs] = useState<RevenueEvent[]>([])
  const [driverLeaderboard, setDriverLeaderboard] = useState<DriverLeaderboardRow[]>([])
  const [exportRows, setExportRows] = useState<AdminExportRow[]>([])
  const [revenueTrend, setRevenueTrend] = useState<{ month: string; revenue: number }[]>([])

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      const [agencyJobsRes, agencyShipmentRefsRes, driverJobsRes, directBookingCandidatesRes, agenciesRes, driversRes, shipmentsRes] = await Promise.all([
        supabase
          .from('agency_jobs')
          .select('id, agency_id, shipment_id, fare, created_at, updated_at, shipments(origin, destination, shipment_id)')
          .eq('status', 'delivered')
          .order('updated_at', { ascending: false }),
        supabase
          .from('agency_jobs')
          .select('shipment_id'),
        supabase
          .from('job_offers')
          .select('id, shipment_id, driver_id, delivered_at, shipments(origin, destination, shipment_id, estimated_cost)')
          .eq('status', 'delivered')
          .order('delivered_at', { ascending: false }),
        supabase
          .from('shipments')
          .select('id, shipment_id, origin, destination, estimated_cost, status, created_at, updated_at, created_by')
          .not('created_by', 'is', null)
          .order('created_at', { ascending: false }),
        supabase.from('transport_agencies').select('id', { count: 'exact', head: true }),
        supabase.from('drivers').select('id', { count: 'exact', head: true }),
        supabase.from('shipments').select('id', { count: 'exact', head: true }),
      ])

      const analyticsError = agencyJobsRes.error || agencyShipmentRefsRes.error || driverJobsRes.error || directBookingCandidatesRes.error || agenciesRes.error || driversRes.error || shipmentsRes.error
      if (analyticsError) {
        throw analyticsError
      }

      const agencyJobsData = (agencyJobsRes.data ?? []) as AgencyJobRow[]
      const driverJobsData = (driverJobsRes.data ?? []) as DriverJobRow[]
      const directBookingCandidates = (directBookingCandidatesRes.data ?? []) as ShipmentRow[]
      const agencyShipmentIds = new Set(((agencyShipmentRefsRes.data ?? []) as Array<{ shipment_id: string | null }>)
        .map((row) => row.shipment_id)
        .filter((shipmentId): shipmentId is string => Boolean(shipmentId)))
      const directAppBookings = directBookingCandidates.filter((shipment) => !agencyShipmentIds.has(shipment.id))

      const agencyIds = Array.from(new Set(agencyJobsData
        .map((job) => job.agency_id)
        .filter((agencyId): agencyId is string => Boolean(agencyId))))
      const driverIds = Array.from(new Set(driverJobsData
        .map((job) => job.driver_id)
        .filter((driverId): driverId is string => Boolean(driverId))))

      let agenciesData: Array<{ id: string; company_name: string | null }> = []
      if (agencyIds.length > 0) {
        const { data, error } = await supabase
          .from('transport_agencies')
          .select('id, company_name')
          .in('id', agencyIds)

        if (error) {
          throw error
        }

        agenciesData = data ?? []
      }

      let driversData: Array<{ id: string; full_name: string | null; phone: string | null }> = []
      if (driverIds.length > 0) {
        const { data, error } = await supabase
          .from('drivers')
          .select('id, full_name, phone')
          .in('id', driverIds)

        if (error) {
          throw error
        }

        driversData = data ?? []
      }

      const agencyNameById = new Map(agenciesData.map((agency) => [agency.id, agency.company_name ?? 'Unknown Agency']))
      const driverNameById = new Map(driversData.map((driver) => [driver.id, driver.full_name || driver.phone || 'Unknown Driver']))

      const agencyRevenue = agencyJobsData.reduce((sum, job) => sum + Number(job.fare ?? 0), 0)
      const driverRevenue = driverJobsData.reduce((sum, job) => {
        const shipment = getShipmentRelation(job.shipments)
        return sum + Number(shipment?.estimated_cost ?? 0)
      }, 0)
      const directAppShipmentIds = new Set(directAppBookings.map((booking) => booking.id))
      const directAppRevenue = driverJobsData.reduce((sum, job) => {
        if (!job.shipment_id || !directAppShipmentIds.has(job.shipment_id)) {
          return sum
        }

        const shipment = getShipmentRelation(job.shipments)
        return sum + Number(shipment?.estimated_cost ?? 0)
      }, 0)
      const directAppBookingValue = directAppBookings.reduce((sum, booking) => sum + Number(booking.estimated_cost ?? 0), 0)
      const totalRevenue = agencyRevenue + driverRevenue

      const recentAgencyEvents: RevenueEvent[] = agencyJobsData.slice(0, 10).map((job) => {
        const shipment = getShipmentRelation(job.shipments)
        return {
          id: job.id,
          source: 'Agency Network',
          ownerName: job.agency_id ? (agencyNameById.get(job.agency_id) ?? 'Unknown Agency') : 'Unknown Agency',
          origin: shipment?.origin ?? '',
          destination: shipment?.destination ?? '',
          amount: Number(job.fare ?? 0),
          eventDate: job.updated_at ?? job.created_at,
        }
      })

      const recentDriverEvents: RevenueEvent[] = driverJobsData.slice(0, 10).map((job) => {
        const shipment = getShipmentRelation(job.shipments)
        return {
          id: job.id,
          source: 'Driver Network',
          ownerName: job.driver_id ? (driverNameById.get(job.driver_id) ?? 'Unknown Driver') : 'Unknown Driver',
          origin: shipment?.origin ?? '',
          destination: shipment?.destination ?? '',
          amount: Number(shipment?.estimated_cost ?? 0),
          eventDate: job.delivered_at ?? new Date().toISOString(),
        }
      })

      setRecentJobs(
        [...recentAgencyEvents, ...recentDriverEvents]
          .sort((left, right) => new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime())
          .slice(0, 20)
      )

      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
      sixMonthsAgo.setDate(1)

      const monthlyRevenue: Record<string, number> = {}
      const addToTrend = (dateValue: string | null | undefined, amount: number) => {
        if (!dateValue) {
          return
        }

        const date = new Date(dateValue)
        if (date < sixMonthsAgo) {
          return
        }

        const monthKey = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + amount
      }

      agencyJobsData.forEach((job) => addToTrend(job.updated_at ?? job.created_at, Number(job.fare ?? 0)))
      driverJobsData.forEach((job) => {
        const shipment = getShipmentRelation(job.shipments)
        addToTrend(job.delivered_at, Number(shipment?.estimated_cost ?? 0))
      })

      const months = []
      for (let i = 5; i >= 0; i--) {
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        const monthKey = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        months.push({ month: monthKey, revenue: monthlyRevenue[monthKey] || 0 })
      }
      setRevenueTrend(months)

      const leaderboard = new Map<string, DriverLeaderboardRow>()
      driverJobsData.forEach((job) => {
        const key = job.driver_id ?? `unknown-${job.id}`
        const shipment = getShipmentRelation(job.shipments)
        const amount = Number(shipment?.estimated_cost ?? 0)
        const driverName = job.driver_id ? (driverNameById.get(job.driver_id) ?? 'Unknown Driver') : 'Unknown Driver'
        const current = leaderboard.get(key) ?? { driverName, trips: 0, revenue: 0 }
        current.trips += 1
        current.revenue += amount
        leaderboard.set(key, current)
      })
      setDriverLeaderboard(
        Array.from(leaderboard.values())
          .sort((left, right) => right.revenue - left.revenue)
          .slice(0, 8)
      )

      setExportRows([
        ...agencyJobsData.map((job) => {
          const shipment = getShipmentRelation(job.shipments)
          return {
            source: 'Agency Network',
            owner: job.agency_id ? (agencyNameById.get(job.agency_id) ?? 'Unknown Agency') : 'Unknown Agency',
            shipmentRef: shipment?.shipment_id || job.id.slice(-8).toUpperCase(),
            route: `${shipment?.origin ?? '—'} → ${shipment?.destination ?? '—'}`,
            status: 'delivered',
            amount: Number(job.fare ?? 0),
            date: new Date(job.updated_at ?? job.created_at).toLocaleDateString('en-IN'),
          }
        }),
        ...driverJobsData.map((job) => {
          const shipment = getShipmentRelation(job.shipments)
          return {
            source: 'Driver Network',
            owner: job.driver_id ? (driverNameById.get(job.driver_id) ?? 'Unknown Driver') : 'Unknown Driver',
            shipmentRef: shipment?.shipment_id || job.id.slice(-8).toUpperCase(),
            route: `${shipment?.origin ?? '—'} → ${shipment?.destination ?? '—'}`,
            status: 'delivered',
            amount: Number(shipment?.estimated_cost ?? 0),
            date: new Date(job.delivered_at ?? Date.now()).toLocaleDateString('en-IN'),
          }
        }),
        ...directAppBookings.map((booking) => ({
          source: 'Direct App Booking',
          owner: 'Direct Customer',
          shipmentRef: booking.shipment_id || booking.id.slice(-8).toUpperCase(),
          route: `${booking.origin || '—'} → ${booking.destination || '—'}`,
          status: booking.status,
          amount: Number(booking.estimated_cost ?? 0),
          date: new Date(booking.updated_at ?? booking.created_at).toLocaleDateString('en-IN'),
        }))
      ])

      setAnalytics({
        totalRevenue,
        agencyRevenue,
        driverRevenue,
        directAppRevenue,
        directAppBookingValue,
        directAppBookingCount: directAppBookings.length,
        totalAgencies: agenciesRes.count ?? 0,
        totalDrivers: driversRes.count ?? 0,
        totalShipments: shipmentsRes.count ?? 0,
        platformFee: totalRevenue * 0.10,
      })
    } catch (err) {
      logger.error('Failed to fetch analytics:', err)
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAnalytics()
    }
  }, [user?.role, fetchAnalytics])

  const handleExport = async (format: 'csv' | 'json' | 'xlsx') => {
    if (exportRows.length === 0) {
      toast.error('No management data available to export')
      return
    }

    setExporting(true)
    try {
      const fileBase = `truckopti-management-earnings-${new Date().toISOString().slice(0, 10)}`

      if (format === 'csv') {
        downloadCsv(exportRows, adminExportColumns, `${fileBase}.csv`)
      } else if (format === 'json') {
        downloadJson(exportRows, `${fileBase}.json`)
      } else {
        await downloadXlsx(exportRows, adminExportColumns, `${fileBase}.xlsx`, 'Management Earnings')
      }

      toast.success(`${format.toUpperCase()} exported successfully!`)
    } catch (err) {
      logger.error('Export error:', err)
      toast.error('Failed to export management data')
    } finally {
      setExporting(false)
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
    <div className="max-w-4xl md:max-w-7xl mx-auto p-4 md:p-8 pb-8 md:pb-12 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary-500" />
            Platform Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">Real-time platform overview</p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-slate-500">Delivered Revenue</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(analytics.totalRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">Agencies + individual drivers</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-slate-500">Agency Revenue</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(analytics.agencyRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">Delivered agency jobs</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-500">Driver Revenue</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(analytics.driverRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">Delivered driver trips</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500">Direct App Revenue</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(analytics.directAppRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">Direct bookings completed by drivers</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-slate-500">Agencies</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{analytics.totalAgencies}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-500">Drivers</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{analytics.totalDrivers}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500">Shipments</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{analytics.totalShipments}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-slate-500">Direct App Bookings</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{analytics.directAppBookingCount}</p>
          <p className="text-xs text-slate-400 mt-1">Est. value {formatCurrency(analytics.directAppBookingValue)}</p>
        </div>
      </div>

      <p className="text-xs text-slate-400">Direct-booking figures exclude shipments already attached to agency jobs, so they reflect the app-driven pipeline separately.</p>

      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm font-medium">Estimated Platform Revenue (10%)</p>
            <p className="text-3xl font-bold text-white mt-1">{formatCurrency(analytics.platformFee)}</p>
            <p className="text-emerald-100/80 text-xs mt-2">Calculated on delivered revenue across agency and driver channels.</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          Revenue Trend (6 Months)
        </h3>
        {revenueTrend.length > 0 && revenueTrend.some((item) => item.revenue > 0) ? (
          <div className="flex items-end justify-between gap-2 h-40">
            {revenueTrend.map((item) => {
              const maxRevenue = Math.max(...revenueTrend.map((entry) => entry.revenue), 1)
              const heightPercent = (item.revenue / maxRevenue) * 100
              return (
                <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full bg-indigo-500 rounded-t-lg transition-all hover:bg-indigo-600 relative group"
                      style={{ height: `${Math.max(heightPercent, 4)}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {formatCurrency(item.revenue)}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{item.month.split(' ')[0]}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No revenue data yet</div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-400" />
            Top Driver Earnings
          </h2>
        </div>
        {driverLeaderboard.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">No delivered driver trips yet</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {driverLeaderboard.map((driver) => (
              <div key={driver.driverName} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{driver.driverName}</p>
                  <p className="text-xs text-slate-400">{driver.trips} completed trip{driver.trips === 1 ? '' : 's'}</p>
                </div>
                <p className="text-sm font-bold text-green-600">{formatCurrency(driver.revenue)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            Recent Revenue Activity
          </h2>
          <div className="flex flex-wrap gap-2">
            {(['csv', 'xlsx', 'json'] as const).map((format) => (
              <button
                key={format}
                onClick={() => void handleExport(format)}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Download size={14} />
                {exporting ? 'Exporting...' : format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {recentJobs.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No revenue activity yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Source</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Owner</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Route</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Amount</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {recentJobs.map((job) => (
                  <tr key={`${job.source}-${job.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{job.source}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{job.ownerName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      <span className="truncate max-w-[200px] block">{job.origin || '—'} → {job.destination || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-600 text-right">{formatCurrency(job.amount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 text-right">
                      {new Date(job.eventDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/admin/users')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Shield className="w-5 h-5 text-indigo-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">User Management</span>
        </button>
        <button
          onClick={() => navigate('/admin/drivers')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Users className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">Manage Drivers</span>
        </button>
        <button
          onClick={() => navigate('/admin/agencies')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Building2 className="w-5 h-5 text-indigo-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">Manage Agencies</span>
        </button>
        <button
          onClick={() => navigate('/admin/payouts')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Wallet className="w-5 h-5 text-green-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">Driver Payouts</span>
        </button>
        <button
          onClick={() => navigate('/admin/contact')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <MessageSquare className="w-5 h-5 text-orange-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">Contact Inquiries</span>
        </button>
        <button
          onClick={() => navigate('/admin/subscriptions')}
          className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <CreditCard className="w-5 h-5 text-purple-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">Subscriptions</span>
        </button>
      </div>
    </div>
  )
}
