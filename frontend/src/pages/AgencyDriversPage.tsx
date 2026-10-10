import { useState, useEffect, useCallback } from 'react'
import {
  Users, Truck, Star, RefreshCw, AlertTriangle,
  Phone, MapPin, CheckCircle2, XCircle, Wallet, ShieldAlert, FileText
} from 'lucide-react'
import { agencyDriversApi, isAgencyDenial, type DriverEmployment } from '../services/agencyPortalApi'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'

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
  const [drivers, setDrivers] = useState<AssignedDriver[]>([])
  const [trucks, setTrucks] = useState<AgencyTruck[]>([])
  const [employments, setEmployments] = useState<DriverEmployment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [denied, setDenied] = useState<string | null>(null)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [assignModal, setAssignModal] = useState<{ driverId: string; driverName: string } | null>(null)
  const [payModal, setPayModal] = useState<{ driverId: string; driverName: string } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setLoadError(false)
    setDenied(null)
    try {
      const snapshot = await agencyDriversApi.getSnapshot()
      setTrucks(snapshot.trucks as AgencyTruck[])
      setDrivers(snapshot.drivers as AssignedDriver[])
      // TO-144-D1: RLS-scoped employment records. A controlled agency denial
      // (approval/profile) renders the denied state; any other failure is the
      // retryable error state — the assigned-driver list above still shows.
      try {
        const records = await agencyDriversApi.listEmployments()
        setEmployments(records ?? [])
      } catch (empError) {
        logger.error('[AgencyDriversPage] listEmployments', empError)
        if (isAgencyDenial(empError)) {
          setDenied(toUserFacingErrorMessage(empError, 'Your agency account cannot manage driver records yet.'))
        } else {
          setLoadError(true)
        }
        setEmployments([])
      }
    } catch (error) {
      logger.error('[AgencyDriversPage] fetchData', error)
      toast.error('Failed to load drivers')
      setLoadError(true)
      setDrivers([])
      setTrucks([])
      setEmployments([])
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleEndEmployment = async (employment: DriverEmployment) => {
    setEndingId(employment.id)
    try {
      const result = await agencyDriversApi.endEmployment(employment.id, employment.version)
      if (result.ok && result.state === 'already_ended') {
        toast.success('Employment already ended')
      } else if (result.ok) {
        toast.success('Employment ended')
      }
      // One refetch in every outcome; a version conflict surfaces ONE
      // message with the refreshed record — never an auto-retry loop.
      try {
        const records = await agencyDriversApi.listEmployments()
        setEmployments(records ?? [])
      } catch (refetchError) {
        logger.error('[AgencyDriversPage] listEmployments', refetchError)
      }
      if (!result.ok && result.error === 'version_conflict') {
        toast.error('This record changed elsewhere. Showing the latest version.')
      }
    } catch (e) {
      logger.error('[AgencyDriversPage] handleEndEmployment', e)
      if (isAgencyDenial(e)) {
        setDenied(toUserFacingErrorMessage(e, 'Your agency account cannot manage driver records yet.'))
      } else {
        toast.error(toUserFacingErrorMessage(e, 'Failed to end employment'))
      }
    } finally {
      setEndingId(null)
    }
  }

  const handleAssignTruck = async () => {
    if (!assignModal || !selectedTruckId) return
    setSaving(true)
    try {
      await agencyDriversApi.assignTruckToDriver(selectedTruckId, assignModal.driverId)
      toast.success(`Truck assigned to ${assignModal.driverName}`)
      setAssignModal(null)
      setSelectedTruckId('')
      fetchData()
    } catch (_error) {
      toast.error('Failed to assign truck')
    }
    setSaving(false)
  }

  const handleUnassign = async (truckId: string, driverName: string) => {
    try {
      await agencyDriversApi.unassignTruck(truckId)
      toast.success(`${driverName} unassigned from truck`)
      setDrivers(prev => prev.filter(d => d.truck_id !== truckId))
    } catch (_error) {
      toast.error('Failed to unassign')
    }
  }

  const handlePayDriver = async () => {
    if (!payModal || !payAmount) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount < 1) {
      toast.error('Enter a valid amount (min ₹1)')
      return
    }
    setSaving(true)
    try {
      await agencyDriversApi.createPayout(payModal.driverId, amount, payNote || undefined)
    } catch (error) {
      logger.error('[AgencyDrivers] pay:', error)
      toast.error('Payment failed')
      setSaving(false)
      return
    }
    toast.success('Payment request submitted for admin review')
    setPayModal(null)
    setPayAmount('')
    setPayNote('')
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="drivers-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-label="Loading drivers" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-7xl mx-auto">
      {/* Denied state: a controlled agency denial is distinct from load errors */}
      {denied && (
        <div role="alert" data-testid="drivers-denied" className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl p-4">
          <ShieldAlert size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Action not permitted</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{denied}</p>
          </div>
        </div>
      )}

      {/* Error state: employment load failure with retry — distinct from empty */}
      {loadError && (
        <div role="alert" data-testid="drivers-error" className="text-center py-8 bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-800/40">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">We couldn't load driver records.</p>
          <button
            onClick={fetchData}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}
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
      </div>

      {/* Assigned Drivers */}
      {drivers.length === 0 ? (
        <div className="text-center py-12">
          <Users size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No drivers assigned yet</p>
          <p className="text-slate-400 text-xs mt-1">Assigned drivers will appear here once onboarding and truck linking are complete.</p>
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

      {/* Employment Records (TO-144-D1): RLS-scoped, licence window + expected-version end */}
      <div data-testid="employments-panel">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Employment Records</h2>
          <p className="text-xs text-slate-400">{employments.filter(e => e.status === 'active').length} active</p>
        </div>

        {employments.filter(e => e.status === 'active').length === 0 && !loadError ? (
          <div className="text-center py-8" data-testid="employments-empty">
            <FileText size={36} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">No employment records yet.</p>
            <p className="text-slate-400 text-xs mt-1">Licence and employment records appear here once drivers are onboarded.</p>
          </div>
        ) : (
          employments.filter(e => e.status === 'active').map(emp => {
            const licenceStatus = emp.licence_expiry ? expiryStatus(emp.licence_expiry) : 'ok'
            return (
              <div key={emp.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm" data-testid="employment-card">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                    <FileText size={20} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                        {emp.licence_number || 'Employment record'}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${licenceStatus === 'expired'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : licenceStatus === 'soon'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                        {emp.licence_expiry
                          ? `Licence · ${new Date(emp.licence_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}`
                          : 'Active'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {emp.licence_class && `Class: ${emp.licence_class}`}
                      {emp.licence_class && emp.contact_phone && ' · '}
                      {emp.contact_phone}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleEndEmployment(emp)}
                  disabled={endingId === emp.id}
                  aria-label={`End employment record ${emp.licence_number || emp.id}`}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium disabled:opacity-60"
                >
                  <XCircle size={12} />
                  {endingId === emp.id ? 'Ending...' : 'End Employment'}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function expiryStatus(dateStr: string | null): 'ok' | 'soon' | 'expired' {
  if (!dateStr) return 'ok'
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days < 30) return 'soon'
  return 'ok'
}
