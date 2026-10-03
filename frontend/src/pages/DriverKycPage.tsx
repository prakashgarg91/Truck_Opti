import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  FileText,
  Fingerprint,
  IdCard,
  Loader2,
  Lock,
  RefreshCw,
  ScanLine,
  Send,
  ShieldCheck,
  Sun,
  Truck,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { useAuthStore } from '../stores/authStore'
import { getDocumentAccessUrl, getState, submit, uploadDocument } from '../services/driverKycApi'
import {
  KYC_DOC_KINDS,
  KYC_DOC_META,
  canSubmitForVerification,
  createInitialKycState,
  createMidflowDemoState,
  demoQueryEnabled,
  failUpload,
  kycAcceptedCount,
  kycCompletionPercent,
  mergeServerState,
  retryFromError,
  startUpload,
  submitHelperText,
  validateUploadFile,
  type KycDocKind,
  type KycDocument,
  type KycSubmissionState,
} from '../services/driverKycDocuments'

const KIND_ICONS: Record<KycDocKind, typeof Truck> = {
  rc_book: Car,
  driving_license: IdCard,
  aadhaar: Fingerprint,
  truck_photo: Truck,
}

const STATUS_PILL: Record<
  KycDocument['status'],
  { label: string; className: string; Icon: typeof Clock; spin?: boolean }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    Icon: Clock,
  },
  // Client-local transfer state — honest indeterminate wording, no invented percentage.
  uploading: {
    label: 'Uploading…',
    className: 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
    Icon: Loader2,
    spin: true,
  },
  pending_review: {
    label: 'Pending review',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Icon: Clock,
  },
  rejected: {
    label: 'Review Needed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    Icon: AlertTriangle,
  },
  accepted: {
    label: 'Accepted',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  error: {
    label: 'Upload failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    Icon: AlertTriangle,
  },
}

const KYC_TIPS = [
  { Icon: Sun, label: 'Even lighting, no glare' },
  { Icon: ScanLine, label: 'All 4 corners visible' },
  { Icon: BadgeCheck, label: 'Original only (no copies)' },
]

const KYC_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

const OFFLINE_MESSAGE = "You're offline. Documents can't be uploaded until you reconnect."

type LoadPhase = 'loading' | 'ready' | 'error' | 'denied'

function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusPill({ doc }: { doc: KycDocument }) {
  const { label, className, Icon, spin } = STATUS_PILL[doc.status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} aria-hidden />
      {label}
    </span>
  )
}

function DocThumb({
  doc,
  previewUrl,
  title,
}: {
  doc: KycDocument
  previewUrl?: string
  title: string
}) {
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-700">
      {previewUrl ? (
        <img src={previewUrl} alt={`${title} preview`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-500 dark:text-slate-400">
          <FileText className="h-6 w-6" aria-hidden />
        </div>
      )}
      {doc.status === 'accepted' && (
        <div className="absolute inset-0 flex items-center justify-center bg-emerald-600/45">
          <CheckCircle2 className="h-7 w-7 text-white" aria-hidden />
        </div>
      )}
    </div>
  )
}

function SecondaryButton({
  onClick,
  children,
  ariaLabel,
}: {
  onClick: () => void
  children: ReactNode
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  )
}

function DocumentCard({
  doc,
  previewUrl,
  locked,
  disabled,
  onFile,
  onRetry,
}: {
  doc: KycDocument
  previewUrl?: string
  locked: boolean
  disabled: boolean
  onFile: (kind: KycDocKind, file: File | undefined) => void
  onRetry: (kind: KycDocKind) => void
}) {
  const meta = KYC_DOC_META[doc.kind]
  const Icon = KIND_ICONS[doc.kind]
  const inputId = `kyc-upload-${doc.kind}`
  const canModify = !locked && !disabled

  const body = (() => {
    switch (doc.status) {
      case 'pending':
        return (
          <div>
            <label
              htmlFor={inputId}
              className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-primary-700 transition-colors dark:border-slate-600 dark:bg-slate-900/40 dark:text-primary-300 ${
                canModify
                  ? 'cursor-pointer hover:border-primary-400 hover:bg-primary-50/60 dark:hover:border-primary-500/50'
                  : 'cursor-not-allowed opacity-60'
              }`}
            >
              <Camera className="h-4 w-4" aria-hidden />
              Take photo or upload
            </label>
            {disabled && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{OFFLINE_MESSAGE}</p>}
            {!disabled && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {meta.helper}
              </p>
            )}
          </div>
        )
      case 'uploading':
        // Honest indeterminate transfer: the storage client exposes no
        // measurable progress or abort for this request, so no percentage
        // and no cancel button are rendered — only the real transfer state.
        return (
          <div className="flex items-center gap-4" aria-live="polite">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-900/40">
              <Loader2 className="h-7 w-7 animate-spin text-primary-600 dark:text-primary-300" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {doc.fileName} {doc.fileSizeBytes ? `· ${formatSize(doc.fileSizeBytes)}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Uploading securely…</p>
            </div>
          </div>
        )
      case 'pending_review':
        return (
          <div className="flex items-center gap-4">
            <DocThumb doc={doc} previewUrl={previewUrl} title={meta.title} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{doc.fileName}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {formatSize(doc.fileSizeBytes)} · Uploaded {formatRelative(doc.updatedAt)}
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Our verification team is reviewing this document.
              </p>
            </div>
            {canModify && (
              <label
                htmlFor={inputId}
                className="inline-flex min-h-[48px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Replace File
              </label>
            )}
          </div>
        )
      case 'rejected':
        return (
          <div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              <span className="font-semibold">Rejected:</span> {doc.rejectionReason}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <DocThumb doc={doc} previewUrl={previewUrl} title={meta.title} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-600 line-through dark:text-slate-400">{doc.fileName}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Rejected {formatRelative(doc.updatedAt)}
                </p>
              </div>
              {canModify && (
                <label
                  htmlFor={inputId}
                  className="inline-flex min-h-[48px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Re-upload
                </label>
              )}
            </div>
          </div>
        )
      case 'accepted':
        return (
          <div className="flex items-center gap-4">
            <DocThumb doc={doc} previewUrl={previewUrl} title={meta.title} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {doc.fileName} · {formatSize(doc.fileSizeBytes)}
              </p>
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">Approved by the verification team</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                <Lock className="h-3 w-3" aria-hidden /> Read-only document — no action needed
              </p>
            </div>
          </div>
        )
      case 'error':
        return (
          <div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {doc.errorMessage}
            </div>
            <div className="mt-3">
              <SecondaryButton onClick={() => onRetry(doc.kind)} ariaLabel={`Retry ${meta.title} upload`}>
                <Camera className="h-4 w-4" aria-hidden /> Try again
              </SecondaryButton>
            </div>
          </div>
        )
    }
  })()

  return (
    <section aria-labelledby={`${inputId}-title`} className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h4 id={`${inputId}-title`} className="font-bold text-slate-900 dark:text-white">
              {meta.title}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">{meta.subtitle}</p>
          </div>
        </div>
        <StatusPill doc={doc} />
      </div>
      <div className="mt-3">{body}</div>
      <input
        id={inputId}
        type="file"
        accept={KYC_UPLOAD_ACCEPT}
        className="sr-only"
        aria-label={`Upload ${meta.title}`}
        disabled={locked || disabled || doc.status === 'uploading'}
        onChange={(event) => {
          onFile(doc.kind, event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </section>
  )
}

function isImageType(type: string | null): boolean {
  return typeof type === 'string' && type.startsWith('image/')
}

export default function DriverKycPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Demo fixtures are a development/testing aid only; a production query
  // string can never fabricate verification states.
  const isDemo = demoQueryEnabled(import.meta.env.DEV, searchParams.get('demo'))

  const [state, setState] = useState<KycSubmissionState>(createInitialKycState)
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [submitting, setSubmitting] = useState(false)
  /** Short-lived signed previews for documents stored on the server. */
  const [signedPreviews, setSignedPreviews] = useState<Partial<Record<KycDocKind, string>>>({})
  /** Render mirror of the local object-URL previews for the transfer in flight. */
  const [blobPreviews, setBlobPreviews] = useState<Partial<Record<KycDocKind, string>>>({})
  /** Authoritative registry of live object URLs so they are always revoked. */
  const blobUrlsRef = useRef<Partial<Record<KycDocKind, string>>>({})

  useEffect(() => {
    document.title = 'Documents & KYC - TruckOpti'
  }, [])

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Load the persisted, server-authoritative state on mount/navigation.
  useEffect(() => {
    if (isDemo) {
      setState(createMidflowDemoState())
      setPhase('ready')
      setLoadError(null)
      return
    }
    if (!user) {
      setPhase('denied')
      return
    }
    let active = true
    setPhase('loading')
    getState()
      .then((next) => {
        if (!active) return
        setState(next)
        setPhase('ready')
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'Could not load your KYC status.')
        setPhase('error')
      })
    return () => {
      active = false
    }
  }, [isDemo, user, reloadToken])

  // Short-lived signed previews for documents stored in the private bucket.
  useEffect(() => {
    if (phase !== 'ready' || isDemo) return
    let active = true
    for (const kind of KYC_DOC_KINDS) {
      const doc = state.docs[kind]
      if (!isImageType(doc.fileType) || doc.status === 'pending' || doc.status === 'error' || doc.status === 'uploading') {
        continue
      }
      getDocumentAccessUrl(kind)
        .then((access) => {
          if (active) setSignedPreviews((prev) => ({ ...prev, [kind]: access.url }))
        })
        .catch(() => {
          // Honest fallback: keep the file icon instead of a broken image.
          if (active) {
            setSignedPreviews((prev) => {
              if (!(kind in prev)) return prev
              const next = { ...prev }
              delete next[kind]
              return next
            })
          }
        })
    }
    return () => {
      active = false
    }
  }, [state, phase, isDemo])

  // Revoke local object URLs on unmount.
  useEffect(() => {
    const registry = blobUrlsRef
    return () => {
      for (const url of Object.values(registry.current)) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [])

  const clearBlobPreview = useCallback((kind: KycDocKind) => {
    const url = blobUrlsRef.current[kind]
    if (!url) return
    URL.revokeObjectURL(url)
    delete blobUrlsRef.current[kind]
    setBlobPreviews((prev) => {
      if (!(kind in prev)) return prev
      const next = { ...prev }
      delete next[kind]
      return next
    })
  }, [])

  const handleFile = useCallback(
    (kind: KycDocKind, file: File | undefined) => {
      if (!file) return
      if (isDemo || phase !== 'ready' || !online || state.locked || submitting) return

      const validationError = validateUploadFile(file)
      if (validationError) {
        setState((s) => failUpload(s, kind, validationError))
        toast.error(validationError)
        return
      }

      clearBlobPreview(kind)
      if (isImageType(file.type)) {
        const url = URL.createObjectURL(file)
        blobUrlsRef.current[kind] = url
        setBlobPreviews((prev) => ({ ...prev, [kind]: url }))
      }
      setState((s) => startUpload(s, kind, { name: file.name, sizeBytes: file.size, type: file.type }))

      uploadDocument(kind, file)
        .then((next) => {
          // Transfer settled: adopt the server outcome verbatim.
          setState((s) => mergeServerState(s, next, [kind]))
          toast.success(`${KYC_DOC_META[kind].title} uploaded — awaiting review`)
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'The document upload failed. Please try again.'
          setState((s) => failUpload(s, kind, message))
          toast.error(message)
        })
        .finally(() => {
          clearBlobPreview(kind)
        })
    },
    [clearBlobPreview, isDemo, online, phase, state.locked, submitting],
  )

  const handleRetry = useCallback((kind: KycDocKind) => {
    setState((s) => retryFromError(s, kind))
  }, [])

  const handleReload = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const handleSubmit = useCallback(() => {
    if (isDemo || !online || submitting) return
    if (!canSubmitForVerification(state)) return
    setSubmitting(true)
    submit()
      .then((next) => {
        setState((s) => mergeServerState(s, next, KYC_DOC_KINDS))
        toast.success('Submitted for verification')
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'The submission failed. Please try again.'
        toast.error(message)
      })
      .finally(() => setSubmitting(false))
  }, [isDemo, online, state, submitting])

  const accepted = kycAcceptedCount(state)
  const percent = kycCompletionPercent(state)
  const canSubmit = canSubmitForVerification(state) && !submitting
  const helper = submitHelperText(state)
  const showCta = phase === 'ready' && !isDemo && user && !state.locked

  const previewFor = useCallback(
    (kind: KycDocKind) => blobPreviews[kind] ?? signedPreviews[kind],
    [blobPreviews, signedPreviews],
  )

  const driverRef = useMemo(() => {
    const raw = (user?.id ?? '').replace(/-/g, '').slice(0, 6).toUpperCase()
    return raw ? `DRV-${raw}` : null
  }, [user?.id])

  const lockedAtLabel = state.lockedAt
    ? new Date(state.lockedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null

  const inputsDisabled = !online || phase !== 'ready'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto w-full max-w-md px-4 pt-4 md:max-w-2xl md:px-8 md:pt-6">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/driver/profile')}
            aria-label="Go back to profile"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Documents &amp; KYC</h1>
        </div>

        {!online && phase === 'ready' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {OFFLINE_MESSAGE}
          </div>
        )}

        {/* Header + progress summary */}
        <section aria-labelledby="kyc-header-title" className="card mt-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="kyc-header-title" className="text-xl font-bold text-slate-900 dark:text-white">
                Complete Your KYC
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Verified by the TruckOpti team, usually within 24 hours
              </p>
              {driverRef && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  {driverRef}
                </span>
              )}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </div>
          </div>

          {isDemo && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              Dev preview — fabricated mid-flow snapshot (development builds only). Actions are disabled.
            </p>
          )}

          {phase === 'loading' && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-400" aria-hidden />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading your KYC status…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
              <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {loadError ?? 'Could not load your KYC status.'}
              </p>
              <div className="mt-3">
                <SecondaryButton onClick={handleReload} ariaLabel="Retry loading KYC status">
                  <RefreshCw className="h-4 w-4" aria-hidden /> Try again
                </SecondaryButton>
              </div>
            </div>
          )}

          {phase === 'denied' && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Sign in as a driver to view or upload KYC documents.
              </p>
            </div>
          )}

          {phase === 'ready' &&
            (state.locked ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-900/20">
                <ShieldCheck className="h-8 w-8 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
                <div>
                  <p className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                    KYC Verified <Lock className="h-3.5 w-3.5" aria-hidden />
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    All 4 documents accepted{lockedAtLabel ? ` · ${lockedAtLabel}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/60">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {accepted} of 4 documents accepted
                  </span>
                  <span className="shrink-0 pl-2 text-slate-500 dark:text-slate-400">{percent}% Completed</span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="KYC completion"
                >
                  <div className="h-full rounded-full bg-primary-600 transition-all duration-300" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Jobs unlock once all 4 are approved.
                </p>
              </div>
            ))}
        </section>

        {/* Photo-quality guidance */}
        {phase === 'ready' && (
          <section aria-label="Photo quality tips" className="mt-4 grid grid-cols-3 gap-2">
            {KYC_TIPS.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center dark:border-slate-700 dark:bg-slate-800"
              >
                <Icon className="h-5 w-5 text-primary-600 dark:text-primary-300" aria-hidden />
                <span className="text-[11px] font-medium leading-tight text-slate-600 dark:text-slate-300">{label}</span>
              </div>
            ))}
          </section>
        )}

        {/* Uploaded Documents */}
        <section aria-labelledby="kyc-docs-title" className="mt-6">
          <div className="flex items-baseline justify-between">
            <h3 id="kyc-docs-title" className="text-base font-bold text-slate-900 dark:text-white">
              Uploaded Documents
            </h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">4 Requirements</span>
          </div>
          <div className="mt-3 space-y-3">
            {phase !== 'ready' ? (
              <>
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    aria-hidden
                    className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-800/60"
                  />
                ))}
              </>
            ) : (
              KYC_DOC_KINDS.map((kind) => (
                <DocumentCard
                  key={kind}
                  doc={state.docs[kind]}
                  previewUrl={previewFor(kind)}
                  locked={state.locked || isDemo}
                  disabled={inputsDisabled || isDemo}
                  onFile={handleFile}
                  onRetry={handleRetry}
                />
              ))
            )}
          </div>
        </section>

        <p className="mt-5 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Your documents are stored securely and shared only with the TruckOpti verification team.
        </p>
      </div>

      {/* Sticky bottom CTA */}
      {showCta && (
        <div className="sticky bottom-16 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-area-inset-bottom dark:border-slate-700 dark:bg-slate-800/95 md:bottom-0 md:px-8">
          <div className="mx-auto w-full max-w-md md:max-w-2xl">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || !online}
              className="btn btn-primary w-full"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {submitting
                ? 'Submitting…'
                : state.submitted
                  ? 'Submitted — under review'
                  : 'Submit for verification'}
            </button>
            {helper && (
              <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
                {helper}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
