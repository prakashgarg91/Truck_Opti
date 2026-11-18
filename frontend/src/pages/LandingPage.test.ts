import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import LandingPage from './LandingPage'

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(LandingPage)))
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
    document.title = ''
})

const text = () => (container as HTMLElement).textContent || ''
const links = () => Array.from((container as HTMLElement).querySelectorAll('a'))
const linksWithText = (re: RegExp) => links().filter((a) => re.test((a.textContent || '').trim()))

describe('LandingPage', () => {
    it('sets a page title so the public home page is not untitled', async () => {
        await mountPage()
        expect(document.title).toBe('TruckOpti - Smart Logistics')
    })

    it('sends every agency call-to-action to agency registration', async () => {
        await mountPage()
        const trial = linksWithText(/Start your free agency trial/)
        expect(trial.length).toBeGreaterThanOrEqual(2) // hero and closing banner
        for (const a of trial) expect(a.getAttribute('href')).toBe('/agency/register')

        const agencies = linksWithText(/^Agencies$/)
        // desktop header, mobile nav and footer
        expect(agencies.length).toBeGreaterThanOrEqual(3)
        for (const a of agencies) expect(a.getAttribute('href')).toBe('/agency/register')
    })

    it('has no "Start Free" call-to-action that sends agencies-only trials to customer sign-up', async () => {
        await mountPage()
        expect(text()).not.toContain('Start Free')
    })

    it('shows the mobile navigation with the agency and pricing links', async () => {
        await mountPage()
        const mobileNav = (container as HTMLElement).querySelector('nav[aria-label="Mobile"]')
        expect(mobileNav).not.toBeNull()
        const labels = Array.from(mobileNav!.querySelectorAll('a')).map((a) => (a.textContent || '').trim())
        expect(labels).toEqual(['Features', 'How It Works', 'Drivers', 'Agencies', 'Pricing'])
    })

    it('every in-page anchor has a matching target', async () => {
        await mountPage()
        for (const a of links()) {
            const href = a.getAttribute('href') || ''
            expect(href).not.toBe('#')
            if (href.startsWith('#')) {
                expect((container as HTMLElement).querySelector(href)).not.toBeNull()
            }
        }
    })

    it('removes claims that the product does not back up', async () => {
        await mountPage()
        const body = text()
        expect(body).not.toMatch(/AI-powered|AI-optimized/)
        expect(body).not.toContain('Toll-aware')
        expect(body).not.toContain('Rate-aware')
        expect(body).not.toContain('Operational Gains')
        expect(body).not.toContain('Book your first truck in minutes')
        expect(body).not.toContain('Takes under 2 minutes')
    })

    it('the how-it-works step describes the real sign-up path', async () => {
        await mountPage()
        expect(text()).toContain('Create a login, then register your agency or driver profile.')
    })
})
