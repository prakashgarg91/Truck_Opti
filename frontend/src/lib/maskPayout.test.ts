import { describe, expect, it } from 'vitest'
import { maskBankAccount, maskUpi } from './maskPayout'

describe('maskPayout', () => {
    it('keeps only the last four digits of a bank account', () => {
        expect(maskBankAccount('123456784321')).toBe('****4321')
        expect(maskBankAccount('1234 5678 4321')).toBe('****4321')
        expect(maskBankAccount('12')).toBe('****')
        expect(maskBankAccount('')).toBe('')
        expect(maskBankAccount(null)).toBe('')
    })

    it('keeps the first two characters and the handle of a UPI id', () => {
        expect(maskUpi('ravikumar@okbank')).toBe('ra***@okbank')
        expect(maskUpi('r@upi')).toBe('r***@upi')
        expect(maskUpi('9999999999')).toBe('99***')
        expect(maskUpi('')).toBe('')
        expect(maskUpi(undefined)).toBe('')
    })
})
