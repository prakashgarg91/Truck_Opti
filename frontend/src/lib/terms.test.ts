import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TERMS, type TermKey } from './terms'

const here = dirname(fileURLToPath(import.meta.url))
const glossary = readFileSync(resolve(here, '../../../docs/GLOSSARY.md'), 'utf8')

// Words the glossary says not to use as a preferred label.
const BANNED_WORDS = /\b(Truck|Trucks|Staff|Members|Booking|Tariffs|Pack|Orders|Load planning|GRs?|LRs?|Billing)\b/

// The only labels allowed to contain one of the banned words, and why.
const ALLOWED_EXCEPTIONS: Partial<Record<TermKey, RegExp>> = {
  consignmentNote: /GR\/LR/, // document name, once per page
  adminBilling: /Billing/, // platform admin pages only
}

describe('TERMS preferred labels', () => {
  const entries = Object.entries(TERMS) as Array<[TermKey, string]>

  it('has a non-empty, trimmed label for every key', () => {
    expect(entries.length).toBeGreaterThan(0)
    for (const [key, label] of entries) {
      expect(label, key).toBe(label.trim())
      expect(label.length, key).toBeGreaterThan(0)
    }
  })

  it('gives every concept its own label', () => {
    const labels = entries.map(([, label]) => label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('does not use a banned word unless the exception is explained', () => {
    for (const [key, label] of entries) {
      if (!BANNED_WORDS.test(label)) continue
      const exception = ALLOWED_EXCEPTIONS[key]
      expect(exception, `${key} = "${label}" uses a banned word`).toBeDefined()
      expect(exception!.test(label), `${key} = "${label}"`).toBe(true)
    }
  })

  it('keeps the consignment document name exact', () => {
    expect(TERMS.consignment).toBe('Consignment')
    expect(TERMS.consignmentNote).toBe('Consignment note (GR/LR)')
  })

  it('uses the agreed words for the main concepts', () => {
    expect(TERMS.rateCard).toBe('Rate card')
    expect(TERMS.clientTariffs).toBe('Client tariffs')
    expect(TERMS.saleOrder).toBe('Sale order')
    expect(TERMS.orderImport).toBe('Order import')
    expect(TERMS.bookShipment).toBe('Book shipment')
    expect(TERMS.loadPlan).toBe('Load plan')
    expect(TERMS.packing).toBe('Packing')
    expect(TERMS.teamMember).toBe('Team member')
    expect(TERMS.vehicle).toBe('Vehicle')
    expect(TERMS.vehicleType).toBe('Vehicle type')
  })

  it('has every label listed in docs/GLOSSARY.md', () => {
    for (const [key, label] of entries) {
      expect(glossary.includes(label), `${key} = "${label}" missing from GLOSSARY.md`).toBe(true)
    }
  })
})
