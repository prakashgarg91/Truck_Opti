import { describe, expect, it } from 'vitest'
import { formatInr, parseQuantity, rupeesToPaise, STATE_CODE_PATTERN } from './invoiceMoney'

describe('formatInr', () => {
  it.each([
    [0, '₹0.00'],
    [5, '₹0.05'],
    [99999, '₹999.99'],
    [100000, '₹1,000.00'],
    [12345678, '₹1,23,456.78'],
    [123456789, '₹12,34,567.89'],
    [1000000000, '₹1,00,00,000.00'],
    [-250, '-₹2.50'],
  ])('formats %i paise', (paise, expected) => {
    expect(formatInr(paise)).toBe(expected)
  })
})

describe('rupeesToPaise', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['1.5', 150],
    ['1.05', 105],
    ['0.1', 10],
    ['19.99', 1999],
    ['1,234.50', 123450],
    ['  12 ', 1200],
    ['4.35', 435],
    ['1.15', 115],
  ])('converts %s exactly', (text, paise) => {
    expect(rupeesToPaise(text)).toBe(paise)
  })

  it.each(['', 'abc', '-1', '1.234', '1.', '.5', '1e3', '1,2,3x'])('rejects %j', (text) => {
    expect(rupeesToPaise(text)).toBeNull()
  })
})

describe('parseQuantity', () => {
  it('accepts up to three decimals and rejects zero or garbage', () => {
    expect(parseQuantity('2.5')).toBe(2.5)
    expect(parseQuantity('0.001')).toBe(0.001)
    expect(parseQuantity('0')).toBeNull()
    expect(parseQuantity('1.2345')).toBeNull()
    expect(parseQuantity('-1')).toBeNull()
    expect(parseQuantity('')).toBeNull()
  })
})

describe('STATE_CODE_PATTERN', () => {
  it('accepts 01 to 38 only', () => {
    expect(STATE_CODE_PATTERN.test('07')).toBe(true)
    expect(STATE_CODE_PATTERN.test('38')).toBe(true)
    expect(STATE_CODE_PATTERN.test('00')).toBe(false)
    expect(STATE_CODE_PATTERN.test('39')).toBe(false)
    expect(STATE_CODE_PATTERN.test('7')).toBe(false)
  })
})
