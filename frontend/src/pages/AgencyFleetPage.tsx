import { useState, useEffect, useCallback } from 'react'
import {
  Truck, Plus, AlertTriangle, RefreshCw,
  FileCheck, Clock, XCircle, ChevronRight
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface FleetTruck {
  id: string
  vehicle_type: string
  rc_number: string
  insurance_expiry: string | null
  fitness_expiry: string | null
  permit_expiry: string | null
  is_available: boolean
  driver_id: string | null
  agency_id: string
}

interface AgencyRecord {
  id: string
  fleet_size: number | null
}

const VEHICLE_LABELS: Record<string, string> = {
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
}

function expiryStatus(dateStr: string | null): 'ok' | 'soon' | 'expired' {
  if (!dateStr) return 'ok'
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days < 30) return 'soon'
  return 'ok'
}

export default function AgencyFleetPage() {
  const { user } = useAuthStore()
  const [agency, setAgency] = useState<AgencyRecord | null>(null)
  const [trucks, setTrucks] = useState<FleetTruck[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    vehicle_type: 'eicher_14ft',
    rc_number: '',
    insurance_expiry: '',
    fitness_expiry: '',
    permit_expiry: '',
  })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data: agencyData, error: agencyErr } = await supabase
        .from('transport_agencies')
        .select('id, fleet_size')
        .eq('user_id', user.id)
        .maybeSingle()
      if (agencyErr) throw agencyErr
      setAgency(agencyData)

      if (agencyData?.id) {
        const { data: truckData, error: truckErr } = await supabase
          .from('agency_trucks')
          .select('*')
          .eq('agency_id', agencyData.id)
          .order('created_at', { ascending: false })
        if (truckErr) throw truckErr
        setTrucks((truckData ?? []) as FleetTruck[])
      }
    } catch (e) {
      logger.error('[AgencyFleetPage]', e)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddTruck = async () => {
    if (!agency?.id || !addForm.rc_number.trim()) {
      toast.error('RC number is required')
      return
    }
    setSaving(true)
    const { data: newTruck, error } = await supabase
      .from('agency_trucks')
      .insert({
        agency_id: agency.id,
        vehicle_type: addForm.vehicle_type,
        rc_number: addForm.rc_number.trim(),
        insurance_expiry: addForm.insurance_expiry || null,
        fitness_expiry: addForm.fitness_expiry || null,
        permit_expiry: addForm.permit_expiry || null,
      })
      .select()
      .single()
    if (error || !newTruck) {
      toast.error('Failed to add truck')
    } else {
      // Also keep fleet_size count in sync
      const newSize = (agency.fleet_size || 0) + 1
      await supabase.from('transport_agencies').update({ fleet_size: newSize }).eq('id', agency.id)
      setAgency(a => a ? { ...a, fleet_size: newSize } : a)
      setTrucks(prev => [...prev, newTruck as FleetTruck])
      setShowAdd(false)
      setAddForm({ vehicle_type: 'eicher_14ft', rc_number: '', insurance_expiry: '', fitness_expiry: '', permit_expiry: '' })
      toast.success('Truck added to fleet')
    }
    setSaving(false)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Fleet Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {agency?.fleet_size ?? 0} vehicles registered
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

      {/* Add Truck Form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-indigo-200 dark:border-indigo-800/40 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Add New Vehicle</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Vehicle Type</label>
            <select
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
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">RC Number *</label>
            <input
              placeholder="MH12AB1234"
              value={addForm.rc_number}
              onChange={e => setAddForm(f => ({ ...f, rc_number: e.target.value.toUpperCase() }))}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Insurance Expiry</label>
              <input
                type="date"
                value={addForm.insurance_expiry}
                onChange={e => setAddForm(f => ({ ...f, insurance_expiry: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Fitness Expiry</label>
              <input
                type="date"
                value={addForm.fitness_expiry}
                onChange={e => setAddForm(f => ({ ...f, fitness_expiry: e.target.value }))}
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
      {trucks.length === 0 && !showAdd && (
        <div className="text-center py-12">
          <Truck size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            No vehicles added yet. Add your first truck to get started.
          </p>
        </div>
      )}

      {trucks.map(truck => {
        const insuranceStatus = expiryStatus(truck.insurance_expiry)
        const fitnessStatus = expiryStatus(truck.fitness_expiry)
        const hasAlert = insuranceStatus !== 'ok' || fitnessStatus !== 'ok'

        return (
          <div key={truck.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${truck.is_available
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-amber-100 dark:bg-amber-900/30'
                }`}>
                <Truck size={20} className={truck.is_available ? 'text-green-600' : 'text-amber-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                    {VEHICLE_LABELS[truck.vehicle_type] || truck.vehicle_type}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${truck.is_available
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                    {truck.is_available ? 'Available' : 'On Trip'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">RC: {truck.rc_number}</p>
              </div>
            </div>

            {/* Document Status */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {[
                { label: 'Insurance', status: insuranceStatus, expiry: truck.insurance_expiry },
                { label: 'Fitness', status: fitnessStatus, expiry: truck.fitness_expiry },
                { label: 'Permit', status: expiryStatus(truck.permit_expiry), expiry: truck.permit_expiry },
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

            <button className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-medium">
              <ChevronRight size={14} />
              Assign Driver
            </button>
          </div>
        )
      })}
    </div>
  )
}
