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
  ScanLine,
  Send,
  ShieldCheck,
  Sun,
  Truck,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { useAuthStore } from '../stores/authStore'
import {
  KYC_DOC_KINDS,
  KYC_DOC_META,
  acceptDocument,
  cancelUpload,
  canSubmitForVerification,
  completeUpload,
  createInitialKycState,
  createMidflowDemoState,
  failUpload,
  kycAcceptedCount,
  kycCompletionPercent,
  retryFromError,
  setUploadProgress,
  startUpload,
  submitForVerification,
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
  { label: (doc: KycDocument) => string; className: string; Icon: typeof Clock; spin?: boolean }
> = {
  pending: {
    label: () => 'Pending',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    Icon: Clock,
  },
  uploading: {
    label: (doc) => `Uploading ${doc.progress}%`,
    className: 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
    Icon: Loader2,
    spin: true,
  },
  pending_review: {
    label: () => 'Pending review',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Icon: Clock,
  },
  rejected: {
    label: () => 'Review Needed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    Icon: AlertTriangle,
  },
  accepted: {
    label: () => 'Accepted',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  error: {
    label: () => 'Upload failed',
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
      {label(doc)}
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
  onFile,
  onCancel,
  onRetry,
}: {
  doc: KycDocument
  previewUrl?: string
  locked: boolean
  onFile: (kind: KycDocKind, file: File | undefined) => void
  onCancel: (kind: KycDocKind) => void
  onRetry: (kind: KycDocKind) => void
}) {
  const meta = KYC_DOC_META[doc.kind]
  const Icon = KIND_ICONS[doc.kind]
  const inputId = `kyc-upload-${doc.kind}`
  const canModify = !locked

  const body = (() => {
    switch (doc.status) {
      case 'pending':
        return (
          <div>
            <label
              htmlFor={inputId}
              className="flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-primary-700 transition-colors hover:border-primary-400 hover:bg-primary-50/60 dark:border-slate-600 dark:bg-slate-900/40 dark:text-primary-300 dark:hover:border-primary-500/50"
            >
              <Camera className="h-4 w-4" aria-hidden />
              Take photo or upload
            </label>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {meta.helper}
            </p>
          </div>
        )
      case 'uploading':
        return (
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Uploading ${doc.progress}%`}>
              <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
                <circle cx="32" cy="32" r="27" fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-slate-700" />
                <circle
                  cx="32"
                  cy="32"
                  r="27"
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 27}
                  strokeDashoffset={2 * Math.PI * 27 * (1 - doc.progress / 100)}
                  className="stroke-primary-600 transition-[stroke-dashoffset] duration-200"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200">
                {doc.progress}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {doc.fileName} · {formatSize(doc.fileSizeBytes)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Upload in progress…</p>
            </div>
            <button
              type="button"
              onClick={() => onCancel(doc.kind)}
              aria-label={`Cancel ${meta.title} upload`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
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
        disabled={locked}
        onChange={(event) => {
          onFile(doc.kind, event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </section>
  )
}

export default function DriverKycPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDemo = searchParams.get('demo') === 'midflow'

  const [state, setState] = useState<KycSubmissionState>(() =>
    isDemo ? createMidflowDemoState() : createInitialKycState(),
  )
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const uploadTimers = useRef(new Map<KycDocKind, ReturnType<typeof setInterval>>())
  const reviewTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])
  const [previews, setPreviews] = useState<Partial<Record<KycDocKind, string>>>({})

  useEffect(() => {
    document.title = 'Documents & KYC - TruckOpti'
  }, [])

  useEffect(() => {
    const timers = uploadTimers.current
    const timeouts = reviewTimeouts.current
    return () => {
      timers.forEach((timer) => clearInterval(timer))
      timers.clear()
      timeouts.forEach((timeout) => clearTimeout(timeout))
    }
  }, [])

  // Revoke blob URLs when replaced or on unmount.
  useEffect(() => {
    return () => {
      for (const url of Object.values(previews)) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [previews])

  const stopUploadTimer = useCallback((kind: KycDocKind) => {
    const timer = uploadTimers.current.get(kind)
    if (timer) {
      clearInterval(timer)
      uploadTimers.current.delete(kind)
    }
  }, [])

  const clearPreview = useCallback((kind: KycDocKind) => {
    setPreviews((prev) => {
      if (!(kind in prev)) return prev
      const next = { ...prev }
      delete next[kind]
      return next
    })
  }, [])

  useEffect(() => {
    for (const kind of KYC_DOC_KINDS) {
      if (state.docs[kind].status !== 'uploading') stopUploadTimer(kind)
    }
  }, [state, stopUploadTimer])

  const handleFile = useCallback(
    (kind: KycDocKind, file: File | undefined) => {
      if (!file) return
      const current = stateRef.current
      if (current.locked || current.submitted) return

      const validationError = validateUploadFile(file)
      if (validationError) {
        setState((s) => failUpload(s, kind, validationError))
        toast.error(validationError)
        return
      }

      clearPreview(kind)
      setState((s) => startUpload(s, kind, { name: file.name, sizeBytes: file.size, type: file.type }))
      stopUploadTimer(kind)

      const timer = setInterval(() => {
        const doc = stateRef.current.docs[kind]
        if (doc.status !== 'uploading') {
          stopUploadTimer(kind)
          return
        }
        const next = Math.min(100, doc.progress + 8 + Math.round(Math.random() * 9))
        if (next >= 100) {
          stopUploadTimer(kind)
          if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file)
            setPreviews((prev) => ({ ...prev, [kind]: url }))
          }
          setState((s) => completeUpload(s, kind))
        } else {
          setState((s) => setUploadProgress(s, kind, next))
        }
      }, 180)
      uploadTimers.current.set(kind, timer)
    },
    [clearPreview, stopUploadTimer],
  )

  const handleCancel = useCallback(
    (kind: KycDocKind) => {
      stopUploadTimer(kind)
      setState((s) => cancelUpload(s, kind))
    },
    [stopUploadTimer],
  )

  const handleRetry = useCallback((kind: KycDocKind) => {
    setState((s) => retryFromError(s, kind))
  }, [])

  const handleSubmit = useCallback(() => {
    const current = stateRef.current
    if (!canSubmitForVerification(current)) return
    setState((s) => submitForVerification(s))

    const pendingKinds = KYC_DOC_KINDS.filter((k) => current.docs[k].status === 'pending_review')
    pendingKinds.forEach((kind, index) => {
      const timeout = setTimeout(() => {
        reviewTimeouts.current = reviewTimeouts.current.filter((t) => t !== timeout)
        setState((s) => acceptDocument(s, kind))
        if (index === pendingKinds.length - 1) {
          toast.success('All documents verified — KYC complete')
        }
      }, 900 + index * 700)
      reviewTimeouts.current.push(timeout)
    })
  }, [])

  const accepted = kycAcceptedCount(state)
  const percent = kycCompletionPercent(state)
  const canSubmit = canSubmitForVerification(state)
  const helper = submitHelperText(state)

  const driverRef = useMemo(() => {
    const raw = (user?.id ?? '').replace(/-/g, '').slice(0, 6).toUpperCase()
    return raw ? `DRV-${raw}` : null
  }, [user?.id])

  const lockedAtLabel = state.lockedAt
    ? new Date(state.lockedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null

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
              Demo preview — mid-flow snapshot from the generated design.
            </p>
          )}

          {state.locked ? (
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
          )}
        </section>

        {/* Photo-quality guidance */}
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

        {/* Uploaded Documents */}
        <section aria-labelledby="kyc-docs-title" className="mt-6">
          <div className="flex items-baseline justify-between">
            <h3 id="kyc-docs-title" className="text-base font-bold text-slate-900 dark:text-white">
              Uploaded Documents
            </h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">4 Requirements</span>
          </div>
          <div className="mt-3 space-y-3">
            {KYC_DOC_KINDS.map((kind) => (
              <DocumentCard
                key={kind}
                doc={state.docs[kind]}
                previewUrl={previews[kind]}
                locked={state.locked}
                onFile={handleFile}
                onCancel={handleCancel}
                onRetry={handleRetry}
              />
            ))}
          </div>
        </section>

        <p className="mt-5 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Your documents are stored securely and shared only with the TruckOpti verification team.
        </p>
      </div>

      {/* Sticky bottom CTA */}
      {!state.locked && (
        <div className="sticky bottom-16 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur safe-area-inset-bottom dark:border-slate-700 dark:bg-slate-800/95 md:bottom-0 md:px-8">
          <div className="mx-auto w-full max-w-md md:max-w-2xl">
            <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="btn btn-primary w-full">
              <Send className="h-4 w-4" aria-hidden />
              {state.submitted ? 'Submitted — under review' : 'Submit for verification'}
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
