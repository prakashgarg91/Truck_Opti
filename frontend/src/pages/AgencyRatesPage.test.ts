import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pin for the legacy agency rate-cards page (AgencyRatesPage over
// agencyRatesApi): the five load states, the full add-form contract (labels,
// validation, exact addRate payload, saving state, reset), the toggle and
// delete commands with their toasts, and the per-card delete aria-labels.
// The page prepends locally after add and never refetches — pinned as-is.

const h = vi.hoisted(() => ({
    list: vi.fn(),
    addRate: vi.fn(),
    updateRate: vi.fn(),
    deleteRate: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    loggerError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../utils/logger', () => ({
    logger: { error: h.loggerError, log: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('../services/agencyPortalApi', () => ({
    agencyRatesApi: {
        list: h.list,
        addRate: h.addRate,
        updateRate: h.updateRate,
        deleteRate: h.deleteRate,
    },
}))

import AgencyRatesPage from './AgencyRatesPage'

const RATE_ACTIVE = {
    id: 'rate-1',
    agency_id: 'agency-1',
    vehicle_type: 'eicher_14ft',
    origin_city: 'Mumbai',
    dest_city: 'Pune',
    rate_per_km: 25,
    flat_rate: 12980,
    min_weight_kg: 1000,
    max_weight_kg: 3000,
    is_active: true,
    valid_from: '2026-01-01',
    valid_until: '2027-03-15',
    notes: 'Includes tolls',
}

const RATE_INACTIVE = {
    id: 'rate-2',
    agency_id: 'agency-1',
    vehicle_type: 'custom_truck',
    origin_city: 'Delhi',
    dest_city: 'Jaipur',
    rate_per_km: null,
    flat_rate: 8000,
    min_weight_kg: null,
    max_weight_kg: 5000,
    is_active: false,
    valid_from: null,
    valid_until: null,
    notes: null,
}

const NEW_RATE = {
    id: 'rate-new',
    agency_id: 'agency-1',
    vehicle_type: 'tata_407',
    origin_city: 'Surat',
    dest_city: 'Vadodara',
    rate_per_km: 18,
    flat_rate: null,
    min_weight_kg: null,
    max_weight_kg: null,
    is_active: true,
    valid_from: null,
    valid_until: null,
    notes: null,
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, null, createElement(AgencyRatesPage)))
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
    // Tests that pin the clock or stub confirm must not leak either.
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

// Rate cards render as div.rounded-2xl.p-4; the add form is the p-5 panel.
const cards = () => Array.from((container as HTMLElement).querySelectorAll('div.rounded-2xl.p-4'))
const form = () => q('div.rounded-2xl.p-5') as HTMLElement | null

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

// The form's labels are unlinked siblings of their controls, so resolve a
// field by its exact label text and take the next element.
function field(labelRe: RegExp): HTMLInputElement | HTMLSelectElement | null {
    const labels = Array.from((form() as HTMLElement)?.querySelectorAll('label') || [])
    const found = labels.find((l) => labelRe.test((l.textContent || '').trim()))
    return (found?.nextElementSibling as HTMLInputElement | HTMLSelectElement | null) ?? null
}

function submitButton(): HTMLButtonElement {
    return Array.from((form() as HTMLElement).querySelectorAll('button')).find((b) =>
        /Add Rate|Adding/.test(b.textContent || '')
    ) as HTMLButtonElement
}

// The card action row is [toggle, delete]; only delete carries an aria-label.
function toggleOf(card: Element): HTMLButtonElement {
    return card.querySelector('button:not([aria-label])') as HTMLButtonElement
}

function deleteOf(card: Element): HTMLButtonElement {
    return card.querySelector('button[aria-label]') as HTMLButtonElement
}

async function openForm() {
    await click(buttons(/Add Rate/)[0])
    expect(form()).not.toBeNull()
}

describe('AgencyRatesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.list.mockResolvedValue([RATE_ACTIVE, RATE_INACTIVE])
        h.addRate.mockResolvedValue(NEW_RATE)
        h.updateRate.mockResolvedValue(undefined)
        h.deleteRate.mockResolvedValue(undefined)
    })

    it('shows only the spinner while the list is pending', async () => {
        h.list.mockReturnValue(new Promise(() => {}))
        await mountPage()

        expect(q('.animate-spin')).not.toBeNull()
        expect(text()).not.toContain('Rate Cards')
        expect(q('button')).toBeNull()
    })

    it('sets the document title on mount', async () => {
        await mountPage()
        expect(document.title).toBe('Rate Cards - TruckOpti')
    })

    it('renders the empty state when no rate cards exist', async () => {
        h.list.mockResolvedValue([])
        await mountPage()

        expect(text()).toContain('No rate cards yet')
        expect(text()).toContain('Add rate cards to let customers see your freight pricing.')
        expect(text()).toContain('0 active rates')
        expect(cards()).toHaveLength(0)
    })

    it('a failed load toasts, logs once and falls through to the empty list', async () => {
        h.list.mockRejectedValueOnce(new Error('network down'))
        await mountPage()

        expect(h.list).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load rate cards')
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(h.loggerError.mock.calls[0][0]).toBe('[AgencyRatesPage]')
        // No error banner or Retry exists: loading ends and the empty list shows.
        expect(text()).toContain('Rate Cards')
        expect(text()).toContain('No rate cards yet')
    })

    it('an active card renders route, vehicle label, both rate chips, weight range, validity and notes', async () => {
        // Pin the clock while date-bearing content renders (hygiene for the
        // valid_until line); shouldAdvanceTime keeps act's timers firing.
        vi.useFakeTimers({ now: Date.parse('2026-11-06T00:00:00Z'), shouldAdvanceTime: true })
        await mountPage()

        const card = cards()[0]
        expect(card.textContent).toContain('Mumbai → Pune')
        expect(card.textContent).toContain('Eicher 14ft (3T)')
        expect(card.textContent).toContain('₹25/km')
        expect(card.textContent).toContain('₹12,980 flat')
        expect(card.textContent).toContain('1000–3000 kg')
        expect(card.textContent).toContain('Valid until 15 Mar 2027')
        expect(card.textContent).toContain('Includes tolls')
        expect(card.className).not.toContain('opacity-60')
        expect(text()).toContain('1 active rates')
    })

    it('an inactive card dims, falls back to the raw vehicle code and defaults min weight to 0', async () => {
        await mountPage()

        const card = cards()[1]
        expect(card.textContent).toContain('Delhi → Jaipur')
        expect(card.textContent).toContain('custom_truck')
        expect(card.textContent).toContain('₹8,000 flat')
        expect(card.textContent).not.toContain('/km')
        expect(card.textContent).toContain('0–5000 kg')
        expect(card.textContent).not.toContain('Valid until')
        expect(card.className).toContain('opacity-60')
        // One of two cards is active.
        expect(text()).toContain('1 active rates')
    })

    it('Add Rate opens a form with nine labelled fields and the six vehicle types', async () => {
        await mountPage()
        await openForm()

        const expected: Array<[RegExp, string]> = [
            [/^Vehicle Type$/, 'SELECT'],
            [/^Origin City \*$/, 'INPUT'],
            [/^Destination \*$/, 'INPUT'],
            [/^Rate per km \(₹\)$/, 'INPUT'],
            [/^Flat Rate \(₹\)$/, 'INPUT'],
            [/^Min Weight \(kg\)$/, 'INPUT'],
            [/^Max Weight \(kg\)$/, 'INPUT'],
            [/^Valid Until$/, 'INPUT'],
            [/^Notes \(optional\)$/, 'INPUT'],
        ]
        for (const [labelRe, tag] of expected) {
            const control = field(labelRe)
            expect(control, `field for ${labelRe}`).not.toBeNull()
            expect(control?.tagName).toBe(tag)
        }

        const select = field(/^Vehicle Type$/) as HTMLSelectElement
        expect(Array.from(select.options).map((o) => o.value)).toEqual([
            'tata_407', 'eicher_14ft', 'eicher_17ft', 'ashok_19ft', 'bharatbenz_24ft', 'bharatbenz_32ft',
        ])
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
            'Tata 407 (1T)', 'Eicher 14ft (3T)', 'Eicher 17ft (5T)', 'Ashok Leyland 19ft (7T)',
            'BharatBenz 24ft (10T)', 'BharatBenz 32ft (15T)',
        ])
        expect(select.value).toBe('eicher_14ft')
    })

    it('Cancel closes the form and resets what was typed', async () => {
        await mountPage()
        await openForm()
        await type(field(/^Origin City \*$/) as HTMLInputElement, 'Nagpur')

        await click(Array.from((form() as HTMLElement).querySelectorAll('button')).find((b) =>
            b.textContent === 'Cancel'
        ) as HTMLButtonElement)
        expect(form()).toBeNull()

        await openForm()
        expect((field(/^Origin City \*$/) as HTMLInputElement).value).toBe('')
    })

    it('submitting without cities is rejected before addRate is called', async () => {
        await mountPage()
        await openForm()

        await click(submitButton())
        expect(h.toastError).toHaveBeenCalledWith('Origin and destination city are required')
        expect(h.addRate).not.toHaveBeenCalled()
        expect(form()).not.toBeNull()
    })

    it('submitting cities without either rate is rejected before addRate is called', async () => {
        await mountPage()
        await openForm()
        await type(field(/^Origin City \*$/) as HTMLInputElement, 'Mumbai')
        await type(field(/^Destination \*$/) as HTMLInputElement, 'Pune')

        await click(submitButton())
        expect(h.toastError).toHaveBeenCalledWith('Enter either rate per km or a flat rate')
        expect(h.addRate).not.toHaveBeenCalled()
    })

    it('a full form sends the exact trimmed, parsed payload and prepends the new card without refetching', async () => {
        await mountPage()
        await openForm()
        await type(field(/^Vehicle Type$/) as HTMLSelectElement, 'tata_407')
        await type(field(/^Origin City \*$/) as HTMLInputElement, '  Mumbai  ')
        await type(field(/^Destination \*$/) as HTMLInputElement, 'Pune')
        await type(field(/^Rate per km \(₹\)$/) as HTMLInputElement, '25')
        await type(field(/^Min Weight \(kg\)$/) as HTMLInputElement, '500')
        await type(field(/^Max Weight \(kg\)$/) as HTMLInputElement, '3000')
        await type(field(/^Valid Until$/) as HTMLInputElement, '2027-03-15')
        await type(field(/^Notes \(optional\)$/) as HTMLInputElement, 'Includes tolls')

        await click(submitButton())

        expect(h.addRate).toHaveBeenCalledTimes(1)
        expect(h.addRate.mock.calls[0][0]).toEqual({
            vehicle_type: 'tata_407',
            origin_city: 'Mumbai',
            dest_city: 'Pune',
            rate_per_km: 25,
            min_weight_kg: 500,
            max_weight_kg: 3000,
            valid_until: '2027-03-15',
            notes: 'Includes tolls',
        })
        // Blank optional fields are sent as undefined, not ''.
        expect(h.addRate.mock.calls[0][0].flat_rate).toBeUndefined()
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate card added!')
        // The returned card is prepended locally; the list is not refetched.
        expect(cards()).toHaveLength(3)
        expect(cards()[0].textContent).toContain('Surat → Vadodara')
        expect(h.list).toHaveBeenCalledTimes(1)
        // The form closes and resets.
        expect(form()).toBeNull()
        await openForm()
        expect((field(/^Origin City \*$/) as HTMLInputElement).value).toBe('')
    })

    it('a flat-rate-only form parses flat_rate and leaves rate_per_km undefined', async () => {
        await mountPage()
        await openForm()
        await type(field(/^Origin City \*$/) as HTMLInputElement, 'Chennai')
        await type(field(/^Destination \*$/) as HTMLInputElement, 'Bengaluru')
        await type(field(/^Flat Rate \(₹\)$/) as HTMLInputElement, '8000')

        await click(submitButton())

        expect(h.addRate).toHaveBeenCalledTimes(1)
        expect(h.addRate.mock.calls[0][0]).toEqual({
            vehicle_type: 'eicher_14ft',
            origin_city: 'Chennai',
            dest_city: 'Bengaluru',
            flat_rate: 8000,
        })
        expect(h.addRate.mock.calls[0][0].rate_per_km).toBeUndefined()
    })

    it('the submit button shows Adding... and is disabled while the add is pending', async () => {
        let release!: (value: unknown) => void
        h.addRate.mockReturnValue(new Promise((resolve) => { release = resolve }))
        await mountPage()
        await openForm()
        await type(field(/^Origin City \*$/) as HTMLInputElement, 'Mumbai')
        await type(field(/^Destination \*$/) as HTMLInputElement, 'Pune')
        await type(field(/^Rate per km \(₹\)$/) as HTMLInputElement, '25')

        await click(submitButton())
        const busy = submitButton()
        expect(busy.textContent).toBe('Adding...')
        expect(busy.disabled).toBe(true)

        await act(async () => {
            release(NEW_RATE)
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate card added!')
        expect(form()).toBeNull()
    })

    it('a failed add toasts, keeps the form open and its data, and re-enables submit', async () => {
        h.addRate.mockRejectedValueOnce(new Error('save failed'))
        await mountPage()
        await openForm()
        await type(field(/^Origin City \*$/) as HTMLInputElement, 'Mumbai')
        await type(field(/^Destination \*$/) as HTMLInputElement, 'Pune')
        await type(field(/^Rate per km \(₹\)$/) as HTMLInputElement, '25')

        await click(submitButton())

        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to add rate card')
        expect(h.loggerError.mock.calls[0][0]).toBe('[AgencyRatesPage] handleAdd failed:')
        expect(cards()).toHaveLength(2)
        expect(form()).not.toBeNull()
        expect((field(/^Origin City \*$/) as HTMLInputElement).value).toBe('Mumbai')
        const retry = submitButton()
        expect(retry.textContent).toBe('Add Rate')
        expect(retry.disabled).toBe(false)
    })

    it('the toggle deactivates via updateRate, dims the card and updates the active count', async () => {
        await mountPage()

        await click(toggleOf(cards()[0]))

        expect(h.updateRate).toHaveBeenCalledTimes(1)
        expect(h.updateRate).toHaveBeenCalledWith('rate-1', { is_active: false })
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate deactivated')
        expect(cards()[0].className).toContain('opacity-60')
        expect(text()).toContain('0 active rates')
    })

    it('the toggle reactivates an inactive card', async () => {
        await mountPage()

        await click(toggleOf(cards()[1]))

        expect(h.updateRate).toHaveBeenCalledWith('rate-2', { is_active: true })
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate activated')
        expect(cards()[1].className).not.toContain('opacity-60')
        expect(text()).toContain('2 active rates')
    })

    it('a failed toggle toasts and leaves the card state untouched', async () => {
        h.updateRate.mockRejectedValueOnce(new Error('conflict'))
        await mountPage()

        await click(toggleOf(cards()[0]))

        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to update')
        expect(h.loggerError.mock.calls[0][0]).toBe('[AgencyRatesPage] handleToggleActive failed:')
        expect(cards()[0].className).not.toContain('opacity-60')
        expect(text()).toContain('1 active rates')
    })

    it('declining the confirm leaves the card and never calls deleteRate', async () => {
        const confirmMock = vi.fn(() => false)
        vi.stubGlobal('confirm', confirmMock)
        await mountPage()

        await click(deleteOf(cards()[0]))

        expect(confirmMock).toHaveBeenCalledWith('Delete this rate card?')
        expect(h.deleteRate).not.toHaveBeenCalled()
        expect(h.toastSuccess).not.toHaveBeenCalled()
        expect(cards()).toHaveLength(2)
    })

    it('confirming the delete removes the card and toasts', async () => {
        const confirmMock = vi.fn(() => true)
        vi.stubGlobal('confirm', confirmMock)
        await mountPage()

        await click(deleteOf(cards()[0]))

        expect(h.deleteRate).toHaveBeenCalledTimes(1)
        expect(h.deleteRate).toHaveBeenCalledWith('rate-1')
        expect(h.toastSuccess).toHaveBeenCalledWith('Rate card deleted')
        expect(cards()).toHaveLength(1)
        expect(cards()[0].textContent).toContain('Delhi → Jaipur')
        expect(text()).toContain('0 active rates')
    })

    it('a failed delete toasts and keeps the card', async () => {
        vi.stubGlobal('confirm', vi.fn(() => true))
        h.deleteRate.mockRejectedValueOnce(new Error('boom'))
        await mountPage()

        await click(deleteOf(cards()[0]))

        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to delete')
        expect(h.loggerError.mock.calls[0][0]).toBe('[AgencyRatesPage] handleDelete failed:')
        expect(cards()).toHaveLength(2)
    })

    it('each delete button exposes its per-route aria-label', async () => {
        await mountPage()

        expect(cards()[0].querySelector('button[aria-label="Delete rate Mumbai to Pune"]')).not.toBeNull()
        expect(cards()[1].querySelector('button[aria-label="Delete rate Delhi to Jaipur"]')).not.toBeNull()
    })
})
