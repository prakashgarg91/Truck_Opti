import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-144-D2 Client Agreements & Sites (Stitch screen 0768c6ac) over
// agencyClientsApi: master-detail states, GSTIN/pincode/payment-terms
// validation gates, one idempotency key per create intent, business
// refusals surfaced verbatim, ended-agreement read-only banner and the
// single-refetch version conflict.

const h = vi.hoisted(() => ({
    listAgreements: vi.fn(),
    listSites: vi.fn(),
    listContacts: vi.fn(),
    createAgreement: vi.fn(),
    updateAgreement: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/agencyOrganizationApi', () => ({
    agencyClientsApi: {
        listAgreements: h.listAgreements,
        listSites: h.listSites,
        listContacts: h.listContacts,
        createAgreement: h.createAgreement,
        updateAgreement: h.updateAgreement,
        createSite: h.createSite,
        updateSite: h.updateSite,
        createContact: h.createContact,
        updateContact: h.updateContact,
    },
}))

import AgencyClientsPage from './AgencyClientsPage'
import { UserFacingError } from '../utils/userFacingError'

const ACTIVE = {
    id: 'ag-1',
    client_name: 'Sri Balaji Transport',
    client_gstin: '27ABCDE1234F1Z5',
    payment_terms_days: 30,
    status: 'active',
    version: 3,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
}
const ENDED = {
    id: 'ag-2',
    client_name: 'Nova Steel Traders',
    client_gstin: null,
    payment_terms_days: null,
    status: 'ended',
    version: 5,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
}
const BILL_SITE = {
    id: 'site-1',
    agreement_id: 'ag-1',
    site_kind: 'bill_to',
    label: 'Head office',
    address_line: '12 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    status: 'active',
    version: 2,
}
const SHIP_SITE = {
    id: 'site-2',
    agreement_id: 'ag-1',
    site_kind: 'ship_to',
    label: 'Plant gate',
    address_line: 'Survey 44',
    city: 'Nashik',
    state: 'Maharashtra',
    pincode: '422001',
    status: 'active',
    version: 1,
}
const CONTACT = {
    id: 'con-1',
    agreement_id: 'ag-1',
    site_id: 'site-1',
    full_name: 'Ravi Kumar',
    phone: '9876543210',
    email: 'ravi@balaji.in',
    status: 'active',
    version: 1,
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, null, createElement(AgencyClientsPage)))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
    await act(async () => {
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
}

async function selectClient(name: RegExp) {
    await click(buttons(name)[0])
}

describe('AgencyClientsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.listAgreements.mockResolvedValue([ACTIVE, ENDED])
        h.listSites.mockResolvedValue([BILL_SITE, SHIP_SITE])
        h.listContacts.mockResolvedValue([CONTACT])
    })

    it('renders a busy status region while loading', async () => {
        h.listAgreements.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const loading = q('[data-testid="clients-loading"]')
        expect(loading?.getAttribute('role')).toBe('status')
        expect(loading?.getAttribute('aria-busy')).toBe('true')
    })

    it('lists clients with name, GSTIN, Net terms and status badges', async () => {
        await mountPage()
        expect(document.title).toBe('Clients - TruckOpti')
        const list = q('[data-testid="clients-list"]')?.textContent || ''
        expect(list).toContain('Sri Balaji Transport')
        expect(list).toContain('27ABCDE1234F1Z5')
        expect(list).toContain('Net 30')
        expect(list).toContain('Active')
        expect(list).toContain('Nova Steel Traders')
        expect(list).toContain('Ended')
    })

    it('search filters the client list', async () => {
        await mountPage()
        await type(q('input[name="client-search"]') as HTMLInputElement, 'balaji')
        const list = q('[data-testid="clients-list"]')?.textContent || ''
        expect(list).toContain('Sri Balaji Transport')
        expect(list).not.toContain('Nova Steel Traders')
    })

    it('empty state invites the first client agreement', async () => {
        h.listAgreements.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No clients yet. Add your first client agreement.')
    })

    it('error state offers Retry that refetches', async () => {
        h.listAgreements.mockRejectedValueOnce(new UserFacingError('Failed to load client agreements'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load client agreements')
        await click(buttons(/Retry/)[0])
        expect(h.listAgreements).toHaveBeenCalledTimes(2)
        expect(text()).toContain('Sri Balaji Transport')
    })

    it('denial (agency approval) renders the no-access message, not a generic error', async () => {
        h.listAgreements.mockRejectedValue(new UserFacingError('Agency approval is required.'))
        await mountPage()
        expect(text()).toContain('You do not have access to client records')
        expect(q('[role="alert"]')).toBeNull()
    })

    it('denial (access scope) renders the no-access message', async () => {
        h.listAgreements.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="clients-denied"]')).not.toBeNull()
        expect(text()).toContain('You do not have access to client records')
    })

    it('add client upper-cases the GSTIN and sends one idempotency key, then refetches', async () => {
        h.createAgreement.mockResolvedValue({ ok: true, state: 'created', agreement: { ...ACTIVE, id: 'ag-9' } })
        await mountPage()
        await click(buttons(/Add client/)[0])
        await type(q('input[name="client-name"]') as HTMLInputElement, 'Kesari Logistics')
        await type(q('input[name="client-gstin"]') as HTMLInputElement, '27abcde1234f1z5')
        await type(q('input[name="client-terms"]') as HTMLInputElement, '15')
        await click(buttons(/Save client/)[0])

        expect(h.createAgreement).toHaveBeenCalledTimes(1)
        expect(h.createAgreement).toHaveBeenCalledWith({
            clientName: 'Kesari Logistics',
            clientGstin: '27ABCDE1234F1Z5',
            paymentTermsDays: 15,
            idempotencyKey: expect.any(String),
        })
        expect(h.toastSuccess).toHaveBeenCalled()
        expect(h.listAgreements).toHaveBeenCalledTimes(2)
    })

    it('an invalid GSTIN blocks the create call with an inline message', async () => {
        await mountPage()
        await click(buttons(/Add client/)[0])
        await type(q('input[name="client-name"]') as HTMLInputElement, 'Kesari Logistics')
        await type(q('input[name="client-gstin"]') as HTMLInputElement, '27AB')
        await click(buttons(/Save client/)[0])
        expect(h.createAgreement).not.toHaveBeenCalled()
        expect(text()).toContain('15-character GSTIN')
    })

    it('payment terms outside 0-365 block the create call', async () => {
        await mountPage()
        await click(buttons(/Add client/)[0])
        await type(q('input[name="client-name"]') as HTMLInputElement, 'Kesari Logistics')
        await type(q('input[name="client-terms"]') as HTMLInputElement, '400')
        await click(buttons(/Save client/)[0])
        expect(h.createAgreement).not.toHaveBeenCalled()
        expect(text()).toContain('between 0 and 365 days')
    })

    it('selecting a client shows grouped sites, the bill-to rule, contacts and the Tariffs link', async () => {
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        const detail = q('[data-testid="clients-detail"]')?.textContent || ''
        expect(detail).toContain('Bill-to')
        expect(detail).toContain('Only one active bill-to site per client')
        expect(detail).toContain('Head office')
        expect(detail).toContain('Plant gate')
        expect(detail).toContain('411001')
        expect(q('a[href="/agency/clients/ag-1/tariffs"]')).not.toBeNull()

        await click(buttons(/Contacts/)[0])
        const contactsTab = q('[data-testid="clients-detail"]')?.textContent || ''
        expect(contactsTab).toContain('Ravi Kumar')
        expect(contactsTab).toContain('9876543210')
        expect(contactsTab).toContain('Head office')
    })

    it('an ended agreement is read-only with its banner and a Reactivate action', async () => {
        await mountPage()
        await selectClient(/Nova Steel Traders/)
        const detail = q('[data-testid="clients-detail"]')?.textContent || ''
        expect(detail).toContain('This agreement is ended; reactivate it to add sites or tariffs.')
        expect(buttons(/Add site/)).toHaveLength(0)
        expect(buttons(/Add contact/)).toHaveLength(0)
        expect(buttons(/Edit details/)).toHaveLength(0)
        expect(buttons(/End agreement/)).toHaveLength(0)
        expect(buttons(/Reactivate/)).toHaveLength(1)
    })

    it('add site sends the typed fields and one idempotency key, then refetches once', async () => {
        h.createSite.mockResolvedValue({ ok: true, state: 'created', site: { ...SHIP_SITE, id: 'site-3' } })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Add site/)[0])
        await type(q('select[name="site-kind"]') as HTMLSelectElement, 'ship_to')
        await type(q('input[name="site-label"]') as HTMLInputElement, 'Warehouse 2')
        await type(q('input[name="site-address"]') as HTMLInputElement, 'Plot 7 MIDC')
        await type(q('input[name="site-city"]') as HTMLInputElement, 'Nashik')
        await type(q('select[name="site-state"]') as HTMLSelectElement, 'Maharashtra')
        await type(q('input[name="site-pincode"]') as HTMLInputElement, '422007')
        await click(buttons(/Save site/)[0])

        expect(h.createSite).toHaveBeenCalledTimes(1)
        expect(h.createSite).toHaveBeenCalledWith({
            agreementId: 'ag-1',
            siteKind: 'ship_to',
            label: 'Warehouse 2',
            addressLine: 'Plot 7 MIDC',
            city: 'Nashik',
            state: 'Maharashtra',
            pincode: '422007',
            idempotencyKey: expect.any(String),
        })
        expect(h.toastSuccess).toHaveBeenCalled()
        expect(h.listSites).toHaveBeenCalledTimes(2)
    })

    it('an invalid pincode blocks the site call', async () => {
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Add site/)[0])
        await type(q('input[name="site-label"]') as HTMLInputElement, 'Warehouse 2')
        await type(q('input[name="site-address"]') as HTMLInputElement, 'Plot 7 MIDC')
        await type(q('input[name="site-city"]') as HTMLInputElement, 'Nashik')
        await type(q('select[name="site-state"]') as HTMLSelectElement, 'Maharashtra')
        await type(q('input[name="site-pincode"]') as HTMLInputElement, '4220')
        await click(buttons(/Save site/)[0])
        expect(h.createSite).not.toHaveBeenCalled()
        expect(text()).toContain('Pincode must be 6 digits')
    })

    it('an active_bill_to_exists refusal surfaces its message and refetches once', async () => {
        h.createSite.mockResolvedValue({
            ok: false,
            error: 'active_bill_to_exists',
            message: 'Only one active bill-to site is allowed per client. Deactivate the current one first.',
        })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Add site/)[0])
        await type(q('input[name="site-label"]') as HTMLInputElement, 'Second bill office')
        await type(q('input[name="site-address"]') as HTMLInputElement, '5 Station Road')
        await type(q('input[name="site-city"]') as HTMLInputElement, 'Pune')
        await type(q('select[name="site-state"]') as HTMLSelectElement, 'Maharashtra')
        await type(q('input[name="site-pincode"]') as HTMLInputElement, '411002')
        await click(buttons(/Save site/)[0])

        expect(h.createSite).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Only one active bill-to site is allowed per client. Deactivate the current one first.')
        expect(h.listSites).toHaveBeenCalledTimes(2)
    })

    it('ending an agreement confirms by name and sends status ended with the version', async () => {
        h.updateAgreement.mockResolvedValue({ ok: true, state: 'updated', agreement: { ...ACTIVE, status: 'ended' } })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/End agreement/)[0])
        const dialog = q('[role="dialog"]') as HTMLElement
        expect(dialog.textContent).toContain('Sri Balaji Transport')
        expect(h.updateAgreement).not.toHaveBeenCalled()
        await click(Array.from(dialog.querySelectorAll('button')).find((b) => /End agreement/.test(b.textContent || '')) as HTMLButtonElement)
        expect(h.updateAgreement).toHaveBeenCalledWith('ag-1', 3, { status: 'ended' })
        expect(h.toastSuccess).toHaveBeenCalled()
    })

    it('a version conflict shows one toast and one refetch, with no automatic retry', async () => {
        h.updateAgreement.mockResolvedValue({
            ok: false,
            error: 'version_conflict',
            currentVersion: 7,
            message: 'This record changed. Reload to continue.',
        })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        const before = h.listAgreements.mock.calls.length
        await click(buttons(/End agreement/)[0])
        const dialog = q('[role="dialog"]') as HTMLElement
        await click(Array.from(dialog.querySelectorAll('button')).find((b) => /End agreement/.test(b.textContent || '')) as HTMLButtonElement)

        expect(h.updateAgreement).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('This record changed. Reload to continue.')
        expect(h.listAgreements.mock.calls.length).toBe(before + 1)
        expect(q('[role="dialog"]')).toBeNull()
    })

    it('edit sends exactly the client_name, client_gstin and payment_terms_days keys', async () => {
        h.updateAgreement.mockResolvedValue({ ok: true, state: 'updated', agreement: { ...ACTIVE } })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Edit details/)[0])
        expect((q('input[name="edit-name"]') as HTMLInputElement).value).toBe('Sri Balaji Transport')
        await type(q('input[name="edit-name"]') as HTMLInputElement, 'Sri Balaji Translines')
        await type(q('input[name="edit-gstin"]') as HTMLInputElement, '')
        await type(q('input[name="edit-terms"]') as HTMLInputElement, '45')
        await click(buttons(/Save changes/)[0])

        expect(h.updateAgreement).toHaveBeenCalledTimes(1)
        expect(h.updateAgreement).toHaveBeenCalledWith('ag-1', 3, {
            client_name: 'Sri Balaji Translines',
            client_gstin: null,
            payment_terms_days: 45,
        })
        expect(h.listAgreements).toHaveBeenCalledTimes(2)
    })

    it('deactivating a site confirms by label and sends status inactive', async () => {
        h.updateSite.mockResolvedValue({ ok: true, state: 'updated', site: { ...BILL_SITE, status: 'inactive' } })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Deactivate/)[0])
        const dialog = q('[role="dialog"]') as HTMLElement
        expect(dialog.textContent).toContain('Head office')
        expect(h.updateSite).not.toHaveBeenCalled()
        await click(Array.from(dialog.querySelectorAll('button')).find((b) => /Deactivate$/.test((b.textContent || '').trim())) as HTMLButtonElement)
        expect(h.updateSite).toHaveBeenCalledWith('site-1', 2, { status: 'inactive' })
        expect(h.toastSuccess).toHaveBeenCalled()
        expect(h.listSites).toHaveBeenCalledTimes(2)
    })

    it('add contact sends the typed fields and one idempotency key, then refetches once', async () => {
        h.createContact.mockResolvedValue({ ok: true, state: 'created', contact: { ...CONTACT, id: 'con-2' } })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Contacts/)[0])
        await click(buttons(/Add contact/)[0])
        await type(q('input[name="contact-name"]') as HTMLInputElement, 'Meena Rao')
        await type(q('input[name="contact-phone"]') as HTMLInputElement, '9812345678')
        await type(q('input[name="contact-email"]') as HTMLInputElement, 'meena@balaji.in')
        await type(q('select[name="contact-site"]') as HTMLSelectElement, 'site-1')
        await click(buttons(/Save contact/)[0])

        expect(h.createContact).toHaveBeenCalledTimes(1)
        expect(h.createContact).toHaveBeenCalledWith({
            agreementId: 'ag-1',
            fullName: 'Meena Rao',
            phone: '9812345678',
            email: 'meena@balaji.in',
            siteId: 'site-1',
            idempotencyKey: expect.any(String),
        })
        expect(h.toastSuccess).toHaveBeenCalled()
        expect(h.listContacts).toHaveBeenCalledTimes(2)
    })

    it('deactivating a contact sends status inactive directly', async () => {
        h.updateContact.mockResolvedValue({ ok: true, state: 'updated', contact: { ...CONTACT, status: 'inactive' } })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Contacts/)[0])
        await click(buttons(/Deactivate/)[0])
        expect(h.updateContact).toHaveBeenCalledWith('con-1', 1, { status: 'inactive' })
        expect(h.toastSuccess).toHaveBeenCalled()
        expect(h.listContacts).toHaveBeenCalledTimes(2)
    })

    it('an agreement_not_active refusal surfaces its message', async () => {
        h.updateSite.mockResolvedValue({
            ok: false,
            error: 'agreement_not_active',
            message: 'This client agreement is inactive. Reactivate it to make changes.',
        })
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        await click(buttons(/Deactivate/)[0])
        const dialog = q('[role="dialog"]') as HTMLElement
        await click(Array.from(dialog.querySelectorAll('button')).find((b) => /Deactivate$/.test((b.textContent || '').trim())) as HTMLButtonElement)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('This client agreement is inactive. Reactivate it to make changes.')
        expect(h.listSites).toHaveBeenCalledTimes(2)
    })

    it('Back clears the selection back to the placeholder', async () => {
        await mountPage()
        await selectClient(/Sri Balaji Transport/)
        expect(text()).toContain('Head office')
        await click(buttons(/Back/)[0])
        expect(text()).toContain('Select a client')
        expect(q('[data-testid="clients-list"]')?.textContent).toContain('Sri Balaji Transport')
    })
})
