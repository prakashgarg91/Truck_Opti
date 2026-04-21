import { useState, useEffect, useCallback } from 'react'
import {
  Tag, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'

interface RateCard {
  id: string
  agency_id: string
  vehicle_type: string
  origin_city: string
  dest_city: string
  rate_per_km: number | null
  flat_rate: number | null
  min_weight_kg: number | null
  max_weight_kg: number | null
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  notes: string | null
}

const VEHICLE_LABELS: Record<string, string> = {
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
}

const EMPTY_FORM = {
  vehicle_type: 'eicher_14ft',
  origin_city: '',
  dest_city: '',
  rate_per_km: '',
  flat_rate: '',
  min_weight_kg: '',
  max_weight_kg: '',
  valid_until: '',
  notes: '',
}

export default function AgencyRatesPage() {
  const { user } = useAuthStore()
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [rates, setRates] = useState<RateCard[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data: agency, error: agencyErr } = await supabase
        .from('transport_agencies').select('id').eq('user_id', user.id).maybeSingle()
      if (agencyErr) throw agencyErr
      if (!agency?.id) return
      setAgencyId(agency.id)

      const { data, error: ratesErr } = await supabase
        .from('agency_rate_cards')
        .select('*')
        .eq('agency_id', agency.id)
        .order('created_at', { ascending: false })
      if (ratesErr) throw ratesErr
      setRates((data ?? []) as RateCard[])
    } catch (e) {
      logger.error('[AgencyRatesPage]', e)
      toast.error('Failed to load rate cards')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAdd = async () => {
    if (!agencyId) return
    if (!form.origin_city.trim() || !form.dest_city.trim()) {
      toast.error('Origin and destination city are required')
      return
    }
    if (!form.rate_per_km && !form.flat_rate) {
      toast.error('Enter either rate per km or a flat rate')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('agency_rate_cards')
      .insert({
        agency_id: agencyId,
        vehicle_type: form.vehicle_type,
        origin_city: form.origin_city.trim(),
        dest_city: form.dest_city.trim(),
        rate_per_km: form.rate_per_km ? parseFloat(form.rate_per_km) : null,
        flat_rate: form.flat_rate ? parseFloat(form.flat_rate) : null,
        min_weight_kg: form.min_weight_kg ? parseFloat(form.min_weight_kg) : null,
        max_weight_kg: form.max_weight_kg ? parseFloat(form.max_weight_kg) : null,
        valid_until: form.valid_until || null,
        notes: form.notes || null,
      })
      .select()
      .single()
    if (error || !data) {
      toast.error('Failed to add rate card')
    } else {
      setRates(prev => [data as RateCard, ...prev])
      setForm(EMPTY_FORM)
      setShowAdd(false)
      toast.success('Rate card added!')
    }
    setSaving(false)
  }

  const handleToggleActive = async (rate: RateCard) => {
    const { error } = await supabase
      .from('agency_rate_cards')
      .update({ is_active: !rate.is_active })
      .eq('id', rate.id)
    if (error) {
      toast.error('Failed to update')
    } else {
      setRates(prev => prev.map(r => r.id === rate.id ? { ...r, is_active: !r.is_active } : r))
      toast.success(rate.is_active ? 'Rate deactivated' : 'Rate activated')
    }
  }

  const handleDelete = async (rateId: string) => {
    if (!confirm('Delete this rate card?')) return
    const { error } = await supabase.from('agency_rate_cards').delete().eq('id', rateId)
    if (error) {
      toast.error('Failed to delete')
    } else {
      setRates(prev => prev.filter(r => r.id !== rateId))
      toast.success('Rate card deleted')
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Rate Cards</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {rates.filter(r => r.is_active).length} active rates
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
        >
          <Plus size={16} />
          Add Rate
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-indigo-200 dark:border-indigo-800/40 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">New Rate Card</h3>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Vehicle Type</label>
            <select
              value={form.vehicle_type}
              onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            >
              {Object.entries(VEHICLE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Origin City *</label>
              <input
                placeholder="Mumbai"
                value={form.origin_city}
                onChange={e => setForm(f => ({ ...f, origin_city: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Destination *</label>
              <input
                placeholder="Pune"
                value={form.dest_city}
                onChange={e => setForm(f => ({ ...f, dest_city: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Rate per km (₹)</label>
              <input
                type="number"
                placeholder="25"
                value={form.rate_per_km}
                onChange={e => setForm(f => ({ ...f, rate_per_km: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Flat Rate (₹)</label>
              <input
                type="number"
                placeholder="8000"
                value={form.flat_rate}
                onChange={e => setForm(f => ({ ...f, flat_rate: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Min Weight (kg)</label>
              <input
                type="number"
                placeholder="0"
                value={form.min_weight_kg}
                onChange={e => setForm(f => ({ ...f, min_weight_kg: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Max Weight (kg)</label>
              <input
                type="number"
                placeholder="3000"
                value={form.max_weight_kg}
                onChange={e => setForm(f => ({ ...f, max_weight_kg: e.target.value }))}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Valid Until</label>
            <input
              type="date"
              value={form.valid_until}
              onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Notes (optional)</label>
            <input
              placeholder="e.g. Includes tolls, AC vehicle only"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setShowAdd(false); setForm(EMPTY_FORM) }}
              className="flex-1 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={handleAdd}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Adding...' : 'Add Rate'}
            </button>
          </div>
        </div>
      )}

      {/* Rate Cards List */}
      {rates.length === 0 && !showAdd && (
        <div className="text-center py-12">
          <Tag size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No rate cards yet</p>
          <p className="text-slate-400 text-xs mt-1">
            Add rate cards to let customers see your freight pricing.
          </p>
        </div>
      )}

      {rates.map(rate => (
        <div
          key={rate.id}
          className={`bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm ${!rate.is_active ? 'opacity-60' : ''
            }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                {rate.origin_city} → {rate.dest_city}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {VEHICLE_LABELS[rate.vehicle_type] || rate.vehicle_type}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => handleToggleActive(rate)} className="text-slate-400 hover:text-indigo-600">
                {rate.is_active
                  ? <ToggleRight size={22} className="text-indigo-600" />
                  : <ToggleLeft size={22} />}
              </button>
              <button onClick={() => handleDelete(rate.id)} className="text-slate-400 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {rate.rate_per_km != null && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg px-2.5 py-1 text-green-700 dark:text-green-400 text-xs font-semibold">
                ₹{rate.rate_per_km}/km
              </div>
            )}
            {rate.flat_rate != null && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2.5 py-1 text-blue-700 dark:text-blue-400 text-xs font-semibold">
                {formatCurrency(rate.flat_rate)} flat
              </div>
            )}
            {(rate.min_weight_kg != null || rate.max_weight_kg != null) && (
              <div className="text-xs text-slate-400">
                {rate.min_weight_kg ?? 0}–{rate.max_weight_kg ?? '∞'} kg
              </div>
            )}
          </div>

          {rate.valid_until && (
            <p className="text-xs text-slate-400 mt-1.5">
              Valid until {new Date(rate.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          )}
          {rate.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">{rate.notes}</p>
          )}
        </div>
      ))}
    </div>
  )
}
