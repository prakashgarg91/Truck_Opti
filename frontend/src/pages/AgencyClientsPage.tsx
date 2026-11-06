import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, FileText, MapPin, Pencil, Phone, Plus, RefreshCw, Search, ShieldAlert, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyClientsApi,
  type AgreementRow,
  type ContactRow,
  type SiteKind,
  type SiteRow,
} from '../services/agencyOrganizationApi'

// TO-144-D2 Client Agreements & Sites (Stitch screen 0768c6ac). Master-detail:
// searchable agreement list on the left, sites and contacts of the selected
// agreement on the right. The server (RLS + command RPCs) is the authority;
// this page renders states and adds only plain input validation (GSTIN,
// pincode, payment terms). Ended agreements are read-only until reactivated.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PINCODE_PATTERN = /^[0-9]{6}$/

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
]

const SITE_KINDS: ReadonlyArray<{ value: SiteKind; label: string }> = [
  { value: 'bill_to', label: 'Bill-to (invoice address)' },
  { value: 'ship_to', label: 'Ship-to (loading point)' },
]

const GSTIN_HINT = 'Enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5.'
const TERMS_HINT = 'Payment terms must be between 0 and 365 days.'
const PINCODE_HINT = 'Pincode must be 6 digits.'

type FieldError = { field: string; message: string }
type Confirm = { kind: 'end-agreement' } | { kind: 'deactivate-site'; site: SiteRow }

function StatusBadge({ status }: { status: string }) {
  const good = status === 'active'
  const Icon = good ? Check : X
  const tone = good
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : 'bg-slate-100 text-slate-700 border-slate-300'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function AgencyClientsPage() {
  useEffect(() => {
    document.title = 'Clients - TruckOpti'
  }, [])

  const [agreements, setAgreements] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'sites' | 'contacts'>('sites')

  const [sites, setSites] = useState<SiteRow[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)

  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientGstin, setNewClientGstin] = useState('')
  const [newClientTerms, setNewClientTerms] = useState('')
  const [newClientError, setNewClientError] = useState<FieldError | null>(null)
  // One idempotency key per create intent; a failed submit can be retried safely.
  const addClientKey = useRef<string | null>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editGstin, setEditGstin] = useState('')
  const [editTerms, setEditTerms] = useState('')
  const [editError, setEditError] = useState<FieldError | null>(null)

  const [showAddSite, setShowAddSite] = useState(false)
  const [siteKind, setSiteKind] = useState<SiteKind>('bill_to')
  const [siteLabel, setSiteLabel] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [siteCity, setSiteCity] = useState('')
  const [siteState, setSiteState] = useState('')
  const [sitePincode, setSitePincode] = useState('')
  const [siteError, setSiteError] = useState<FieldError | null>(null)
  const addSiteKey = useRef<string | null>(null)

  const [showAddContact, setShowAddContact] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactSite, setContactSite] = useState('')
  const [contactError, setContactError] = useState<FieldError | null>(null)
  const addContactKey = useRef<string | null>(null)

  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const fetchAgreements = useCallback(async () => {
    try {
      setError(null)
      const rows = await agencyClientsApi.listAgreements()
      setAgreements(rows)
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyClientsPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load clients')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (agreementId: string) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const [s, c] = await Promise.all([agencyClientsApi.listSites(agreementId), agencyClientsApi.listContacts(agreementId)])
      setSites(s)
      setContacts(c)
    } catch (e) {
      logger.error('[AgencyClientsPage] detail load failed:', e)
      setDetailError(toUserFacingErrorMessage(e, 'Failed to load client details'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgreements()
  }, [fetchAgreements])

  const selected = useMemo(() => agreements.find((a) => a.id === selectedId) ?? null, [agreements, selectedId])
  const ended = selected?.status === 'ended'

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
  }, [selectedId, fetchDetail])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return agreements
    return agreements.filter(
      (a) => a.client_name.toLowerCase().includes(needle) || (a.client_gstin ?? '').toLowerCase().includes(needle)
    )
  }, [agreements, query])

  const billToSites = useMemo(() => sites.filter((s) => s.site_kind === 'bill_to'), [sites])
  const shipToSites = useMemo(() => sites.filter((s) => s.site_kind === 'ship_to'), [sites])
  const siteLabelById = useMemo(() => new Map(sites.map((s) => [s.id, s.label])), [sites])

  const closeDialogs = () => {
    setShowNewClient(false)
    setShowEdit(false)
    setShowAddSite(false)
    setShowAddContact(false)
    setConfirm(null)
  }

  const selectClient = (id: string) => {
    closeDialogs()
    setTab('sites')
    setSelectedId(id)
  }

  const parseTerms = (raw: string): number | undefined | 'invalid' => {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n < 0 || n > 365) return 'invalid'
    return n
  }

  const openNewClient = () => {
    setNewClientName('')
    setNewClientGstin('')
    setNewClientTerms('')
    setNewClientError(null)
    setShowNewClient(true)
  }

  const handleCreateClient = async (event: FormEvent) => {
    event.preventDefault()
    const name = newClientName.trim()
    if (!name) {
      setNewClientError({ field: 'name', message: 'Client name is required.' })
      return
    }
    const gstin = newClientGstin.trim().toUpperCase()
    if (gstin && !GSTIN_PATTERN.test(gstin)) {
      setNewClientError({ field: 'gstin', message: GSTIN_HINT })
      return
    }
    const terms = parseTerms(newClientTerms)
    if (terms === 'invalid') {
      setNewClientError({ field: 'terms', message: TERMS_HINT })
      return
    }
    if (!addClientKey.current) addClientKey.current = crypto.randomUUID()
    setBusy(true)
    try {
      const result = await agencyClientsApi.createAgreement({
        clientName: name,
        clientGstin: gstin || undefined,
        paymentTermsDays: terms,
        idempotencyKey: addClientKey.current,
      })
      if (!result.ok) {
        toast.error(result.message)
        if (result.error === 'idempotency_key_reused') addClientKey.current = null
        await fetchAgreements()
        return
      }
      toast.success('Client agreement saved')
      addClientKey.current = null
      setShowNewClient(false)
      setNewClientName('')
      setNewClientGstin('')
      setNewClientTerms('')
      setNewClientError(null)
      // Single refetch in every completed outcome; never an automatic retry.
      await fetchAgreements()
    } catch (e) {
      logger.error('[AgencyClientsPage] create agreement failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to save client agreement'))
    } finally {
      setBusy(false)
    }
  }

  const openEdit = () => {
    if (!selected) return
    setEditName(selected.client_name)
    setEditGstin(selected.client_gstin ?? '')
    setEditTerms(selected.payment_terms_days != null ? String(selected.payment_terms_days) : '')
    setEditError(null)
    setShowEdit(true)
  }

  const handleEditAgreement = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    const name = editName.trim()
    if (!name) {
      setEditError({ field: 'name', message: 'Client name is required.' })
      return
    }
    const gstin = editGstin.trim().toUpperCase()
    if (gstin && !GSTIN_PATTERN.test(gstin)) {
      setEditError({ field: 'gstin', message: GSTIN_HINT })
      return
    }
    const terms = parseTerms(editTerms)
    if (terms === 'invalid') {
      setEditError({ field: 'terms', message: TERMS_HINT })
      return
    }
    setBusy(true)
    try {
      const result = await agencyClientsApi.updateAgreement(selected.id, selected.version, {
        client_name: name,
        client_gstin: gstin || null,
        payment_terms_days: terms ?? null,
      })
      if (result.ok) toast.success('Agreement updated')
      else toast.error(result.message)
      setShowEdit(false)
      await fetchAgreements()
    } catch (e) {
      logger.error('[AgencyClientsPage] update agreement failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to save client agreement'))
    } finally {
      setBusy(false)
    }
  }

  const handleReactivate = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const result = await agencyClientsApi.updateAgreement(selected.id, selected.version, { status: 'active' })
      if (result.ok) toast.success('Agreement reactivated')
      else toast.error(result.message)
      await fetchAgreements()
    } catch (e) {
      logger.error('[AgencyClientsPage] reactivate failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to reactivate agreement'))
    } finally {
      setBusy(false)
    }
  }

  const openAddSite = () => {
    setSiteKind('bill_to')
    setSiteLabel('')
    setSiteAddress('')
    setSiteCity('')
    setSiteState('')
    setSitePincode('')
    setSiteError(null)
    setShowAddSite(true)
  }

  const handleCreateSite = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || ended) return
    const label = siteLabel.trim()
    if (!label) {
      setSiteError({ field: 'label', message: 'Label is required.' })
      return
    }
    const address = siteAddress.trim()
    if (!address) {
      setSiteError({ field: 'address', message: 'Address is required.' })
      return
    }
    const city = siteCity.trim()
    if (!city) {
      setSiteError({ field: 'city', message: 'City is required.' })
      return
    }
    if (!siteState) {
      setSiteError({ field: 'state', message: 'Select a state.' })
      return
    }
    const pin = sitePincode.trim()
    if (!PINCODE_PATTERN.test(pin)) {
      setSiteError({ field: 'pincode', message: PINCODE_HINT })
      return
    }
    if (!addSiteKey.current) addSiteKey.current = crypto.randomUUID()
    setBusy(true)
    try {
      const result = await agencyClientsApi.createSite({
        agreementId: selected.id,
        siteKind,
        label,
        addressLine: address,
        city,
        state: siteState,
        pincode: pin,
        idempotencyKey: addSiteKey.current,
      })
      if (!result.ok) {
        toast.error(result.message)
        if (result.error === 'idempotency_key_reused') addSiteKey.current = null
        await fetchDetail(selected.id)
        return
      }
      toast.success('Site saved')
      addSiteKey.current = null
      setShowAddSite(false)
      await fetchDetail(selected.id)
    } catch (e) {
      logger.error('[AgencyClientsPage] create site failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to save client site'))
    } finally {
      setBusy(false)
    }
  }

  const handleToggleSite = async (site: SiteRow) => {
    if (!selected || ended) return
    setBusy(true)
    try {
      const nextStatus = site.status === 'active' ? 'inactive' : 'active'
      const result = await agencyClientsApi.updateSite(site.id, site.version, { status: nextStatus })
      if (result.ok) toast.success(nextStatus === 'active' ? 'Site activated' : 'Site deactivated')
      else toast.error(result.message)
      await fetchDetail(selected.id)
    } catch (e) {
      logger.error('[AgencyClientsPage] update site failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to update site'))
    } finally {
      setBusy(false)
    }
  }

  const openAddContact = () => {
    setContactName('')
    setContactPhone('')
    setContactEmail('')
    setContactSite('')
    setContactError(null)
    setShowAddContact(true)
  }

  const handleCreateContact = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || ended) return
    const name = contactName.trim()
    if (!name) {
      setContactError({ field: 'name', message: 'Full name is required.' })
      return
    }
    const phone = contactPhone.trim()
    if (!phone) {
      setContactError({ field: 'phone', message: 'Phone is required.' })
      return
    }
    if (!addContactKey.current) addContactKey.current = crypto.randomUUID()
    setBusy(true)
    try {
      const result = await agencyClientsApi.createContact({
        agreementId: selected.id,
        fullName: name,
        phone,
        email: contactEmail.trim() || undefined,
        siteId: contactSite || undefined,
        idempotencyKey: addContactKey.current,
      })
      if (!result.ok) {
        toast.error(result.message)
        if (result.error === 'idempotency_key_reused') addContactKey.current = null
        await fetchDetail(selected.id)
        return
      }
      toast.success('Contact saved')
      addContactKey.current = null
      setShowAddContact(false)
      await fetchDetail(selected.id)
    } catch (e) {
      logger.error('[AgencyClientsPage] create contact failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to save client contact'))
    } finally {
      setBusy(false)
    }
  }

  const handleToggleContact = async (contact: ContactRow) => {
    if (!selected || ended) return
    setBusy(true)
    try {
      const nextStatus = contact.status === 'active' ? 'inactive' : 'active'
      const result = await agencyClientsApi.updateContact(contact.id, contact.version, { status: nextStatus })
      if (result.ok) toast.success(nextStatus === 'active' ? 'Contact activated' : 'Contact deactivated')
      else toast.error(result.message)
      await fetchDetail(selected.id)
    } catch (e) {
      logger.error('[AgencyClientsPage] update contact failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to update contact'))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    const c = confirm
    if (!c || !selected) return
    setBusy(true)
    try {
      const result =
        c.kind === 'end-agreement'
          ? await agencyClientsApi.updateAgreement(selected.id, selected.version, { status: 'ended' })
          : await agencyClientsApi.updateSite(c.site.id, c.site.version, { status: 'inactive' })
      if (result.ok) toast.success(c.kind === 'end-agreement' ? 'Agreement ended' : 'Site deactivated')
      else toast.error(result.message)
      setConfirm(null)
      if (c.kind === 'end-agreement') await fetchAgreements()
      else await fetchDetail(selected.id)
    } catch (e) {
      logger.error('[AgencyClientsPage] confirm action failed:', e)
      toast.error(toUserFacingErrorMessage(e, c.kind === 'end-agreement' ? 'Failed to end agreement' : 'Failed to update site'))
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="clients-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading clients…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="clients-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to client records</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for access to client agreements.</p>
        </div>
      </div>
    )
  }

  const renderSiteRow = (s: SiteRow) => (
    <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 px-2 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900 break-words">{s.label}</p>
          <StatusBadge status={s.status} />
        </div>
        <p className="mt-1 text-xs text-slate-600 break-words">
          {s.address_line}, {s.city}, {s.state} – {s.pincode}
        </p>
      </div>
      {!ended && (
        <div className="flex flex-wrap items-center gap-2">
          {s.status === 'active' ? (
            <button
              onClick={() => setConfirm({ kind: 'deactivate-site', site: s })}
              className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-red-800 ${FOCUS_RING}`}
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => handleToggleSite(s)}
              disabled={busy}
              className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
            >
              Activate
            </button>
          )}
        </div>
      )}
    </li>
  )

  const renderContactRow = (c: ContactRow) => (
    <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-2 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900 break-words">{c.full_name}</p>
          <StatusBadge status={c.status} />
        </div>
        <p className="mt-1 text-xs text-slate-600 break-words">
          {c.phone}
          {c.email ? ` · ${c.email}` : ''}
          {c.site_id ? ` · ${siteLabelById.get(c.site_id) ?? 'Site'}` : ''}
        </p>
      </div>
      {!ended && (
        <button
          onClick={() => handleToggleContact(c)}
          disabled={busy}
          className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
        >
          {c.status === 'active' ? 'Deactivate' : 'Activate'}
        </button>
      )}
    </li>
  )

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Clients</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Client agreements with billing sites, contacts and tariff history.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={() => { setLoading(true); fetchAgreements() }} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>
            Retry
          </button>
        </div>
      )}

      <div className="md:grid md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:items-start md:gap-6">
        <section className={selectedId ? 'hidden md:block min-w-0' : 'block min-w-0'} data-testid="clients-list" aria-labelledby="clients-heading">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="clients-heading" className="text-base font-bold text-slate-900">Client agreements</h2>
              <button
                onClick={openNewClient}
                className={`flex items-center gap-1 min-h-[44px] bg-indigo-600 text-white px-3 py-2 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
              >
                <Plus size={16} aria-hidden="true" /> Add client
              </button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
              <input
                name="client-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or GSTIN"
                aria-label="Search clients"
                className={`w-full min-h-[44px] rounded-xl border border-slate-300 pl-9 pr-3 ${FOCUS_RING}`}
              />
            </div>
            <ul className="divide-y divide-slate-100">
              {agreements.length === 0 && (
                <li className="py-8 text-center text-sm text-slate-600">
                  <MapPin className="mx-auto mb-2 text-slate-400" size={24} aria-hidden="true" />
                  No clients yet. Add your first client agreement.
                </li>
              )}
              {agreements.length > 0 && filtered.length === 0 && (
                <li className="py-6 text-center text-sm text-slate-600">No clients match your search.</li>
              )}
              {filtered.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => selectClient(a.id)}
                    aria-current={selectedId === a.id ? 'true' : undefined}
                    className={`w-full text-left min-h-[44px] rounded-xl border p-3 my-1 ${selectedId === a.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'} ${FOCUS_RING}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 break-words">{a.client_name}</span>
                      <StatusBadge status={a.status} />
                    </span>
                    <span className="mt-1 block text-xs text-slate-600 break-all">
                      {a.client_gstin ? a.client_gstin : 'No GSTIN'} · {a.payment_terms_days != null ? `Net ${a.payment_terms_days}` : 'No payment terms'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={selectedId ? 'block min-w-0' : 'hidden md:block min-w-0'} data-testid="clients-detail">
          {!selected ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              <MapPin className="mx-auto mb-2 text-slate-400" size={24} aria-hidden="true" />
              Select a client to see its sites, contacts and tariffs.
            </div>
          ) : (
            <div className="space-y-4 min-w-0">
              {ended && (
                <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This agreement is ended; reactivate it to add sites or tariffs.
                </p>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => setSelectedId(null)}
                    className={`md:hidden flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                  >
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 break-words">{selected.client_name}</h2>
                      <StatusBadge status={selected.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600 break-all">
                      {selected.client_gstin ? `GSTIN ${selected.client_gstin}` : 'No GSTIN on record'}
                      {' · '}
                      {selected.payment_terms_days != null ? `Net ${selected.payment_terms_days}` : 'No payment terms'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!ended ? (
                    <>
                      <button
                        onClick={openEdit}
                        className={`flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                      >
                        <Pencil size={14} aria-hidden="true" /> Edit details
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: 'end-agreement' })}
                        className={`min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-red-800 ${FOCUS_RING}`}
                      >
                        End agreement
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleReactivate}
                      disabled={busy}
                      className={`min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>

              <div role="tablist" aria-label="Client detail sections" className="flex flex-wrap items-center gap-2">
                <button
                  role="tab"
                  aria-selected={tab === 'sites'}
                  onClick={() => setTab('sites')}
                  className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold ${tab === 'sites' ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-800'} ${FOCUS_RING}`}
                >
                  Sites
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'contacts'}
                  onClick={() => setTab('contacts')}
                  className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold ${tab === 'contacts' ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-800'} ${FOCUS_RING}`}
                >
                  Contacts
                </button>
                <Link
                  to={`/agency/clients/${selected.id}/tariffs`}
                  className={`ml-auto flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                >
                  <FileText size={16} aria-hidden="true" /> Tariffs
                </Link>
              </div>

              {detailError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <span>{detailError}</span>
                  <button
                    onClick={() => {
                      setDetailLoading(true)
                      fetchDetail(selected.id)
                    }}
                    className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
                  >
                    Retry
                  </button>
                </div>
              )}

              {detailLoading ? (
                <div role="status" aria-busy="true" data-testid="clients-detail-loading" className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                  <RefreshCw className="mx-auto animate-spin text-indigo-600" size={24} aria-hidden="true" />
                  <span className="sr-only">Loading client details…</span>
                </div>
              ) : tab === 'sites' ? (
                <div className="space-y-4">
                  {!ended && (
                    <button
                      onClick={openAddSite}
                      className={`flex items-center gap-1 min-h-[44px] bg-indigo-600 text-white px-3 py-2 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
                    >
                      <Plus size={16} aria-hidden="true" /> Add site
                    </button>
                  )}
                  {sites.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                      <MapPin className="mx-auto mb-2 text-slate-400" size={24} aria-hidden="true" />
                      No sites yet. Add the first bill-to or ship-to site.
                    </div>
                  ) : (
                    <>
                      <section aria-labelledby="bill-to-heading" className="rounded-2xl border border-slate-200 bg-white">
                        <div className="px-4 pt-4">
                          <h3 id="bill-to-heading" className="text-base font-bold text-slate-900">Bill-to sites</h3>
                          <p className="text-xs text-slate-600">Only one active bill-to site per client.</p>
                        </div>
                        <ul className="divide-y divide-slate-100 p-2">
                          {billToSites.length === 0 && <li className="px-2 py-4 text-center text-sm text-slate-600">No bill-to sites yet.</li>}
                          {billToSites.map(renderSiteRow)}
                        </ul>
                      </section>
                      <section aria-labelledby="ship-to-heading" className="rounded-2xl border border-slate-200 bg-white">
                        <div className="px-4 pt-4">
                          <h3 id="ship-to-heading" className="text-base font-bold text-slate-900">Ship-to sites</h3>
                        </div>
                        <ul className="divide-y divide-slate-100 p-2">
                          {shipToSites.length === 0 && <li className="px-2 py-4 text-center text-sm text-slate-600">No ship-to sites yet.</li>}
                          {shipToSites.map(renderSiteRow)}
                        </ul>
                      </section>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {!ended && (
                    <button
                      onClick={openAddContact}
                      className={`flex items-center gap-1 min-h-[44px] bg-indigo-600 text-white px-3 py-2 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
                    >
                      <Phone size={16} aria-hidden="true" /> Add contact
                    </button>
                  )}
                  {contacts.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                      <Phone className="mx-auto mb-2 text-slate-400" size={24} aria-hidden="true" />
                      No contacts yet. Add your first contact.
                    </div>
                  ) : (
                    <section aria-labelledby="contacts-heading" className="rounded-2xl border border-slate-200 bg-white">
                      <h3 id="contacts-heading" className="px-4 pt-4 text-base font-bold text-slate-900">Contacts</h3>
                      <ul className="divide-y divide-slate-100 p-2">{contacts.map(renderContactRow)}</ul>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {showNewClient && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={() => !busy && setShowNewClient(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-client-title"
            onSubmit={handleCreateClient}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && !busy && setShowNewClient(false)}
            className="h-full w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 shadow-xl"
          >
            <h2 id="new-client-title" className="text-lg font-bold text-slate-900">Add client agreement</h2>
            <div>
              <label htmlFor="new-client-name" className="block text-sm font-medium text-slate-800">Client name</label>
              <input
                id="new-client-name"
                name="client-name"
                type="text"
                required
                autoFocus
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                aria-invalid={newClientError?.field === 'name'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {newClientError?.field === 'name' && <p className="mt-1 text-xs text-red-800">{newClientError.message}</p>}
            </div>
            <div>
              <label htmlFor="new-client-gstin" className="block text-sm font-medium text-slate-800">GSTIN <span className="font-normal text-slate-600">(optional)</span></label>
              <input
                id="new-client-gstin"
                name="client-gstin"
                type="text"
                maxLength={15}
                value={newClientGstin}
                onChange={(e) => setNewClientGstin(e.target.value.toUpperCase())}
                aria-invalid={newClientError?.field === 'gstin'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 font-mono uppercase ${FOCUS_RING}`}
              />
              {newClientError?.field === 'gstin' && <p className="mt-1 text-xs text-red-800">{newClientError.message}</p>}
            </div>
            <div>
              <label htmlFor="new-client-terms" className="block text-sm font-medium text-slate-800">Payment terms (days) <span className="font-normal text-slate-600">(optional)</span></label>
              <input
                id="new-client-terms"
                name="client-terms"
                type="number"
                value={newClientTerms}
                onChange={(e) => setNewClientTerms(e.target.value)}
                aria-invalid={newClientError?.field === 'terms'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {newClientError?.field === 'terms' && <p className="mt-1 text-xs text-red-800">{newClientError.message}</p>}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={`min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                {busy ? 'Saving…' : 'Save client'}
              </button>
              <button type="button" onClick={() => setShowNewClient(false)} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={() => !busy && setShowEdit(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-client-title"
            onSubmit={handleEditAgreement}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && !busy && setShowEdit(false)}
            className="h-full w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 shadow-xl"
          >
            <h2 id="edit-client-title" className="text-lg font-bold text-slate-900">Edit client agreement</h2>
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-slate-800">Client name</label>
              <input
                id="edit-name"
                name="edit-name"
                type="text"
                required
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                aria-invalid={editError?.field === 'name'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {editError?.field === 'name' && <p className="mt-1 text-xs text-red-800">{editError.message}</p>}
            </div>
            <div>
              <label htmlFor="edit-gstin" className="block text-sm font-medium text-slate-800">GSTIN <span className="font-normal text-slate-600">(optional)</span></label>
              <input
                id="edit-gstin"
                name="edit-gstin"
                type="text"
                maxLength={15}
                value={editGstin}
                onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                aria-invalid={editError?.field === 'gstin'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 font-mono uppercase ${FOCUS_RING}`}
              />
              {editError?.field === 'gstin' && <p className="mt-1 text-xs text-red-800">{editError.message}</p>}
            </div>
            <div>
              <label htmlFor="edit-terms" className="block text-sm font-medium text-slate-800">Payment terms (days) <span className="font-normal text-slate-600">(optional)</span></label>
              <input
                id="edit-terms"
                name="edit-terms"
                type="number"
                value={editTerms}
                onChange={(e) => setEditTerms(e.target.value)}
                aria-invalid={editError?.field === 'terms'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {editError?.field === 'terms' && <p className="mt-1 text-xs text-red-800">{editError.message}</p>}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={`min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setShowEdit(false)} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddSite && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={() => !busy && setShowAddSite(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-site-title"
            onSubmit={handleCreateSite}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && !busy && setShowAddSite(false)}
            className="h-full w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 shadow-xl"
          >
            <h2 id="add-site-title" className="text-lg font-bold text-slate-900">Add site</h2>
            <div>
              <label htmlFor="site-kind" className="block text-sm font-medium text-slate-800">Site kind</label>
              <select
                id="site-kind"
                name="site-kind"
                value={siteKind}
                onChange={(e) => setSiteKind(e.target.value as SiteKind)}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              >
                {SITE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
              {siteKind === 'bill_to' && <p className="mt-1 text-xs text-slate-600">Only one active bill-to site per client.</p>}
            </div>
            <div>
              <label htmlFor="site-label" className="block text-sm font-medium text-slate-800">Label</label>
              <input
                id="site-label"
                name="site-label"
                type="text"
                required
                autoFocus
                value={siteLabel}
                onChange={(e) => setSiteLabel(e.target.value)}
                aria-invalid={siteError?.field === 'label'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {siteError?.field === 'label' && <p className="mt-1 text-xs text-red-800">{siteError.message}</p>}
            </div>
            <div>
              <label htmlFor="site-address" className="block text-sm font-medium text-slate-800">Address line</label>
              <input
                id="site-address"
                name="site-address"
                type="text"
                required
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                aria-invalid={siteError?.field === 'address'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {siteError?.field === 'address' && <p className="mt-1 text-xs text-red-800">{siteError.message}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="site-city" className="block text-sm font-medium text-slate-800">City</label>
                <input
                  id="site-city"
                  name="site-city"
                  type="text"
                  required
                  value={siteCity}
                  onChange={(e) => setSiteCity(e.target.value)}
                  aria-invalid={siteError?.field === 'city'}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                />
                {siteError?.field === 'city' && <p className="mt-1 text-xs text-red-800">{siteError.message}</p>}
              </div>
              <div>
                <label htmlFor="site-pincode" className="block text-sm font-medium text-slate-800">Pincode</label>
                <input
                  id="site-pincode"
                  name="site-pincode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={sitePincode}
                  onChange={(e) => setSitePincode(e.target.value)}
                  aria-invalid={siteError?.field === 'pincode'}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                />
                {siteError?.field === 'pincode' && <p className="mt-1 text-xs text-red-800">{siteError.message}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="site-state" className="block text-sm font-medium text-slate-800">State</label>
              <select
                id="site-state"
                name="site-state"
                required
                value={siteState}
                onChange={(e) => setSiteState(e.target.value)}
                aria-invalid={siteError?.field === 'state'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {siteError?.field === 'state' && <p className="mt-1 text-xs text-red-800">{siteError.message}</p>}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={`min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                {busy ? 'Saving…' : 'Save site'}
              </button>
              <button type="button" onClick={() => setShowAddSite(false)} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddContact && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={() => !busy && setShowAddContact(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-contact-title"
            onSubmit={handleCreateContact}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && !busy && setShowAddContact(false)}
            className="h-full w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 shadow-xl"
          >
            <h2 id="add-contact-title" className="text-lg font-bold text-slate-900">Add contact</h2>
            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium text-slate-800">Full name</label>
              <input
                id="contact-name"
                name="contact-name"
                type="text"
                required
                autoFocus
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                aria-invalid={contactError?.field === 'name'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {contactError?.field === 'name' && <p className="mt-1 text-xs text-red-800">{contactError.message}</p>}
            </div>
            <div>
              <label htmlFor="contact-phone" className="block text-sm font-medium text-slate-800">Phone</label>
              <input
                id="contact-phone"
                name="contact-phone"
                type="tel"
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                aria-invalid={contactError?.field === 'phone'}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
              {contactError?.field === 'phone' && <p className="mt-1 text-xs text-red-800">{contactError.message}</p>}
            </div>
            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium text-slate-800">Email <span className="font-normal text-slate-600">(optional)</span></label>
              <input
                id="contact-email"
                name="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              />
            </div>
            <div>
              <label htmlFor="contact-site" className="block text-sm font-medium text-slate-800">Site <span className="font-normal text-slate-600">(optional)</span></label>
              <select
                id="contact-site"
                name="contact-site"
                value={contactSite}
                onChange={(e) => setContactSite(e.target.value)}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              >
                <option value="">No specific site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={`min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                {busy ? 'Saving…' : 'Save contact'}
              </button>
              <button type="button" onClick={() => setShowAddContact(false)} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onKeyDown={(e) => e.key === 'Escape' && !busy && setConfirm(null)}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="confirm-title" className="text-lg font-bold text-slate-900">
              {confirm.kind === 'end-agreement' ? 'End agreement?' : 'Deactivate site?'}
            </h2>
            <p className="text-sm text-slate-700">
              {confirm.kind === 'end-agreement'
                ? `End the agreement with ${selected?.client_name}? Its sites and tariffs stay on record and the client becomes read-only.`
                : `Deactivate ${confirm.site.label}? You can activate it again later.`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={busy}
                autoFocus
                className={`min-h-[44px] flex-1 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
              >
                {confirm.kind === 'end-agreement' ? 'End agreement' : 'Deactivate'}
              </button>
              <button onClick={() => setConfirm(null)} disabled={busy} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
