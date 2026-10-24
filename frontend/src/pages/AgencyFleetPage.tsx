import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck, Plus, AlertTriangle, RefreshCw,
  FileCheck, Clock, XCircle, ChevronRight, ShieldAlert,
  CheckCircle2, Wrench
} from 'lucide-react'
import { logger } from '../utils/logger'
import toast from 'react-hot-toast'
import { agencyFleetApi, isAgencyDenial, type FleetVehicle, type VehiclePatch } from '../services/agencyPortalApi'
import { toUserFacingErrorMessage } from '../utils/userFacingError'

const VEHICLE_LABELS: Record<string, string> = {
  tata_ace: 'Tata Ace (750kg)',
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
  volvo_40ft: 'Volvo 40ft Container (25T)',
}

/** Shared keyboard-focus styling for every interactive control (2f54d59c refresh). */
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

/** Status chips pair an icon with the label so status is never color alone (2f54d59c refresh). */
const STATUS_CHIPS = {
  maintenance: { icon: Wrench, classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  onTrip: { icon: Truck, classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  available: { icon: CheckCircle2, classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
} as const

function expiryStatus(dateStr: string | null): 'ok' | 'soon' | 'expired' {
  if (!dateStr) return 'ok'
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days < 30) return 'soon'
  return 'ok'
}

/** Names the most urgent expiring document so the alert says what to renew (2f54d59c refresh). */
function firstDocAlert(truck: FleetVehicle): string | null {
  const docs: { label: string; expiry: string | null }[] = [
    { label: 'Insurance', expiry: truck.insurance_expiry },
    { label: 'Fitness', expiry: truck.fitness_expiry },
    { label: 'Permit', expiry: truck.permit_expiry },
    { label: 'PUC', expiry: truck.puc_expiry },
  ]
  let best: { label: string; days: number } | null = null
  for (const doc of docs) {
    if (!doc.expiry) continue
    const days = Math.ceil((new Date(doc.expiry).getTime() - Date.now()) / 86400000)
    if (days < 30 && (best === null || days < best.days)) best = { label: doc.label, days }
  }
  if (!best) return null
  return best.days < 0
    ? `${best.label} expired ${Math.abs(best.days)} day${Math.abs(best.days) === 1 ? '' : 's'} ago`
    : `${best.label} expires in ${best.days} day${best.days === 1 ? '' : 's'}`
}

export default function AgencyFleetPage() {
  const navigate = useNavigate()
  const [trucks, setTrucks] = useState<FleetVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [denied, setDenied] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    vehicle_type: 'eicher_14ft',
    rc_number: '',
    insurance_expiry: '',
    fitness_expiry: '',
    permit_expiry: '',
    puc_expiry: '',
  })
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setDenied(null)
    try {
      const vehicles = await agencyFleetApi.listVehicles()
      setTrucks(vehicles ?? [])
    } catch (e) {
      logger.error('[AgencyFleetPage]', e)
      if (isAgencyDenial(e)) {
        setDenied(toUserFacingErrorMessage(e, 'Your agency account cannot manage the fleet yet.'))
      } else {
        setLoadError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddTruck = async () => {
    if (!addForm.rc_number.trim()) {
      toast.error('RC number is required')
      return
    }
    setSaving(true)
    try {
      const result = await agencyFleetApi.createVehicle({
        rc_number: addForm.rc_number.trim(),
        vehicle_type: addForm.vehicle_type,
        insurance_expiry: addForm.insurance_expiry || undefined,
        fitness_expiry: addForm.fitness_expiry || undefined,
        permit_expiry: addForm.permit_expiry || undefined,
        puc_expiry: addForm.puc_expiry || undefined,
      })
      if (result.ok && result.state === 'idempotent_replay') {
        toast.success('This vehicle is already in your fleet')
      } else if (result.ok) {
        toast.success('Truck added to fleet')
      }
      setShowAdd(false)
      setAddForm({ vehicle_type: 'eicher_14ft', rc_number: '', insurance_expiry: '', fitness_expiry: '', permit_expiry: '', puc_expiry: '' })
      await fetchData()
    } catch (e) {
      logger.error('[AgencyFleetPage] handleAddTruck failed:', e)
      if (isAgencyDenial(e)) {
        setDenied(toUserFacingErrorMessage(e, 'Your agency account cannot manage the fleet yet.'))
      } else {
        toast.error(toUserFacingErrorMessage(e, 'Failed to add truck'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAvailability = async (truck: FleetVehicle) => {
    if (truck.version == null) return
    setTogglingId(truck.id)
    try {
      const patch: VehiclePatch = { is_available: !truck.is_available }
      const result = await agencyFleetApi.updateVehicle(truck.id, truck.version, patch)
      if (result.ok) {
        toast.success(`Vehicle ${result.vehicle.rc_number} marked ${result.vehicle.is_available ? 'available' : 'unavailable'}`)
      }
      // Single refetch in every outcome; a version conflict surfaces ONE
      // message with the refreshed row — never an auto-retry loop.
      await fetchData()
      if (!result.ok && result.error === 'version_conflict') {
        toast.error('This vehicle was updated elsewhere. Showing the latest version.')
      }
    } catch (e) {
      logger.error('[AgencyFleetPage] handleToggleAvailability failed:', e)
      if (isAgencyDenial(e)) {
        setDenied(toUserFacingErrorMessage(e, 'Your agency account cannot manage the fleet yet.'))
      } else {
        toast.error(toUserFacingErrorMessage(e, 'Failed to update vehicle'))
      }
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="fleet-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-label="Loading fleet" />
        <span className="sr-only">Loading fleet…</span>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-2xl md:max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Fleet Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {trucks.length} vehicles registered
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className={`flex items-center gap-2 min-h-[44px] bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
        >
          <Plus size={16} aria-hidden="true" />
          Add Truck
        </button>
      </div>

      {/* Denied state: a controlled agency denial (approval / profile) is distinct */}
      {denied && (
        <div role="alert" data-testid="fleet-denied" className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl p-4">
          <ShieldAlert size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Action not permitted</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{denied}</p>
          </div>
        </div>
      )}

      {/* Error state: load failure with retry — distinct from empty */}
      {loadError && (
        <div role="alert" data-testid="fleet-error" className="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-800/40">
          <AlertTriangle size={36} className="text-red-400 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">We couldn't load your fleet.</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Check your connection and try again.</p>
          <button
            onClick={fetchData}
            className={`mt-4 inline-flex items-center gap-2 min-h-[44px] px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold ${FOCUS_RING}`}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Add Truck Form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-indigo-200 dark:border-indigo-800/40 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Add New Vehicle</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-vehicle-type">Vehicle Type</label>
            <select
              id="fleet-vehicle-type"
              value={addForm.vehicle_type}
              onChange={e => setAddForm(f => ({ ...f, vehicle_type: e.target.value }))}
              className={`w-full min-h-[44px] border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 ${FOCUS_RING}`}
            >
              {Object.entries(VEHICLE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-rc-number">RC Number *</label>
            <input
              id="fleet-rc-number"
              placeholder="MH12AB1234"
              value={addForm.rc_number}
              onChange={e => setAddForm(f => ({ ...f, rc_number: e.target.value.toUpperCase() }))}
              className={`w-full min-h-[44px] border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 ${FOCUS_RING}`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-insurance">Insurance Expiry</label>
              <input
                id="fleet-insurance"
                type="date"
                value={addForm.insurance_expiry}
                onChange={e => setAddForm(f => ({ ...f, insurance_expiry: e.target.value }))}
                className={`w-full min-h-[44px] border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 ${FOCUS_RING}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-fitness">Fitness Expiry</label>
              <input
                id="fleet-fitness"
                type="date"
                value={addForm.fitness_expiry}
                onChange={e => setAddForm(f => ({ ...f, fitness_expiry: e.target.value }))}
                className={`w-full min-h-[44px] border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 ${FOCUS_RING}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-permit">Permit Expiry</label>
              <input
                id="fleet-permit"
                type="date"
                value={addForm.permit_expiry}
                onChange={e => setAddForm(f => ({ ...f, permit_expiry: e.target.value }))}
                className={`w-full min-h-[44px] border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 ${FOCUS_RING}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-puc">PUC Expiry</label>
              <input
                id="fleet-puc"
                type="date"
                value={addForm.puc_expiry}
                onChange={e => setAddForm(f => ({ ...f, puc_expiry: e.target.value }))}
                className={`w-full min-h-[44px] border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 ${FOCUS_RING}`}
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setShowAdd(false)}
              className={`flex-1 min-h-[44px] py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={handleAddTruck}
              className={`flex-1 min-h-[44px] py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 ${FOCUS_RING}`}
            >
              {saving ? 'Adding...' : 'Add Truck'}
            </button>
          </div>
        </div>
      )}

      {/* Truck List */}
      {trucks.length === 0 && !showAdd && !loadError && (
        <div className="text-center py-12" data-testid="fleet-empty">
          <Truck size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            No vehicles added yet. Add your first truck to get started.
          </p>
        </div>
      )}

      {/* Fleet grid: 2 columns on wide desktop, single column below (2f54d59c refresh) */}
      {trucks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5 items-start">
          {trucks.map(truck => {
        const insuranceStatus = expiryStatus(truck.insurance_expiry)
        const fitnessStatus = expiryStatus(truck.fitness_expiry)
        const hasAlert = insuranceStatus !== 'ok' || fitnessStatus !== 'ok' || expiryStatus(truck.permit_expiry) !== 'ok' || expiryStatus(truck.puc_expiry) !== 'ok'

        return (
          <div key={truck.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm" data-testid="fleet-vehicle-card">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${truck.is_available && !truck.maintenance_blocked
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-amber-100 dark:bg-amber-900/30'
                }`}>
                <Truck size={20} className={truck.is_available && !truck.maintenance_blocked ? 'text-green-600' : 'text-amber-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                    {VEHICLE_LABELS[truck.vehicle_type] || truck.vehicle_type}
                  </p>
                  {(() => {
                    const chip = truck.maintenance_blocked ? STATUS_CHIPS.maintenance : truck.is_available ? STATUS_CHIPS.available : STATUS_CHIPS.onTrip
                    const ChipIcon = chip.icon
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${chip.classes}`}>
                        <ChipIcon size={11} aria-hidden="true" />
                        {truck.maintenance_blocked ? 'Maintenance' : truck.is_available ? 'Available' : 'On Trip'}
                      </span>
                    )
                  })()}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">RC: {truck.rc_number}</p>
                {(truck.payload_kg != null || truck.body_length_m != null) && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {truck.payload_kg != null && `Payload: ${truck.payload_kg}kg`}
                    {truck.payload_kg != null && truck.body_length_m != null && ' · '}
                    {truck.body_length_m != null && `Body: ${truck.body_length_m}×${truck.body_width_m ?? '—'}×${truck.body_height_m ?? '—'}m`}
                  </p>
                )}
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {truck.driver_id ? 'Driver: assigned' : 'Unassigned'}
                </p>
              </div>
            </div>

            {/* Document Status */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {[
                { label: 'Insurance', status: insuranceStatus, expiry: truck.insurance_expiry },
                { label: 'Fitness', status: fitnessStatus, expiry: truck.fitness_expiry },
                { label: 'Permit', status: expiryStatus(truck.permit_expiry), expiry: truck.permit_expiry },
                { label: 'PUC', status: expiryStatus(truck.puc_expiry), expiry: truck.puc_expiry },
              ].map(doc => (
                <div key={doc.label} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${doc.status === 'expired'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : doc.status === 'soon'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                  {doc.status === 'expired' ? <XCircle size={10} aria-hidden="true" /> :
                    doc.status === 'soon' ? <Clock size={10} aria-hidden="true" /> :
                      <FileCheck size={10} aria-hidden="true" />}
                  {doc.label}
                  {doc.expiry && ` · ${new Date(doc.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}`}
                </div>
              ))}
            </div>

            {hasAlert && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>Document expiry alert — {firstDocAlert(truck)}. Renew before it expires to prevent dispatch blockage.</span>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleToggleAvailability(truck)}
                disabled={togglingId === truck.id}
                aria-label={`${truck.is_available ? 'Mark' : 'Mark'} ${VEHICLE_LABELS[truck.vehicle_type] || truck.vehicle_type} (${truck.rc_number}) ${truck.is_available ? 'unavailable' : 'available'}`}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium disabled:opacity-60 ${FOCUS_RING}`}
              >
                <RefreshCw size={12} aria-hidden="true" className={togglingId === truck.id ? 'animate-spin' : ''} />
                {togglingId === truck.id ? 'Saving...' : truck.is_available ? 'Mark Unavailable' : 'Mark Available'}
              </button>
              <button
                onClick={() => navigate('/agency/drivers')}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-medium ${FOCUS_RING}`}
              >
                <ChevronRight size={14} aria-hidden="true" />
                {truck.driver_id ? 'Manage Driver Assignment' : 'Assign Driver'}
              </button>
            </div>
          </div>
        )
          })}
        </div>
      )}
    </div>
  )
}
