import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(() => ({
    insert: vi.fn(() => ({ error: null })),
  })),
}))

vi.mock('../lib/supabase', () => ({
  supabase: supabaseMock,
}))

import {
  getStoredContactDraft,
  persistContactDraft,
  type ContactInquiryPayload,
} from './contactInquiry'

const CONTACT_DRAFT_KEY = 'truckopti:contact-draft'

describe('getStoredContactDraft', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(CONTACT_DRAFT_KEY)
    }
    vi.clearAllMocks()
  })

  it('returns null when no draft is stored', () => {
    const draft = getStoredContactDraft()
    expect(draft).toBeNull()
  })

  it('returns null when stored draft has all empty strings', () => {
    const emptyDraft: ContactInquiryPayload = {
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: '',
    }
    localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(emptyDraft))

    const draft = getStoredContactDraft()
    expect(draft).toBeNull()
  })

  it('returns null when stored draft has only whitespace strings', () => {
    const whitespaceDraft: ContactInquiryPayload = {
      name: '   ',
      email: '  \t  ',
      phone: '\n',
      subject: '    ',
      message: ' \t\n ',
    }
    localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(whitespaceDraft))

    const draft = getStoredContactDraft()
    expect(draft).toBeNull()
  })

  it('returns null when stored draft has mixed empty and whitespace strings', () => {
    const mixedWhitespaceDraft: ContactInquiryPayload = {
      name: '',
      email: '  ',
      phone: '\t',
      subject: '',
      message: '\n  ',
    }
    localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(mixedWhitespaceDraft))

    const draft = getStoredContactDraft()
    expect(draft).toBeNull()
  })

  it('normalizes and returns a draft with real content', () => {
    const realDraft: ContactInquiryPayload = {
      name: 'John Doe',
      email: 'JOHN@EXAMPLE.COM',
      phone: '  9999999999  ',
      subject: 'Trucking Inquiry',
      message: 'This is a test message  ',
    }
    localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(realDraft))

    const draft = getStoredContactDraft()
    expect(draft).not.toBeNull()
    expect(draft).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9999999999',
      subject: 'Trucking Inquiry',
      message: 'This is a test message',
    })
  })

  it('normalizes and returns a draft with partial content', () => {
    const partialDraft: ContactInquiryPayload = {
      name: '  Jane  ',
      email: '',
      phone: '',
      subject: '',
      message: '',
    }
    localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(partialDraft))

    const draft = getStoredContactDraft()
    expect(draft).not.toBeNull()
    expect(draft).toEqual({
      name: 'Jane',
      email: '',
      phone: '',
      subject: '',
      message: '',
    })
  })

  it('handles localStorage parsing errors gracefully', () => {
    localStorage.setItem(CONTACT_DRAFT_KEY, 'invalid-json')

    const draft = getStoredContactDraft()
    expect(draft).toBeNull()
  })

  it('removes empty draft from localStorage after persistContactDraft with null', () => {
    const draft: ContactInquiryPayload = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      subject: 'Test',
      message: 'Test message',
    }
    localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(draft))

    persistContactDraft(null)
    expect(localStorage.getItem(CONTACT_DRAFT_KEY)).toBeNull()
  })

  it('removes empty draft from localStorage after persistContactDraft with empty values', () => {
    const draft: ContactInquiryPayload = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      subject: 'Test',
      message: 'Test message',
    }
    localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(draft))

    const emptyDraft: ContactInquiryPayload = {
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: '',
    }
    persistContactDraft(emptyDraft)
    expect(localStorage.getItem(CONTACT_DRAFT_KEY)).toBeNull()
  })
})