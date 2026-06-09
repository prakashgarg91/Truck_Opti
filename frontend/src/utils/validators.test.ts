import { describe, expect, it } from 'vitest'

import { loginPasswordSchema, passwordSchema } from './validators'

describe('password validators', () => {
    it('allows existing passwords at login without enforcing signup composition rules', () => {
        expect(loginPasswordSchema.safeParse('abc1234').success).toBe(true)
        expect(passwordSchema.safeParse('abc1234').success).toBe(false)
    })

    it('still rejects empty login passwords', () => {
        expect(loginPasswordSchema.safeParse('').success).toBe(false)
    })

    it('keeps signup and reset passwords strict', () => {
        expect(passwordSchema.safeParse('Password123').success).toBe(true)
    })
})