import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function findRepoRoot(start: string): string {
    let current = start
    for (let i = 0; i < 8; i += 1) {
        if (
            existsSync(resolve(current, 'supabase/migrations')) &&
            existsSync(resolve(current, 'frontend/src')) &&
            existsSync(resolve(current, 'docs/API_REFERENCE.md'))
        ) {
            return current
        }
        const parent = dirname(current)
        if (parent === current) break
        current = parent
    }
    throw new Error('Could not locate Truck_Opti repo root from ' + start)
}

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = findRepoRoot(here)

function readFrontendFile(relativePath: string): string {
    return readFileSync(resolve(repoRoot, 'frontend/src', relativePath), 'utf8')
}

/**
 * WCAG 2.x relative luminance and contrast ratio over sRGB hex values.
 * Mirrors the WCAG 2.1 definition: linearize each channel, weight by
 * 0.2126/0.7152/0.0722, and ratio = (L1+0.05)/(L2+0.05).
 */
function luminance(hex: string): number {
    const channels = [1, 3, 5].map((offset) => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
        return value <= 0.03928
            ? value / 12.92
            : Math.pow((value + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: string, background: string): number {
    const l1 = luminance(foreground)
    const l2 = luminance(background)
    const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1]
    return (lighter + 0.05) / (darker + 0.05)
}

// Tailwind v3 palette values used by the fixed surfaces.
const WHITE = '#ffffff'
const SLATE_50 = '#f8fafc'
const SLATE_800 = '#1e293b'
// dark:bg-slate-700/50 over dark:bg-slate-800 (AgencyJobsPage authorization row):
// 0.5 * #334155 + 0.5 * #1e293b.
const SLATE_700_50_OVER_SLATE_800 = '#293548'
const GREEN_600 = '#16a34a'
const GREEN_700 = '#15803d'
const GREEN_400 = '#4ade80'
const SLATE_400 = '#94a3b8'
const SLATE_600 = '#475569'

const AA_NORMAL_TEXT = 4.5

/**
 * TO-143-D1 follow-up (backlog `wcag-aa-contrast-fixes-shipment-agency-jobs`):
 * three light-mode contrast failures on the TO-143-D1 command/consent panels,
 * recomputed and repaired together —
 *   1. NewShipmentPage authorization success copy: green-600 on white 3.30:1 → green-700.
 *   2. AgencyJobsPage authorizations empty state: slate-400 on white 2.56:1 → slate-600.
 *   3. AgencyJobsPage grant date: slate-400 on the bg-slate-50 row 2.45:1 → slate-600.
 * This contract locks the tokens (light and dark variants) and the WCAG math
 * behind them, so the classes cannot silently regress to the failing tokens.
 */
describe('WCAG AA contrast contract for the shipment/agency-jobs command panels', () => {
    it('reproduces the three recorded pre-fix failures as below-AA ratios', () => {
        expect(contrastRatio(GREEN_600, WHITE)).toBeCloseTo(3.30, 1)
        expect(contrastRatio(GREEN_600, WHITE)).toBeLessThan(AA_NORMAL_TEXT)
        expect(contrastRatio(SLATE_400, WHITE)).toBeCloseTo(2.56, 1)
        expect(contrastRatio(SLATE_400, WHITE)).toBeLessThan(AA_NORMAL_TEXT)
        expect(contrastRatio(SLATE_400, SLATE_50)).toBeCloseTo(2.45, 1)
        expect(contrastRatio(SLATE_400, SLATE_50)).toBeLessThan(AA_NORMAL_TEXT)
    })

    it('the repaired light-mode pairs meet AA 4.5:1', () => {
        expect(contrastRatio(GREEN_700, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        expect(contrastRatio(SLATE_600, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        expect(contrastRatio(SLATE_600, SLATE_50)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })

    it('the preserved dark: variants remain AA on their dark surfaces', () => {
        // dark:text-green-400 on dark:bg-slate-800 (NewShipmentPage panel).
        expect(contrastRatio(GREEN_400, SLATE_800)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        // dark:text-slate-400 on dark:bg-slate-800 (AgencyJobsPage card).
        expect(contrastRatio(SLATE_400, SLATE_800)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
        // dark:text-slate-400 on dark:bg-slate-700/50 (AgencyJobsPage row).
        expect(contrastRatio(SLATE_400, SLATE_700_50_OVER_SLATE_800)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    })

    it('NewShipmentPage success copy uses green-700 and keeps the dark variant', () => {
        const source = readFrontendFile('pages/NewShipmentPage.tsx')
        expect(source).toContain("'text-green-700 dark:text-green-400'")
        // The failing light-mode token must be gone from the page entirely
        // (boundary-guarded so a dark:text-green-600 tail can never satisfy it).
        expect(source).not.toMatch(/(^|[\s"'])text-green-600(?![\w-])/)
    })

    it('AgencyJobsPage empty state and grant date use slate-600 with dark variants kept', () => {
        const source = readFrontendFile('pages/AgencyJobsPage.tsx')
        // Empty state (white card): the old bare text-slate-400 mt-3 is replaced.
        expect(source).toContain('text-xs text-slate-600 dark:text-slate-400 mt-3')
        // Bare (non-dark-prefixed) failing token must be gone from this spot —
        // the boundary guard keeps the preserved dark:text-slate-400 legal.
        expect(source).not.toMatch(/(^|[\s"'])text-slate-400 mt-3/)
        // Grant date row (bg-slate-50): anchored to its "Authorized" copy so the
        // assertion survives line-number drift.
        expect(source).toMatch(
            /text-xs text-slate-600 dark:text-slate-400">\s*\n\s*Authorized \{/
        )
    })
})
