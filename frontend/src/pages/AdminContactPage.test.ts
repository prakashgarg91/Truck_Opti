// Regression suite for AdminContactPage over adminSupabaseApi: loading, empty,
// fetch failure with Retry (never shown as "No inquiries found"), the list with
// formatted dates, the Open / Resolved filter, and Mark Resolved (success and
// failure paths, with the exact call argument).

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactInquiry } from '../services/adminSupabaseApi'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({
    getContactInquiries: vi.fn(),
    getContactInquiriesPage: vi.fn(),
    resolveContactInquiry: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    loggerError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/adminSupabaseApi', () => ({
    adminSupabaseApi: {
        getContactInquiries: h.getContactInquiries,
        getContactInquiriesPage: h.getContactInquiriesPage,
        resolveContactInquiry: h.resolveContactInquiry,
    },
}))

vi.mock('../stores/languageStore', () => ({
    useLanguageStore: () => ({ language: 'en' }),
}))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: h.loggerError },
}))

import AdminContactPage from './AdminContactPage'

const OPEN: ContactInquiry = {
    id: 'inq-1',
    name: 'Ravi Transport',
    email: 'ravi@example.in',
    phone: '9876543210',
    subject: 'Fleet onboarding',
    message: 'We run 12 trucks and want to onboard our drivers.',
    status: 'open',
    created_at: '2026-11-03T10:30:00Z',
}
const RESOLVED: ContactInquiry = {
    id: 'inq-2',
    name: 'Meena Logistics',
    email: 'meena@example.in',
    phone: null,
    subject: 'Billing question',
    message: 'Where do I find my GST invoice?',
    status: 'resolved',
    created_at: '2026-10-20T04:00:00Z',
}

// Same call the page makes, so the expected text is computed in the same locale and timezone.
const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

let root: Root | null = null
let container: HTMLElement | null = null

function pageTree() {
    return createElement(
        MemoryRouter,
        { initialEntries: ['/admin/contact'] },
        createElement(
            Routes,
            null,
            createElement(Route, { path: '/admin', element: createElement('div', null, 'admin-home-marker') }),
            createElement(Route, { path: '/admin/contact', element: createElement(AdminContactPage) }),
        ),
    )
}

const flush = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
})

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(pageTree())
    })
    await flush()
    return container
}

async function click(el: HTMLElement | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => {
        el!.click()
    })
    await flush()
}

const text = () => (container as HTMLElement).textContent || ''
const q = (sel: string) => (container as HTMLElement).querySelector(sel) as HTMLElement | null
const buttons = () => Array.from((container as HTMLElement).querySelectorAll('button'))
const buttonByText = (re: RegExp) => buttons().find((b) => re.test(b.textContent || '')) as HTMLButtonElement | undefined
const cardFor = (name: string) =>
    Array.from((container as HTMLElement).querySelectorAll('.rounded-2xl')).find((el) =>
        (el.textContent || '').includes(name),
    ) as HTMLElement | undefined

afterEach(async () => {
    if (root) {
        await act(async () => {
            root!.unmount()
        })
        root = null
    }
    container?.remove()
    container = null
})

describe('AdminContactPage', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        h.getContactInquiries.mockResolvedValue([OPEN, RESOLVED])
        h.getContactInquiriesPage.mockImplementation(servePage)
        h.resolveContactInquiry.mockResolvedValue(undefined)
    })

    it('shows a labelled loading state while the inquiries are fetched', async () => {
        h.getContactInquiries.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[role="status"]')?.getAttribute('aria-label')).toBe('Loading contact inquiries')
        expect(text()).not.toContain('No inquiries found')
    })

    it('shows the empty message only when the list really is empty', async () => {
        h.getContactInquiries.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No inquiries found')
        expect(q('[data-testid="admin-load-error"]')).toBeNull()
    })

    it('a failed load shows the error state with Retry, not the empty message, and Retry reloads', async () => {
        h.getContactInquiries.mockRejectedValueOnce(new Error('network down'))
        await mountPage()
        expect(q('[data-testid="admin-load-error"]')).toBeTruthy()
        expect(text()).toContain('Could not load contact inquiries.')
        expect(text()).not.toContain('No inquiries found')
        expect(h.toastError).toHaveBeenCalledWith('Failed to load contact inquiries.')
        expect(h.loggerError).toHaveBeenCalledTimes(1)

        await click(buttonByText(/Retry/))
        expect(h.getContactInquiries).toHaveBeenCalledTimes(2)
        expect(q('[data-testid="admin-load-error"]')).toBeNull()
        expect(text()).toContain('Ravi Transport')
    })

    it('lists each inquiry with name, email, phone, subject, message, formatted date and status', async () => {
        await mountPage()
        const open = cardFor('Ravi Transport')!
        expect(open.textContent).toContain('ravi@example.in')
        expect(open.textContent).toContain('9876543210')
        expect(open.textContent).toContain('Fleet onboarding')
        expect(open.textContent).toContain('We run 12 trucks and want to onboard our drivers.')
        expect(open.textContent).toContain(formatDate(OPEN.created_at))
        expect(open.textContent).toContain('Open')
        expect(open.textContent).toContain('Mark Resolved')

        const resolved = cardFor('Meena Logistics')!
        expect(resolved.textContent).toContain('Resolved')
        expect(resolved.textContent).not.toContain('Mark Resolved')
        expect(text()).toContain('2 inquiries')
    })

    it('the Open and Resolved tabs filter the list and the count', async () => {
        await mountPage()
        const tab = (label: string) => buttonByText(new RegExp(`^${label}$`)) as HTMLButtonElement

        await click(tab('Open'))
        expect(cardFor('Ravi Transport')).toBeTruthy()
        expect(cardFor('Meena Logistics')).toBeUndefined()
        expect(text()).toContain('1 inquiries')

        await click(tab('Resolved'))
        expect(cardFor('Meena Logistics')).toBeTruthy()
        expect(cardFor('Ravi Transport')).toBeUndefined()

        await click(tab('All'))
        expect(text()).toContain('2 inquiries')
    })

    it('Mark Resolved sends the inquiry id, updates the row in place and toasts success', async () => {
        await mountPage()
        const card = cardFor('Ravi Transport')!
        const markBtn = Array.from(card.querySelectorAll('button')).find((b) => /Mark Resolved/.test(b.textContent || '')) as HTMLButtonElement
        await click(markBtn)

        expect(h.resolveContactInquiry).toHaveBeenCalledTimes(1)
        expect(h.resolveContactInquiry).toHaveBeenCalledWith('inq-1')
        expect(h.toastSuccess).toHaveBeenCalledWith('Marked as resolved')
        expect(h.getContactInquiries).toHaveBeenCalledTimes(1)
        const updated = cardFor('Ravi Transport')!
        expect(updated.textContent).toContain('Resolved')
        expect(updated.textContent).not.toContain('Mark Resolved')
    })

    it('a failed Mark Resolved toasts the failure and leaves the inquiry Open', async () => {
        h.resolveContactInquiry.mockRejectedValueOnce(new Error('edge down'))
        await mountPage()
        const card = cardFor('Ravi Transport')!
        const markBtn = Array.from(card.querySelectorAll('button')).find((b) => /Mark Resolved/.test(b.textContent || '')) as HTMLButtonElement
        await click(markBtn)

        expect(h.toastError).toHaveBeenCalledWith('Failed to update inquiry.')
        expect(h.toastSuccess).not.toHaveBeenCalled()
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(cardFor('Ravi Transport')!.textContent).toContain('Mark Resolved')
    })

    it('icon-only controls are labelled: back to admin and refresh', async () => {
        await mountPage()
        expect(q('button[aria-label="Back to admin"]')).toBeTruthy()
        expect(q('button[aria-label="Refresh inquiries"]')).toBeTruthy()

        await click(q('button[aria-label="Back to admin"]'))
        expect(text()).toContain('admin-home-marker')
    })
})

// The page loads through getContactInquiriesPage(offset). This stands in for the server: it serves the rows a test set on
// getContactInquiries, at most 200 per page, and reports whether rows remain past the page.
async function servePage(offset: number) {
    const rows = (await h.getContactInquiries()) as ContactInquiry[]
    return { inquiries: rows.slice(offset, offset + 200), hasMore: rows.length > offset + 200 }
}

const inquiryRows = (count: number): ContactInquiry[] =>
    Array.from({ length: count }, (_, i) => ({ ...OPEN, id: `inq-cap-${i}`, name: `Inquiry ${i}` }))

const loadMoreButton = () => buttonByText(/Load more|Loading more/)
const countOf = (needle: string) => text().split(needle).length - 1

describe('AdminContactPage Load more', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        h.resolveContactInquiry.mockResolvedValue(undefined)
        h.getContactInquiriesPage.mockImplementation(servePage)
    })

    it('shows no Load more and no 200-row notice when the server reports no further page', async () => {
        h.getContactInquiries.mockResolvedValue(inquiryRows(199))
        await mountPage()
        expect(text()).toContain('Inquiry 198')
        expect(loadMoreButton()).toBeUndefined()
        expect(text()).not.toContain('Showing the first 200 only.')
    })

    it('shows Load more while rows remain, hides the 200-row notice, and appends each page by offset', async () => {
        h.getContactInquiries.mockResolvedValue(inquiryRows(450))
        await mountPage()
        expect(h.getContactInquiriesPage).toHaveBeenLastCalledWith(0)
        expect(text()).toContain('Inquiry 199')
        expect(text()).not.toContain('Inquiry 200')
        expect(text()).not.toContain('Showing the first 200 only.')

        await click(loadMoreButton()!)
        expect(h.getContactInquiriesPage).toHaveBeenLastCalledWith(200)
        expect(text()).toContain('Inquiry 200')
        expect(text()).toContain('Inquiry 199')
        expect(loadMoreButton()).toBeTruthy()

        await click(loadMoreButton()!)
        expect(h.getContactInquiriesPage).toHaveBeenLastCalledWith(400)
        expect(countOf('Inquiry 449')).toBe(1)
        expect(loadMoreButton()).toBeUndefined()
    })

    it('Load more is disabled and labelled while the next page loads', async () => {
        h.getContactInquiries.mockResolvedValueOnce(inquiryRows(450)).mockReturnValue(new Promise(() => {}))
        await mountPage()
        await click(loadMoreButton()!)
        const busy = loadMoreButton()!
        expect(busy.disabled).toBe(true)
        expect(busy.textContent).toBe('Loading more...')
        expect(text()).toContain('Inquiry 199')
    })

    it('a Load more failure keeps the loaded rows, shows an inline error, and Retry appends the page', async () => {
        h.getContactInquiries
            .mockResolvedValueOnce(inquiryRows(450))
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValue(inquiryRows(450))
        await mountPage()
        await click(loadMoreButton()!)
        expect(q('[role="alert"]')?.textContent).toContain('Could not load more inquiries')
        expect(text()).toContain('Inquiry 199')
        expect(text()).not.toContain('Inquiry 200')
        expect(h.loggerError).toHaveBeenCalledTimes(1)

        await click(buttonByText(/^Retry$/)!)
        expect(h.getContactInquiriesPage).toHaveBeenLastCalledWith(200)
        expect(text()).toContain('Inquiry 200')
        expect(q('[role="alert"]')).toBeNull()
    })

    it('the Open and Resolved filter works on the loaded rows without refetching, and Load more stays under it', async () => {
        h.getContactInquiries.mockResolvedValue(inquiryRows(450))
        await mountPage()
        await click(loadMoreButton()!)
        expect(h.getContactInquiriesPage).toHaveBeenCalledTimes(2)

        await click(buttonByText(/^Resolved$/)!)
        expect(h.getContactInquiriesPage).toHaveBeenCalledTimes(2)
        expect(text()).toContain('No loaded inquiries match this filter. Load more to see more.')
        expect(loadMoreButton()).toBeTruthy()
    })
})
