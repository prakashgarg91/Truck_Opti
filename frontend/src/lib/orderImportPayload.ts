import type { KnownSites, NormalizedLine, ParsedRow } from './orderImport'

/**
 * Pure glue between the CSV parser (orderImport.ts) and the agency_order_import
 * RPC (20261018000000_agency_orders.sql). No React, no network.
 *
 * The RPC resolves site LABELS to site ids on the server, case-insensitively,
 * among the agreement's ACTIVE sites: a pickup may be a bill-to or ship-to site
 * (ship-to preferred), a drop must be a ship-to site. The browser mirrors that
 * rule so the preview agrees with the command, and sends the agreement's own
 * canonical label so the server match never depends on the CSV's casing.
 */

export const MAX_IMPORT_LINES = 2000
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

export interface PickerSite {
  id: string
  site_kind: 'bill_to' | 'ship_to'
  label: string
  status: string
}

/** One element of the RPC's p_lines array (exact keys read by the migration). */
export interface ImportLinePayload {
  client_order_ref: string
  line_no: number
  sku: string
  description: string | null
  quantity: number
  unit: string
  weight_per_unit_kg: number | null
  length_m: number | null
  width_m: number | null
  height_m: number | null
  pickup_site: string
  drop_site: string
  pickup_from: string | null
  pickup_to: string | null
  delivery_from: string | null
  delivery_to: string | null
  stackable: boolean
  fragile: boolean
}

export function buildKnownSites(sites: PickerSite[]): KnownSites {
  const active = sites.filter((s) => s.status === 'active')
  return {
    pickup: active.map((s) => s.label),
    drop: active.filter((s) => s.site_kind === 'ship_to').map((s) => s.label),
  }
}

function canonicalLabel(sites: PickerSite[], wanted: string, shipToOnly: boolean): string {
  const key = wanted.trim().toLowerCase()
  const candidates = sites.filter(
    (s) => s.status === 'active' && s.label.trim().toLowerCase() === key && (!shipToOnly || s.site_kind === 'ship_to')
  )
  return candidates[0]?.label ?? wanted
}

export function toImportLine(line: NormalizedLine, sites: PickerSite[]): ImportLinePayload {
  return {
    client_order_ref: line.clientOrderRef,
    line_no: line.lineNo,
    sku: line.sku,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    weight_per_unit_kg: line.weightPerUnitKg,
    length_m: line.lengthM,
    width_m: line.widthM,
    height_m: line.heightM,
    pickup_site: canonicalLabel(sites, line.pickupSite, false),
    drop_site: canonicalLabel(sites, line.dropSite, true),
    pickup_from: line.pickupFrom,
    pickup_to: line.pickupTo,
    delivery_from: line.deliveryFrom,
    delivery_to: line.deliveryTo,
    stackable: line.stackable,
    fragile: line.fragile,
  }
}

/** Normalized lines of every importable (ready or warning) row, in file order. */
export function buildImportLines(rows: ParsedRow[], sites: PickerSite[]): ImportLinePayload[] {
  const out: ImportLinePayload[] = []
  for (const row of rows) {
    if (row.status !== 'error' && row.line) out.push(toImportLine(row.line, sites))
  }
  return out
}

export type ImportBlocker =
  | 'no_agreement'
  | 'agreement_not_active'
  | 'no_file'
  | 'header_errors'
  | 'no_rows'
  | 'error_rows'
  | 'too_many_lines'
  | 'submitting'

/** First reason the Import button must stay disabled, or null when it may run. */
export function importBlocker(input: {
  agreementActive: boolean | null
  hasFile: boolean
  headerErrorCount: number
  rowCount: number
  errorCount: number
  lineCount: number
  submitting: boolean
}): ImportBlocker | null {
  if (input.submitting) return 'submitting'
  if (input.agreementActive === null) return 'no_agreement'
  if (!input.agreementActive) return 'agreement_not_active'
  if (!input.hasFile) return 'no_file'
  if (input.headerErrorCount > 0) return 'header_errors'
  if (input.rowCount === 0) return 'no_rows'
  if (input.errorCount > 0) return 'error_rows'
  if (input.lineCount > MAX_IMPORT_LINES) return 'too_many_lines'
  return null
}

export const BLOCKER_MESSAGES: Readonly<Record<ImportBlocker, string>> = Object.freeze({
  no_agreement: 'Choose a client agreement first.',
  agreement_not_active: 'This client agreement is not active. Reactivate it before importing orders.',
  no_file: 'Choose a CSV file to preview.',
  header_errors: 'Fix the missing columns in the file, then upload it again.',
  no_rows: 'The file has no order rows.',
  error_rows: 'Fix the rows marked Error, then upload the file again.',
  too_many_lines: `A single import can hold at most ${MAX_IMPORT_LINES} lines. Split the file and import it in parts.`,
  submitting: 'Importing…',
})
