import { useState, useEffect, useCallback } from 'react'
import {
  Users, Truck, Star, RefreshCw, AlertTriangle,
  Phone, MapPin, Share2, CheckCircle2, XCircle, Wallet
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface AssignedDriver {
  id: string
  full_name: string
  phone: string
  vehicle_type: string
  home_city: string | null
  rating: number | null
  total_trips: number | null
  status: string
  is_online: boolean
  active_job_id: string | null
  truck_id: string | null
}

interface AgencyTruck {
  id: string
  vehicle_type: string
  rc_number: string
}

const VEHICLE_LABELS: Record<string, string> = {
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
}

export default function AgencyDriversPage() {
  const { user } = useAuthStore()
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [drivers, setDrivers] = useState<AssignedDriver[]>([])
  const [trucks, setTrucks] = useState<AgencyTruck[]>([])
  const [loading, setLoading] = useState(true)
  const [assignModal, setAssignModal] = useState<{ driverId: string; driverName: string } | null>(null)
  const [payModal, setPayModal] = useState<{ driverId: string; driverName: string } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    const { data: agency } = await supabase
      .from('transport_agencies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!agency?.id) { setLoading(false); return }
    setAgencyId(agency.id)

    const [{ data: truckData }, { data: driverData }] = await Promise.all([
      supabase.from('agency_trucks').select('id, vehicle_type, rc_number').eq('agency_id', agency.id),
      supabase.from('agency_trucks').select(`
        id,
        driver_id,
        vehicle_type,
        rc_number,
        drivers!agency_trucks_driver_id_fkey (
          id, full_name, phone, vehicle_type, home_city,
          rating, total_trips, status, is_online, active_job_id
        )
      `).eq('agency_id', agency.id).not('driver_id', 'is', null),
    ])

    setTrucks((truckData ?? []) as AgencyTruck[])

    // Flatten trucks-with-drivers into driver list
    const assigned: AssignedDriver[] = []
    for (const t of (driverData ?? []) as Record<string, unknown>[]) {
      const d = (Array.isArray(t.drivers) ? t.drivers[0] : t.drivers) as Record<string, unknown> | null
      if (d) {
        assigned.push({
          ...(d as unknown as AssignedDriver),
          truck_id: t.id as string,
        })
      }
    }
    setDrivers(assigned)
    setLoading(false)
  }, [user?.id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAssignTruck = async () => {
    if (!assignModal || !selectedTruckId || !agencyId) return
    setSaving(true)
    const { error } = await supabase
      .from('agency_trucks')
      .update({ driver_id: assignModal.driverId })
      .eq('id', selectedTruckId)
      .eq('agency_id', agencyId)
    if (error) {
      toast.error('Failed to assign truck')
    } else {
      toast.success(`Truck assigned to ${assignModal.driverName}`)
      setAssignModal(null)
      setSelectedTruckId('')
      fetchData()
    }
    setSaving(false)
  }

  const handleUnassign = async (truckId: string, driverName: string) => {
    const { error } = await supabase
      .from('agency_trucks')
      .update({ driver_id: null })
      .eq('id', truckId)
      .eq('agency_id', agencyId!)
    if (error) {
      toast.error('Failed to unassign')
    } else {
      toast.success(`${driverName} unassigned from truck`)
      setDrivers(prev => prev.filter(d => d.truck_id !== truckId))
    }
  }

  const handlePayDriver = async () => {
    if (!payModal || !payAmount || !agencyId) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount < 1) {
      toast.error('Enter a valid amount (min ₹1)')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('driver_payouts').insert({
      driver_id: payModal.driverId,
      agency_id: agencyId,
      amount: amount,
      type: 'agency_pay',
      status: 'paid',
      note: payNote || null
    })
    if (error) {
      logger.error('[AgencyDrivers] pay:', error)
      toast.error('Payment failed')
      setSaving(false)
      return
    }
    toast.success('Payment recorded')
    setPayModal(null)
    setPayAmount('')
    setPayNote('')
    setSaving(false)
  }

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/driver/register?ref=${agencyId}`

    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard access is unavailable')
      return
    }

    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invite link copied!')
    } catch (error) {
      logger.error('Failed to copy invite link:', error)
      toast.error('Failed to copy invite link')
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
    <div className="p-4 lg:p-8 space-y-4 max-w-7xl mx-auto">
      {/* Assign Truck Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Assign Truck</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Assigning a truck to <strong>{assignModal.driverName}</strong>
            </p>
            <select
              value={selectedTruckId}
              onChange={e => setSelectedTruckId(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 mb-4"
            >
              <option value="">— Select a truck —</option>
              {trucks.map(t => (
                <option key={t.id} value={t.id}>
                  {VEHICLE_LABELS[t.vehicle_type] || t.vehicle_type} · {t.rc_number}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setAssignModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                disabled={!selectedTruckId || saving}
                onClick={handleAssignTruck}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {saving ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Driver Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
              {'Pay Driver'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {'Recording payment for'}{' '}
              <strong>{payModal.driverName}</strong>
            </p>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {'Amount (₹)'} *
                </label>
                <input
                  type="number"
                  min="1"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder={'Enter amount'}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {'Note (optional)'}
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  placeholder={'Monthly salary'}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setPayModal(null); setPayAmount(''); setPayNote('') }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium"
              >
                {'Cancel'}
              </button>
              <button
                disabled={!payAmount || saving}
                onClick={handlePayDriver}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {saving ? ('Processing...') : ('Record Payment')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Drivers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {drivers.length} assigned, {trucks.filter(t => !drivers.find(d => d.truck_id === t.id)).length} trucks available
          </p>
        </div>
        <button
          onClick={copyInviteLink}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
        >
          <Share2 size={14} />
          Invite Driver
        </button>
      </div>

      {/* Invite Banner */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 border border-indigo-200 dark:border-indigo-800/40">
        <div className="flex items-start gap-3">
          <Users size={18} className="text-indigo-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">Invite Drivers</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
              Share your agency invite link with drivers. When they register using your link, they'll appear here.
            </p>
            <button
              onClick={copyInviteLink}
              className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-400 underline"
            >
              Copy invite link →
            </button>
          </div>
        </div>
      </div>

      {/* Assigned Drivers */}
      {drivers.length === 0 ? (
        <div className="text-center py-12">
          <Users size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No drivers assigned yet</p>
          <p className="text-slate-400 text-xs mt-1">Invite drivers using the button above</p>
        </div>
      ) : (
        drivers.map(driver => (
          <div key={driver.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                <Users size={20} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{driver.full_name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${driver.is_online
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                    {driver.is_online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Phone size={10} />{driver.phone}</span>
                  {driver.home_city && <span className="flex items-center gap-1"><MapPin size={10} />{driver.home_city}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Star size={10} className="text-amber-400" />
                    {driver.rating?.toFixed(1) ?? '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Truck size={10} />
                    {driver.total_trips ?? 0} trips
                  </span>
                  {driver.active_job_id ? (
                    <span className="text-blue-600 dark:text-blue-400 font-medium">On Trip</span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">Available</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <a
                href={`tel:${driver.phone}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium"
              >
                <Phone size={12} />
                Call
              </a>
              <button
                onClick={() => setPayModal({ driverId: driver.id, driverName: driver.full_name })}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl text-xs font-medium"
              >
                <Wallet size={12} />
                {'Pay'}
              </button>
              {driver.truck_id ? (
                <button
                  onClick={() => handleUnassign(driver.truck_id!, driver.full_name)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium"
                >
                  <XCircle size={12} />
                  Unassign Truck
                </button>
              ) : (
                <button
                  onClick={() => setAssignModal({ driverId: driver.id, driverName: driver.full_name })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl text-xs font-medium"
                >
                  <CheckCircle2 size={12} />
                  Assign Truck
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {/* Unassigned Trucks */}
      {trucks.some(t => !drivers.find(d => d.truck_id === t.id)) && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/40">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Unassigned Trucks</span>
          </div>
          {trucks.filter(t => !drivers.find(d => d.truck_id === t.id)).map(t => (
            <div key={t.id} className="flex items-center justify-between py-1.5 text-sm text-amber-700 dark:text-amber-400">
              <span>{VEHICLE_LABELS[t.vehicle_type] || t.vehicle_type} · {t.rc_number}</span>
              <span className="text-xs">No driver</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
