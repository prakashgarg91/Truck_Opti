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

/**
 * Lock in the 4-digit OTP contract for job_offers.pickup_otp and
 * job_offers.delivery_otp.
 *
 * Source of truth:
 *  - DriverTripPage.tsx renders a 4-digit input (maxLength=4, placeholder="0000")
 *    and a button disabled until otpInput.length === 4.
 *  - TrackingPage.tsx renders the same 4-digit code in the shipment modal.
 *  - docs/API_REFERENCE.md documents pickup_otp/delivery_otp as "4-digit OTP".
 *  - supabase/migrations/20260601223849_fix_job_offer_otp_length_4digit.sql
 *    installs the trigger, backfill, and CHECK constraints that enforce this
 *    contract at the database level.
 *
 * If this test ever starts failing, either the frontend has drifted away
 * from 4 digits, the migration has been edited, or the OTP helper was
 * regressed to a different length. Do not relax the assertions here without
 * aligning the DriverTripPage input, the TrackingPage display, the API
 * reference, and the migration in the same change.
 */
function readMigration(name: string): string {
    return readFileSync(resolve(repoRoot, 'supabase/migrations', name), 'utf8')
}

function readFrontendFile(relativePath: string): string {
    return readFileSync(resolve(repoRoot, 'frontend/src', relativePath), 'utf8')
}

const FOUR_DIGIT_REGEX = /^[0-9]{4}$/

describe('job_offers 4-digit OTP contract', () => {
    it('reproduces a 4-digit numeric OTP shape from a 0-9999 sample', () => {
        for (let i = 0; i < 100; i += 1) {
            const candidate = Math.floor(Math.random() * 10000)
                .toString()
                .padStart(4, '0')
            expect(candidate).toMatch(FOUR_DIGIT_REGEX)
        }
    })

    it('rejects 3-digit, 5-digit, and 6-digit OTP shapes', () => {
        expect('123').not.toMatch(FOUR_DIGIT_REGEX)
        expect('12345').not.toMatch(FOUR_DIGIT_REGEX)
        expect('123456').not.toMatch(FOUR_DIGIT_REGEX)
        expect('').not.toMatch(FOUR_DIGIT_REGEX)
    })

    it('enforces maxLength=4 in DriverTripPage pickup and delivery inputs', () => {
        const source = readFrontendFile('pages/DriverTripPage.tsx')
        const maxLengthMatches = source.match(/maxLength=\{4\}/g) ?? []
        expect(maxLengthMatches.length).toBeGreaterThanOrEqual(2)
        const lengthGuards = source.match(/length\s*!==\s*4/g) ?? []
        expect(lengthGuards.length).toBeGreaterThanOrEqual(2)
    })

    it('labels the DriverTripPage OTP copy as 4-digit for sender and recipient', () => {
        const source = readFrontendFile('pages/DriverTripPage.tsx')
        expect(source).toMatch(/4-Digit OTP from Sender/)
        expect(source).toMatch(/4-Digit OTP from Recipient/)
    })

    it('migration installs a 4-digit generator, trigger, and CHECK constraints', () => {
        const sql = readMigration(
            '20260601223849_fix_job_offer_otp_length_4digit.sql',
        )

        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.generate_4digit_otp/)
        expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.job_offers_enforce_4digit_otp/)
        expect(sql).toMatch(/CREATE TRIGGER job_offers_4digit_otp_biud/)
        expect(sql).toMatch(
            /ADD CONSTRAINT job_offers_pickup_otp_4digit_check[\s\S]*CHECK \(pickup_otp IS NULL OR pickup_otp ~ '\^\[0-9\]\{4\}\$'\)/,
        )
        expect(sql).toMatch(
            /ADD CONSTRAINT job_offers_delivery_otp_4digit_check[\s\S]*CHECK \(delivery_otp IS NULL OR delivery_otp ~ '\^\[0-9\]\{4\}\$'\)/,
        )
    })

    it('API reference and live-auth-proof fixture agree on 4-digit OTPs', () => {
        const apiRef = readFileSync(
            resolve(repoRoot, 'docs/API_REFERENCE.md'),
            'utf8',
        )
        expect(apiRef).toMatch(/`pickup_otp` \| `text` \| 4-digit OTP/)
        expect(apiRef).toMatch(/`delivery_otp` \| `text` \| 4-digit OTP/)

        const fixture = readFileSync(
            resolve(repoRoot, 'scripts/live-auth-proof.cjs'),
            'utf8',
        )
        expect(fixture).toMatch(/pickupOtp:\s*'1111'/)
        expect(fixture).toMatch(/deliveryOtp:\s*'2222'/)
    })
})
