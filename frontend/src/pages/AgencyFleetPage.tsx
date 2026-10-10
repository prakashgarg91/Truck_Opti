import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck, Plus, AlertTriangle, RefreshCw,
  FileCheck, Clock, XCircle, ChevronRight, ShieldAlert
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

function expiryStatus(dateStr: string | null): 'ok' | 'soon' | 'expired' {
  if (!dateStr) return 'ok'
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days < 30) return 'soon'
  return 'ok'
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
        toast.success(result.vehicle.is_available ? 'Vehicle marked available' : 'Vehicle marked unavailable')
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
      <div className="min-h-screen flex items-center justify-center" data-testid="fleet-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-label="Loading fleet" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-2xl md:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Fleet Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {trucks.length} vehicles registered
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
        >
          <Plus size={16} />
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
          <AlertTriangle size={36} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">We couldn't load your fleet.</p>
          <p className="text-xs text-slate-400 mt-1">Check your connection and try again.</p>
          <button
            onClick={fetchData}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
          >
            <RefreshCw size={14} />
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
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
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
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-insurance">Insurance Expiry</label>
              <input
                id="fleet-insurance"
                type="date"
                value={addForm.insurance_expiry}
                onChange={e => setAddForm(f => ({ ...f, insurance_expiry: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-fitness">Fitness Expiry</label>
              <input
                id="fleet-fitness"
                type="date"
                value={addForm.fitness_expiry}
                onChange={e => setAddForm(f => ({ ...f, fitness_expiry: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-permit">Permit Expiry</label>
              <input
                id="fleet-permit"
                type="date"
                value={addForm.permit_expiry}
                onChange={e => setAddForm(f => ({ ...f, permit_expiry: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1" htmlFor="fleet-puc">PUC Expiry</label>
              <input
                id="fleet-puc"
                type="date"
                value={addForm.puc_expiry}
                onChange={e => setAddForm(f => ({ ...f, puc_expiry: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={handleAddTruck}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
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
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${truck.maintenance_blocked
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : truck.is_available
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                    {truck.maintenance_blocked ? 'Maintenance' : truck.is_available ? 'Available' : 'On Trip'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">RC: {truck.rc_number}</p>
                {(truck.payload_kg != null || truck.body_length_m != null) && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {truck.payload_kg != null && `Payload: ${truck.payload_kg}kg`}
                    {truck.payload_kg != null && truck.body_length_m != null && ' · '}
                    {truck.body_length_m != null && `Body: ${truck.body_length_m}×${truck.body_width_m ?? '—'}×${truck.body_height_m ?? '—'}m`}
                  </p>
                )}
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
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                  {doc.status === 'expired' ? <XCircle size={10} /> :
                    doc.status === 'soon' ? <Clock size={10} /> :
                      <FileCheck size={10} />}
                  {doc.label}
                  {doc.expiry && ` · ${new Date(doc.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}`}
                </div>
              ))}
            </div>

            {hasAlert && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle size={12} />
                Document expiry alert — renew before it expires
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleToggleAvailability(truck)}
                disabled={togglingId === truck.id}
                aria-label={`${truck.is_available ? 'Mark' : 'Mark'} ${VEHICLE_LABELS[truck.vehicle_type] || truck.vehicle_type} (${truck.rc_number}) ${truck.is_available ? 'unavailable' : 'available'}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium disabled:opacity-60"
              >
                <RefreshCw size={12} className={togglingId === truck.id ? 'animate-spin' : ''} />
                {togglingId === truck.id ? 'Saving...' : truck.is_available ? 'Mark Unavailable' : 'Mark Available'}
              </button>
              <button
                onClick={() => navigate('/agency/drivers')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-medium"
              >
                <ChevronRight size={14} />
                {truck.driver_id ? 'Manage Driver Assignment' : 'Assign Driver'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
