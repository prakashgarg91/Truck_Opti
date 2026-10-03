import { useCallback, useState, useEffect } from 'react'
import {
  ArrowLeft, User, Truck, CreditCard, CheckCircle2,
  XCircle, AlertTriangle, Phone, MapPin, Calendar,
  FileText, RefreshCw, ShieldCheck, Eye, FileWarning
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminSupabaseApi, type AdminDriverProfile as DriverProfile } from '../services/adminSupabaseApi'
import {
  getDocumentAccessUrl,
  getDriverKycState,
  reviewDocument,
  type KycApiSubmissionState,
  type KycReviewDecision,
} from '../services/driverKycApi'
import { KYC_DOC_KINDS, KYC_DOC_META, type KycDocKind } from '../services/driverKycDocuments'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import toast from 'react-hot-toast'

const VEHICLE_LABELS: Record<string, string> = {
  tata_407: 'Tata 407 (1T)',
  eicher_14ft: 'Eicher 14ft (3T)',
  eicher_17ft: 'Eicher 17ft (5T)',
  ashok_19ft: 'Ashok Leyland 19ft (7T)',
  bharatbenz_24ft: 'BharatBenz 24ft (10T)',
  bharatbenz_32ft: 'BharatBenz 32ft (15T)',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
}

/** Per-document review states, exactly as the server reports them (TO-128). */
const KYC_STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Not uploaded', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400' },
  pending_review: { label: 'Pending review', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  accepted: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected: { label: 'Review Needed', badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

function formatKycBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatKycTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <p className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</p>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 text-right break-all">
        {value || <span className="text-slate-300 dark:text-slate-600 italic">Not provided</span>}
      </p>
    </div>
  )
}

function DocBadge({ label, url }: { label: string; url: string | null }) {
  return (
    <a
      href={url || undefined}
      target={url ? '_blank' : undefined}
      rel="noopener noreferrer"
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${url
        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40'
        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'
        }`}
    >
      {url ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {label}
      {url && <span className="text-green-500">↗</span>}
    </a>
  )
}

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [driver, setDriver] = useState<DriverProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  // TO-128 — server-authoritative KYC review state. Never fabricated
  // locally: every displayed status/version came from the driver-kyc
  // function for this driver.
  const [kycState, setKycState] = useState<KycApiSubmissionState | null>(null)
  const [kycLoading, setKycLoading] = useState(true)
  const [kycError, setKycError] = useState<string | null>(null)
  const [reviewBusy, setReviewBusy] = useState<KycDocKind | null>(null)
  const [kycRejectKind, setKycRejectKind] = useState<KycDocKind | null>(null)
  const [kycRejectReason, setKycRejectReason] = useState('')
  const [previews, setPreviews] = useState<Partial<Record<KycDocKind, string>>>({})
  const [previewFailed, setPreviewFailed] = useState<Partial<Record<KycDocKind, boolean>>>({})
  const [previewBusy, setPreviewBusy] = useState<KycDocKind | null>(null)
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false)

  const loadKyc = useCallback(async () => {
    if (!id) return
    setKycLoading(true)
    setKycError(null)
    try {
      setKycState(await getDriverKycState(id))
    } catch (error) {
      setKycError(toUserFacingErrorMessage(error, 'Could not load KYC documents. Please try again.'))
    } finally {
      setKycLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadKyc()
  }, [loadKyc])

  const kycAcceptedCount = kycState
    ? KYC_DOC_KINDS.filter((kind) => kycState.docs[kind].status === 'accepted').length
    : 0

  const handleKycReview = async (kind: KycDocKind, decision: KycReviewDecision) => {
    if (!id || !kycState) return
    const version = kycState.versions[kind]
    if (!Number.isInteger(version) || version < 1) return

    const reason = decision === 'reject' ? kycRejectReason.trim() : undefined
    if (decision === 'reject' && !reason) {
      toast.error('Please enter a rejection reason')
      return
    }

    setReviewBusy(kind)
    try {
      // Only the trusted function can move a review; its response is the
      // fresh server-computed state (includes reviewer-recorded outcomes).
      setKycState(await reviewDocument(id, kind, version, decision, reason))
      toast.success(decision === 'accept' ? 'Document accepted' : 'Document rejected')
      setKycRejectKind(null)
      setKycRejectReason('')
    } catch (error) {
      // Stale-version conflicts (409) and other failures leave our view
      // suspect — reload the authoritative state either way.
      toast.error(
        toUserFacingErrorMessage(
          error,
          decision === 'accept'
            ? 'Failed to accept the document. Please try again.'
            : 'Failed to reject the document. Please try again.',
        ),
      )
      void loadKyc()
    } finally {
      setReviewBusy(null)
    }
  }

  const mintKycAccess = async (kind: KycDocKind): Promise<string | null> => {
    if (!id) return null
    setPreviewBusy(kind)
    try {
      // Short-lived signed URL minted fresh on every use — a rendered link
      // can never outlive its 60-second validity by being reused later.
      const access = await getDocumentAccessUrl(kind, { driverId: id })
      return access.url
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, 'The document could not be opened. It may be unavailable.'))
      return null
    } finally {
      setPreviewBusy(null)
    }
  }

  const handleKycPreview = async (kind: KycDocKind) => {
    if (previews[kind]) {
      setPreviews((prev) => {
        const { [kind]: _drop, ...rest } = prev
        return rest
      })
      setPreviewFailed((prev) => {
        const { [kind]: _drop, ...rest } = prev
        return rest
      })
      return
    }
    const url = await mintKycAccess(kind)
    if (url) {
      setPreviews((prev) => ({ ...prev, [kind]: url }))
      setPreviewFailed((prev) => ({ ...prev, [kind]: false }))
    }
  }

  const handleKycOpenPdf = async (kind: KycDocKind) => {
    const url = await mintKycAccess(kind)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleApprove = async () => {
    if (!driver) return
    setActionLoading(true)
    try {
      const updatedDriver = await adminSupabaseApi.approveDriver(driver.id)
      toast.success('Driver approved!')
      setDriver(updatedDriver)
      setApproveConfirmOpen(false)
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, 'Failed to approve driver. Please try again.'))
    } finally {
      setActionLoading(false)
    }
  }

  // Approving a driver is an operational decision beyond document review.
  // When KYC is not fully accepted (or could not be verified), the admin
  // must confirm the shortfall explicitly — never approve silently.
  const handleApproveClick = () => {
    if (!driver) return
    if (kycState?.locked) {
      void handleApprove()
      return
    }
    setApproveConfirmOpen(true)
  }

  useEffect(() => {
    if (!id) return
    const driverId = id

    async function fetch() {
      try {
        const data = await adminSupabaseApi.getDriverById(driverId)

        if (!data) {
          toast.error('Driver not found')
          navigate('/admin/drivers', { replace: true })
          return
        }

        setDriver(data)
      } catch (error) {
        toast.error(toUserFacingErrorMessage(error, 'Failed to load driver details. Please try again.'))
        navigate('/admin/drivers', { replace: true })
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [id, navigate])

  const handleReject = async () => {
    const trimmedReason = rejectReason.trim()

    if (!driver || !trimmedReason) {
      toast.error('Please enter a rejection reason')
      return
    }

    setActionLoading(true)

    try {
      const updatedDriver = await adminSupabaseApi.rejectDriver(driver.id, trimmedReason)
      toast.success('Driver rejected')
      setDriver(updatedDriver)
      setRejectReason('')
      setShowRejectForm(false)
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, 'Failed to reject driver. Please try again.'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleSuspend = async () => {
    if (!driver) return
    setActionLoading(true)

    try {
      const updatedDriver = await adminSupabaseApi.suspendDriver(driver.id)
      toast.success('Driver suspended')
      setDriver(updatedDriver)
    } catch (error) {
      toast.error(toUserFacingErrorMessage(error, 'Failed to suspend driver. Please try again.'))
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw size={28} className="animate-spin text-blue-600" />
      </div>
    )
  }

  if (!driver) return null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/admin/drivers')} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-800 dark:text-slate-100 truncate">{driver.full_name}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Driver Details</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${STATUS_COLORS[driver.status]}`}>
          {driver.status}
        </span>
      </div>

      <div className="p-4 md:p-8 space-y-4 max-w-md md:max-w-5xl mx-auto">
        {/* Hero Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              {driver.selfie_url ? (
                <img src={driver.selfie_url} alt={driver.full_name} className="w-14 h-14 rounded-2xl object-cover" />
              ) : (
                <User size={28} className="text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{driver.full_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Phone size={12} className="text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-400">{driver.phone}</span>
              </div>
              {driver.home_city && (
                <div className="flex items-center gap-2 mt-0.5">
                  <MapPin size={12} className="text-slate-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">{driver.home_city}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{driver.total_trips || 0}</p>
              <p className="text-xs text-slate-400">Trips</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{driver.rating?.toFixed(1) || '—'}</p>
              <p className="text-xs text-slate-400">Rating</p>
            </div>
            <div className="text-center">
              <p className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${driver.is_online ? 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400' : 'text-slate-400 bg-slate-100 dark:bg-slate-700'}`}>
                {driver.is_online ? '🟢 Online' : '⚫ Offline'}
              </p>
            </div>
          </div>
        </div>

        {/* KYC Verification — server-authoritative per-document review (TO-128) */}
        <section id="kyc-review-section" aria-label="KYC Verification" className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <ShieldCheck size={16} className="text-purple-500" />
              KYC Verification
            </h3>
            <div className="flex items-center gap-2">
              {kycState && (
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold ${kycState.locked
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}
                >
                  {kycState.locked ? 'KYC Verified' : `${kycAcceptedCount} of 4 accepted`}
                </span>
              )}
              <button
                type="button"
                onClick={() => void loadKyc()}
                aria-label="Refresh KYC status"
                disabled={kycLoading}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-50"
              >
                <RefreshCw size={14} className={kycLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {kycLoading && !kycState && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
              <RefreshCw size={16} className="animate-spin" />
              Loading KYC documents…
            </div>
          )}

          {kycError && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 p-3 space-y-2 mb-3">
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle size={12} />
                {kycError}
              </p>
              <button
                type="button"
                onClick={() => void loadKyc()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white"
              >
                Retry
              </button>
            </div>
          )}

          {kycState && (
            <div className="space-y-3">
              {KYC_DOC_KINDS.map((kind) => {
                const doc = kycState.docs[kind]
                const version = kycState.versions[kind]
                const statusMeta = KYC_STATUS_META[doc.status] ?? KYC_STATUS_META.pending
                const isPdf = doc.fileType === 'application/pdf'
                const previewUrl = previews[kind]
                const previewBroken = previewFailed[kind] === true
                const rejectOpen = kycRejectKind === kind
                const busy = reviewBusy === kind || previewBusy === kind

                return (
                  <article
                    key={kind}
                    id={`kyc-admin-doc-${kind}`}
                    aria-label={KYC_DOC_META[kind].title}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {KYC_DOC_META[kind].title}
                        </p>
                        {version > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                            v{version}
                          </span>
                        )}
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusMeta.badge}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    {version > 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {doc.fileName ?? 'Uploaded file'} · {formatKycBytes(doc.fileSizeBytes)} · Uploaded {formatKycTime(doc.updatedAt)}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500">No document uploaded yet.</p>
                    )}

                    {doc.reviewedAt && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Reviewed {formatKycTime(doc.reviewedAt)}</p>
                    )}

                    {doc.status === 'rejected' && doc.rejectionReason && (
                      <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                        Rejection reason: {doc.rejectionReason}
                      </p>
                    )}

                    {previewUrl && !isPdf && !previewBroken && (
                      <img
                        src={previewUrl}
                        alt={`${KYC_DOC_META[kind].title} preview`}
                        onError={() => setPreviewFailed((prev) => ({ ...prev, [kind]: true }))}
                        className="rounded-lg max-h-48 w-full object-contain bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700"
                      />
                    )}
                    {previewUrl && !isPdf && previewBroken && (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 p-3 space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <FileWarning size={12} />
                          Preview link expired or the file is unavailable.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleKycPreview(kind)}
                          disabled={busy}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                        >
                          Refresh preview
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {version > 0 && (
                        isPdf ? (
                          <button
                            type="button"
                            onClick={() => void handleKycOpenPdf(kind)}
                            disabled={busy}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50"
                          >
                            <Eye size={12} />
                            Open PDF
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleKycPreview(kind)}
                            disabled={busy}
                            aria-expanded={Boolean(previewUrl)}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50"
                          >
                            <Eye size={12} />
                            {previewUrl ? 'Hide preview' : 'Preview'}
                          </button>
                        )
                      )}
                      {doc.status === 'pending_review' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleKycReview(kind, 'accept')}
                            disabled={busy}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                          >
                            <CheckCircle2 size={12} />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setKycRejectKind(rejectOpen ? null : kind)
                              setKycRejectReason('')
                            }}
                            aria-expanded={rejectOpen}
                            disabled={busy}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 disabled:opacity-50"
                          >
                            <XCircle size={12} />
                            Reject
                          </button>
                        </>
                      )}
                    </div>

                    {rejectOpen && doc.status === 'pending_review' && (
                      <div className="space-y-2 pt-1">
                        <label htmlFor={`kyc-admin-reject-reason-${kind}`} className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
                          Rejection reason (required)
                        </label>
                        <textarea
                          id={`kyc-admin-reject-reason-${kind}`}
                          value={kycRejectReason}
                          onChange={(e) => setKycRejectReason(e.target.value)}
                          rows={2}
                          placeholder="e.g. License number is not readable..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setKycRejectKind(null)
                              setKycRejectReason('')
                            }}
                            className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleKycReview(kind, 'reject')}
                            disabled={busy || !kycRejectReason.trim()}
                            className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Document versions and review outcomes come from the server. Approving the driver is a separate decision below.
              </p>
            </div>
          )}
        </section>

        {/* Action buttons */}
        {driver.status === 'pending' && (
          <div className="space-y-2">
            <button
              onClick={handleApproveClick}
              disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 text-white font-semibold disabled:opacity-60"
            >
              <CheckCircle2 size={18} />
              Approve Driver
            </button>
            {approveConfirmOpen && !kycState?.locked && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  KYC not fully verified
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400" id="kyc-approve-shortfall">
                  {kycError
                    ? 'KYC status could not be verified right now. Approving makes this driver operational without document verification.'
                    : `Only ${kycAcceptedCount} of 4 KYC documents are accepted. Approving now makes this driver operational without full document verification.`}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setApproveConfirmOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm"
                  >
                    Keep Reviewing
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    Approve Anyway
                  </button>
                </div>
              </div>
            )}
            {!showRejectForm ? (
              <button
                onClick={() => setShowRejectForm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold"
              >
                <XCircle size={18} />
                Reject Driver
              </button>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Rejection Reason</p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="e.g. License number is invalid..."
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowRejectForm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm">Cancel</button>
                  <button onClick={handleReject} disabled={actionLoading} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60">Confirm Reject</button>
                </div>
              </div>
            )}
          </div>
        )}

        {driver.status === 'approved' && (
          <button
            onClick={handleSuspend}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-600 text-white font-semibold disabled:opacity-60"
          >
            <AlertTriangle size={18} />
            Suspend Driver
          </button>
        )}

        {driver.status === 'suspended' && (
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 text-white font-semibold disabled:opacity-60"
          >
            <CheckCircle2 size={18} />
            Reinstate Driver
          </button>
        )}

        {driver.rejection_reason && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-2xl p-4">
            <p className="text-xs text-red-500 font-medium uppercase mb-1">Rejection Reason</p>
            <p className="text-sm text-red-700 dark:text-red-300">{driver.rejection_reason}</p>
          </div>
        )}

        {/* Personal Info */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <User size={16} className="text-blue-500" />
            Personal Information
          </h3>
          <InfoRow label="Full Name" value={driver.full_name} />
          <InfoRow label="Phone" value={driver.phone} />
          <InfoRow label="Aadhaar (last 4)" value={driver.aadhaar_last4 ? `****${driver.aadhaar_last4}` : null} />
          <InfoRow label="PAN" value={driver.pan_number} />
          <InfoRow label="Date of Birth" value={driver.date_of_birth ? new Date(driver.date_of_birth).toLocaleDateString('en-IN') : null} />
          <InfoRow label="Home City" value={driver.home_city} />
          <InfoRow label="Registered" value={<><Calendar size={12} className="inline mr-1" />{new Date(driver.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</>} />
        </div>

        {/* Vehicle Info */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <Truck size={16} className="text-blue-500" />
            Vehicle Information
          </h3>
          <InfoRow label="Vehicle Type" value={VEHICLE_LABELS[driver.vehicle_type] || driver.vehicle_type} />
          <InfoRow label="Capacity" value={driver.vehicle_capacity ? `${driver.vehicle_capacity} tonnes` : null} />
          <InfoRow label="RC Number" value={driver.rc_number} />
          <InfoRow label="License Number" value={driver.license_number} />
        </div>

        {/* Documents */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <FileText size={16} className="text-blue-500" />
            Documents
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <DocBadge label="Driving License" url={driver.dl_url} />
            <DocBadge label="RC Book" url={driver.rc_url} />
            <DocBadge label="Insurance" url={driver.insurance_url} />
            <DocBadge label="Selfie" url={driver.selfie_url} />
          </div>
          {!(driver.dl_url || driver.rc_url || driver.insurance_url) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Driver has not uploaded documents yet
            </p>
          )}
        </div>

        {/* Bank Info */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-blue-500" />
            Payment Details
          </h3>
          <InfoRow label="Bank Account" value={driver.bank_account} />
          <InfoRow label="IFSC Code" value={driver.ifsc_code} />
          <InfoRow label="UPI ID" value={driver.upi_id} />
        </div>

        {/* Admin info */}
        {driver.approved_at && (
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-purple-500" />
              Admin Actions
            </h3>
            <InfoRow label="Status" value={<span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[driver.status]}`}>{driver.status}</span>} />
            <InfoRow label="Approved At" value={driver.approved_at ? new Date(driver.approved_at).toLocaleDateString('en-IN') : null} />
          </div>
        )}
      </div>
    </div>
  )
}
