import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            insert: insertMock,
        })),
    },
}))

import {
    getStoredContactDraft,
    getPendingContactInquiry,
    persistContactDraft,
    clearStoredContactState,
    queuePendingContactInquiry,
    submitContactInquiry,
    type ContactInquiryPayload,
    type StoredContactInquiry,
} from './contactInquiry'

describe('contactInquiry', () => {
    const mockLocalStorage: Record<string, string> = {}

    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn((key) => mockLocalStorage[key] ?? null),
                setItem: vi.fn((key, value) => {
                    mockLocalStorage[key] = value
                }),
                removeItem: vi.fn((key) => {
                    delete mockLocalStorage[key]
                }),
            },
            writable: true,
        })
        Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key])
    })

    describe('getStoredContactDraft', () => {
        it('returns null when no draft exists', () => {
            const result = getStoredContactDraft()
            expect(result).toBeNull()
        })

        it('returns normalized draft when exists', () => {
            const draft: ContactInquiryPayload = {
                name: '  John Doe  ',
                email: '  JOHN@EXAMPLE.COM  ',
                phone: '  9876543210  ',
                subject: 'Test Subject',
                message: '  Test message  ',
            }
            mockLocalStorage['truckopti:contact-draft'] = JSON.stringify(draft)

            const result = getStoredContactDraft()

            expect(result).toEqual({
                name: 'John Doe',
                email: 'john@example.com',
                phone: '9876543210',
                subject: 'Test Subject',
                message: 'Test message',
            })
        })

        it('handles invalid JSON gracefully', () => {
            mockLocalStorage['truckopti:contact-draft'] = 'invalid json'

            const result = getStoredContactDraft()

            expect(result).toBeNull()
        })

        it('returns null when draft is empty', () => {
            const draft: ContactInquiryPayload = {
                name: '',
                email: '',
                phone: '',
                subject: '',
                message: '',
            }
            mockLocalStorage['truckopti:contact-draft'] = JSON.stringify(draft)

            const result = getStoredContactDraft()

            expect(result).toBeNull()
        })
    })

    describe('getPendingContactInquiry', () => {
        it('returns null when no pending inquiry exists', () => {
            const result = getPendingContactInquiry()
            expect(result).toBeNull()
        })

        it('returns normalized pending inquiry with submission ID', () => {
            const pending: StoredContactInquiry = {
                name: '  John Doe  ',
                email: '  JOHN@EXAMPLE.COM  ',
                phone: '  9876543210  ',
                subject: 'Test Subject',
                message: '  Test message  ',
                clientSubmissionId: 'existing-id-123',
            }
            mockLocalStorage['truckopti:contact-pending'] = JSON.stringify(pending)

            const result = getPendingContactInquiry()

            expect(result).toEqual({
                name: 'John Doe',
                email: 'john@example.com',
                phone: '9876543210',
                subject: 'Test Subject',
                message: 'Test message',
                clientSubmissionId: 'existing-id-123',
            })
        })

        it('generates new submission ID when missing', () => {
            const pending: StoredContactInquiry = {
                name: 'John Doe',
                email: 'john@example.com',
                phone: '9876543210',
                subject: 'Test Subject',
                message: 'Test message',
                clientSubmissionId: '',
            } as any
            mockLocalStorage['truckopti:contact-pending'] = JSON.stringify(pending)

            const result = getPendingContactInquiry()

            expect(result?.clientSubmissionId).toMatch(/^[a-f0-9-]+$/)
        })
    })

    describe('persistContactDraft', () => {
        it('stores draft with content', () => {
            const payload: ContactInquiryPayload = {
                name: '  John Doe  ',
                email: '  JOHN@EXAMPLE.COM  ',
                phone: '  9876543210  ',
                subject: 'Test Subject',
                message: '  Test message  ',
            }

            persistContactDraft(payload)

            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                'truckopti:contact-draft',
                JSON.stringify({
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '9876543210',
                    subject: 'Test Subject',
                    message: 'Test message',
                })
            )
        })

        it('removes draft when payload is null', () => {
            mockLocalStorage['truckopti:contact-draft'] = 'existing draft'
            persistContactDraft(null)

            expect(window.localStorage.removeItem).toHaveBeenCalledWith('truckopti:contact-draft')
        })

        it('removes draft when all fields are empty', () => {
            const emptyPayload: ContactInquiryPayload = {
                name: '  ',
                email: '  ',
                phone: '',
                subject: '',
                message: '',
            }

            persistContactDraft(emptyPayload)

            expect(window.localStorage.removeItem).toHaveBeenCalledWith('truckopti:contact-draft')
        })

        it('keeps draft when at least one field has content', () => {
            const payload: ContactInquiryPayload = {
                name: 'John',
                email: '',
                phone: '',
                subject: '',
                message: '',
            }

            persistContactDraft(payload)

            expect(window.localStorage.setItem).toHaveBeenCalled()
            expect(window.localStorage.removeItem).not.toHaveBeenCalled()
        })
    })

    describe('clearStoredContactState', () => {
        it('clears both draft and pending storage', () => {
            mockLocalStorage['truckopti:contact-draft'] = 'draft'
            mockLocalStorage['truckopti:contact-pending'] = 'pending'

            clearStoredContactState()

            expect(window.localStorage.removeItem).toHaveBeenCalledWith('truckopti:contact-draft')
            expect(window.localStorage.removeItem).toHaveBeenCalledWith('truckopti:contact-pending')
        })
    })

    describe('queuePendingContactInquiry', () => {
        it('stores pending inquiry with new submission ID', () => {
            const payload: ContactInquiryPayload = {
                name: 'John Doe',
                email: 'john@example.com',
                phone: '9876543210',
                subject: 'Test Subject',
                message: 'Test message',
            }

            const result = queuePendingContactInquiry(payload)

            expect(result.clientSubmissionId).toMatch(/^[a-f0-9-]+$/)
            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                'truckopti:contact-pending',
                expect.stringContaining('clientSubmissionId')
            )
            expect(window.localStorage.setItem).toHaveBeenCalledWith(
                'truckopti:contact-draft',
                expect.any(String)
            )
        })

        it('uses existing submission ID when provided', () => {
            const payload: ContactInquiryPayload = {
                name: 'John Doe',
                email: 'john@example.com',
                phone: '9876543210',
                subject: 'Test Subject',
                message: 'Test message',
            }

            const result = queuePendingContactInquiry(payload, 'existing-id-123')

            expect(result.clientSubmissionId).toBe('existing-id-123')
        })

        it('normalizes payload before storing', () => {
            const payload: ContactInquiryPayload = {
                name: '  John Doe  ',
                email: '  JOHN@EXAMPLE.COM  ',
                phone: '  9876543210  ',
                subject: 'Test Subject',
                message: '  Test message  ',
            }

            const result = queuePendingContactInquiry(payload)

            expect(result.name).toBe('John Doe')
            expect(result.email).toBe('john@example.com')
            expect(result.phone).toBe('9876543210')
            expect(result.message).toBe('Test message')
        })
    })

    describe('submitContactInquiry', () => {
        const validPayload: ContactInquiryPayload = {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '9876543210',
            subject: 'Test Subject',
            message: 'Test message',
        }

        it('submits inquiry successfully', async () => {
            insertMock.mockResolvedValue({ error: null })

            const result = await submitContactInquiry(validPayload)

            expect(result).toMatchObject({
                name: 'John Doe',
                email: 'john@example.com',
                phone: '9876543210',
                subject: 'Test Subject',
                message: 'Test message',
            })
            expect(result.clientSubmissionId).toMatch(/^[a-f0-9-]+$/)
            expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
                name: 'John Doe',
                email: 'john@example.com',
                phone: '9876543210',
                subject: 'Test Subject',
                message: 'Test message',
            }))
        })

        it('uses existing submission ID when provided', async () => {
            insertMock.mockResolvedValue({ error: null })

            const result = await submitContactInquiry(validPayload, 'existing-id-123')

            expect(result.clientSubmissionId).toBe('existing-id-123')
        })

        it('normalizes phone number (trims whitespace)', async () => {
            insertMock.mockResolvedValue({ error: null })

            const payloadWithPhone = {
                ...validPayload,
                phone: '  9876543210  ',
            }

            await submitContactInquiry(payloadWithPhone)

            expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
                phone: '9876543210',
            }))
        })

        it('handles duplicate key constraint gracefully', async () => {
            const mockError = {
                code: '23505',
                message: 'duplicate key value violates unique constraint',
            }
            insertMock.mockResolvedValue({ error: mockError })

            const result = await submitContactInquiry(validPayload)

            expect(result.clientSubmissionId).toMatch(/^[a-f0-9-]+$/)
        })

        it('handles duplicate key by message text', async () => {
            const mockError = {
                code: 'OTHER_CODE',
                message: 'duplicate key constraint violated',
            }
            insertMock.mockResolvedValue({ error: mockError })

            const result = await submitContactInquiry(validPayload)

            expect(result.clientSubmissionId).toMatch(/^[a-f0-9-]+$/)
        })

        it('throws error for non-duplicate failures', async () => {
            const mockError = {
                code: 'OTHER_ERROR',
                message: 'Database connection failed',
            }
            insertMock.mockResolvedValue({ error: mockError })

            await expect(submitContactInquiry(validPayload)).rejects.toEqual(mockError)
        })

        it('generates clientSubmissionId when not provided', async () => {
            insertMock.mockResolvedValue({ error: null })

            const result = await submitContactInquiry(validPayload)

            expect(result.clientSubmissionId).toBeDefined()
            expect(result.clientSubmissionId).toMatch(/^[a-f0-9-]+$/)
            expect(insertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    client_submission_id: result.clientSubmissionId,
                })
            )
        })

        it('normalizes email to lowercase', async () => {
            insertMock.mockResolvedValue({ error: null })

            const payloadWithEmail = {
                ...validPayload,
                email: 'JOHN@EXAMPLE.COM',
            }

            const result = await submitContactInquiry(payloadWithEmail)

            expect(result.email).toBe('john@example.com')
            expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
                email: 'john@example.com',
            }))
        })
    })
})