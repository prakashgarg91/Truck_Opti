import { describe, expect, it } from 'vitest'
import { ORDER_CSV_TEMPLATE, parseOrderCsv } from './orderImport'
import {
  BLOCKER_MESSAGES,
  buildImportLines,
  buildKnownSites,
  importBlocker,
  type PickerSite,
} from './orderImportPayload'

const SITES: PickerSite[] = [
  { id: 'b', site_kind: 'bill_to', label: 'Head Office', status: 'active' },
  { id: 'p', site_kind: 'ship_to', label: 'central warehouse', status: 'active' },
  { id: 'd1', site_kind: 'ship_to', label: 'Retail Park North', status: 'active' },
  { id: 'd2', site_kind: 'ship_to', label: 'Mall Exit 4', status: 'active' },
  { id: 'x', site_kind: 'ship_to', label: 'Closed Yard', status: 'inactive' },
]

describe('buildKnownSites', () => {
  it('pickup allows active bill-to and ship-to; drop only active ship-to', () => {
    const known = buildKnownSites(SITES)
    expect(known.pickup).toContain('Head Office')
    expect(known.drop).not.toContain('Head Office')
    expect(known.pickup).not.toContain('Closed Yard')
    expect(known.drop).not.toContain('Closed Yard')
  })
})

describe('buildImportLines', () => {
  const parsed = parseOrderCsv(ORDER_CSV_TEMPLATE, buildKnownSites(SITES))

  it('parses the template cleanly against the client sites', () => {
    expect(parsed.summary.errors).toBe(0)
  })

  it('maps normalized lines to the exact RPC keys with canonical site labels', () => {
    const lines = buildImportLines(parsed.rows, SITES)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      client_order_ref: 'SO-2001',
      line_no: 1,
      sku: 'SKU-STEEL-ROD',
      description: 'Steel rod 12mm',
      quantity: 40,
      unit: 'kg',
      weight_per_unit_kg: 1,
      length_m: 1.2,
      width_m: null,
      height_m: null,
      pickup_site: 'central warehouse',
      drop_site: 'Retail Park North',
      pickup_from: '2026-11-12',
      pickup_to: '2026-11-13',
      delivery_from: '2026-11-14',
      delivery_to: '2026-11-15',
      stackable: true,
      fragile: false,
    })
    expect(lines[1].fragile).toBe(true)
    expect(lines[1].weight_per_unit_kg).toBe(4.5)
  })

  it('skips error rows', () => {
    const bad = parseOrderCsv(`${ORDER_CSV_TEMPLATE}\nSO-3,1,S,,1,kg,,,,,,,Nowhere,Mall Exit 4,,,,,,`, buildKnownSites(SITES))
    expect(bad.summary.errors).toBe(1)
    expect(buildImportLines(bad.rows, SITES)).toHaveLength(2)
  })
})

describe('importBlocker', () => {
  const ok = { agreementActive: true, hasFile: true, headerErrorCount: 0, rowCount: 3, errorCount: 0, lineCount: 3, submitting: false }

  it('allows a clean file', () => {
    expect(importBlocker(ok)).toBeNull()
  })

  it.each([
    [{ submitting: true }, 'submitting'],
    [{ agreementActive: null }, 'no_agreement'],
    [{ agreementActive: false }, 'agreement_not_active'],
    [{ hasFile: false }, 'no_file'],
    [{ headerErrorCount: 1 }, 'header_errors'],
    [{ rowCount: 0, lineCount: 0 }, 'no_rows'],
    [{ errorCount: 1 }, 'error_rows'],
    [{ lineCount: 2001 }, 'too_many_lines'],
  ])('blocks on %j', (patch, expected) => {
    const blocker = importBlocker({ ...ok, ...patch })
    expect(blocker).toBe(expected)
    expect(BLOCKER_MESSAGES[blocker!]).toBeTruthy()
  })
})
