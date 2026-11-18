import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as support from './support'

// Owner decision (docs/FABLE-RULINGS-2026-11-18-C.md §3): support is EMAIL ONLY.
// The platform support phone number must not come back in any visitor-facing
// surface. These tests fail if it does.
const FORBIDDEN_DIGITS = ['99993', '9999352050']
const here = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(here, '..', '..')

function listFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === 'graphify-out' || name === 'node_modules') continue
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
            listFiles(full, out)
        } else {
            out.push(full)
        }
    }
    return out
}

describe('support config', () => {
    it('exports the support email and no phone number', () => {
        expect(support.SUPPORT_EMAIL).toBe('prakashgarg91@gmail.com')
        const phoneExports = Object.keys(support).filter((key) => /PHONE|TEL/i.test(key))
        expect(phoneExports).toEqual([])
    })

    it('no shipped source, page or public asset contains the support phone digits', () => {
        const roots = [join(frontendRoot, 'src'), join(frontendRoot, 'public')]
        const files = roots.filter((r) => existsSync(r)).flatMap((r) => listFiles(r))
        if (existsSync(join(frontendRoot, 'index.html'))) files.push(join(frontendRoot, 'index.html'))

        const offenders: string[] = []
        for (const file of files) {
            const ext = extname(file)
            if (!['.ts', '.tsx', '.js', '.jsx', '.html', '.json', '.md', '.txt', '.xml'].includes(ext)) continue
            // Test files may name the forbidden digits; they are the guard itself.
            if (/\.test\.[tj]sx?$/.test(file)) continue
            const text = readFileSync(file, 'utf8')
            if (FORBIDDEN_DIGITS.some((digits) => text.includes(digits))) offenders.push(file)
        }
        expect(offenders).toEqual([])
    })
})
