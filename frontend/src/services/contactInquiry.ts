import { supabase } from '../lib/supabase'

const CONTACT_DRAFT_KEY = 'truckopti:contact-draft'
const CONTACT_PENDING_KEY = 'truckopti:contact-pending'

export interface ContactInquiryPayload {
  name: string
  email: string
  phone: string
  subject: string
  message: string
}

export interface StoredContactInquiry extends ContactInquiryPayload {
  clientSubmissionId: string
}

const hasWindow = () => typeof window !== 'undefined'

const createClientSubmissionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const readStoredInquiry = <T>(key: string): T | null => {
  if (!hasWindow()) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

const writeStoredInquiry = (key: string, value: unknown | null) => {
  if (!hasWindow()) {
    return
  }

  try {
    if (value) {
      window.localStorage.setItem(key, JSON.stringify(value))
      return
    }

    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage failures and keep the primary submission path working.
  }
}

const normalizeInquiry = (payload: ContactInquiryPayload): ContactInquiryPayload => ({
  name: payload.name.trim(),
  email: payload.email.trim().toLowerCase(),
  phone: payload.phone.trim(),
  subject: payload.subject,
  message: payload.message.trim(),
})

export const getStoredContactDraft = (): ContactInquiryPayload | null => {
  const draft = readStoredInquiry<ContactInquiryPayload>(CONTACT_DRAFT_KEY)
  return draft ? normalizeInquiry(draft) : null
}

export const getPendingContactInquiry = (): StoredContactInquiry | null => {
  const pending = readStoredInquiry<StoredContactInquiry>(CONTACT_PENDING_KEY)
  if (!pending) {
    return null
  }

  return {
    ...normalizeInquiry(pending),
    clientSubmissionId: pending.clientSubmissionId || createClientSubmissionId(),
  }
}

export const persistContactDraft = (payload: ContactInquiryPayload | null) => {
  const hasContent = payload && Object.values(payload).some((value) => value.trim().length > 0)
  writeStoredInquiry(CONTACT_DRAFT_KEY, hasContent ? normalizeInquiry(payload) : null)
}

export const clearStoredContactState = () => {
  writeStoredInquiry(CONTACT_DRAFT_KEY, null)
  writeStoredInquiry(CONTACT_PENDING_KEY, null)
}

export const queuePendingContactInquiry = (
  payload: ContactInquiryPayload,
  existingClientSubmissionId?: string
): StoredContactInquiry => {
  const storedPayload: StoredContactInquiry = {
    ...normalizeInquiry(payload),
    clientSubmissionId: existingClientSubmissionId || createClientSubmissionId(),
  }

  writeStoredInquiry(CONTACT_PENDING_KEY, storedPayload)
  writeStoredInquiry(CONTACT_DRAFT_KEY, storedPayload)

  return storedPayload
}

export const submitContactInquiry = async (
  payload: ContactInquiryPayload,
  existingClientSubmissionId?: string
): Promise<StoredContactInquiry> => {
  const submission: StoredContactInquiry = {
    ...normalizeInquiry(payload),
    clientSubmissionId: existingClientSubmissionId || createClientSubmissionId(),
  }
  const normalizedPhone = submission.phone.trim()

  const { error } = await supabase.from('contact_inquiries').insert({
    name: submission.name,
    email: submission.email,
    phone: normalizedPhone || null,
    subject: submission.subject,
    message: submission.message,
    client_submission_id: submission.clientSubmissionId,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (error.code === '23505' || message.includes('duplicate key')) {
      return submission
    }

    throw error
  }

  return submission
}