/**
 * Pure sales-order CSV parsing for the Order Import screen (TO-145).
 *
 * Turns the raw text of a client sales-order CSV into validated, normalized
 * rows tagged ready / warning / error with exact user-facing messages. The
 * module is dependency-free on purpose: no React, no network, no Supabase.
 * The caller supplies the chosen client's known site labels and consumes the
 * rows; nothing here touches storage or execution.
 *
 * CSV handling follows RFC 4180 (quoted fields, doubled quotes, commas and
 * newlines inside quotes), accepts CRLF and LF, strips a UTF-8 BOM, ignores
 * completely empty lines while keeping row numbering true to the file, and
 * trims cells. Cells that start with = + - @ are returned unchanged by the
 * parser; `orderRowsToCsv` prefixes them with a single quote on export so a
 * spreadsheet cannot execute them (CSV injection guard).
 */

export type OrderUnit = 'kg' | 'tonne' | 'piece' | 'carton'

/** Site LABELS of the chosen client, matched case-insensitively after trimming. */
export interface KnownSites {
  pickup: string[]
  drop: string[]
}

export interface NormalizedLine {
  clientOrderRef: string
  lineNo: number
  sku: string
  description: string | null
  quantity: number
  unit: OrderUnit
  weightPerUnitKg: number | null
  lengthM: number | null
  widthM: number | null
  heightM: number | null
  pickupSite: string
  dropSite: string
  /** Dates as ISO strings (YYYY-MM-DD or full ISO as given, validated). */
  pickupFrom: string | null
  pickupTo: string | null
  deliveryFrom: string | null
  deliveryTo: string | null
  stackable: boolean
  fragile: boolean
}

export type RowStatus = 'ready' | 'warning' | 'error'

export interface ParsedRow {
  /** 1-based CSV line including the header (row 1), so the first data row is 2. */
  rowNumber: number
  status: RowStatus
  messages: string[]
  /** Null when status is 'error'. */
  line: NormalizedLine | null
}

export interface ParseSummary {
  rows: number
  ready: number
  warnings: number
  errors: number
  duplicatesInFile: number
}

export interface ParseResult {
  headerErrors: string[]
  rows: ParsedRow[]
  summary: ParseSummary
}

const REQUIRED_COLUMNS = [
  'client_order_ref',
  'line_no',
  'sku',
  'quantity',
  'unit',
  'pickup_site',
  'drop_site',
] as const

const FIELD_LABELS: Record<string, string> = {
  client_order_ref: 'Order reference',
  line_no: 'Line number',
  sku: 'SKU',
  quantity: 'Quantity',
  unit: 'Unit',
  pickup_site: 'Pickup site',
  drop_site: 'Drop site',
  length: 'Length',
  width: 'Width',
  height: 'Height',
  pickup_from: 'Pickup from',
  pickup_to: 'Pickup to',
  delivery_from: 'Delivery from',
  delivery_to: 'Delivery to',
}

const SUPPORTED_UNITS: ReadonlySet<string> = new Set(['kg', 'tonne', 'piece', 'carton'])

const TRUE_SPELLINGS: ReadonlySet<string> = new Set(['yes', 'true', '1'])
const FALSE_SPELLINGS: ReadonlySet<string> = new Set(['no', 'false', '0'])

/** Header plus two example rows; valid against parseOrderCsv with matching KnownSites. */
export const ORDER_CSV_TEMPLATE = [
  'client_order_ref,line_no,sku,description,quantity,unit,weight_per_unit,weight_unit,length,width,height,dim_unit,pickup_site,drop_site,pickup_from,pickup_to,delivery_from,delivery_to,stackable,fragile',
  'SO-2001,1,SKU-STEEL-ROD,Steel rod 12mm,40,kg,,,1200,,,mm,Central Warehouse,Retail Park North,2026-11-12,2026-11-13,2026-11-14,2026-11-15,yes,no',
  'SO-2001,2,SKU-FRAGILE-KIT,Fragile service kit,6,carton,4.5,kg,60,40,30,cm,Central Warehouse,Mall Exit 4,2026-11-12,2026-11-13,2026-11-14,2026-11-16,no,yes',
].join('\n')

interface RawRecord {
  /** Physical line in the file where this record starts (1-based). */
  startLine: number
  cells: string[]
}

/**
 * RFC 4180 tokenizer. Accepts CRLF and LF line breaks, allows commas,
 * newlines and doubled quotes inside quoted fields, and records the physical
 * start line of each record so row numbers stay true to the file.
 */
function tokenizeCsv(text: string): RawRecord[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const records: RawRecord[] = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  let recordStarted = false
  let startLine = 1
  let line = 1
  let i = 0

  const endRecord = () => {
    cells.push(field)
    field = ''
    records.push({ startLine, cells })
    cells = []
    recordStarted = false
    // The line break that ended this record was already consumed, so the next
    // record starts on the line we are on now.
    startLine = line
  }

  while (i < source.length) {
    const ch = source[i]
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i += 1
        }
      } else {
        if (ch === '\n') line += 1
        field += ch
        i += 1
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      recordStarted = true
      i += 1
    } else if (ch === ',') {
      cells.push(field)
      field = ''
      recordStarted = true
      i += 1
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1
      i += 1
      line += 1
      endRecord()
    } else {
      field += ch
      recordStarted = true
      i += 1
    }
  }
  if (recordStarted || cells.length > 0 || field !== '') {
    cells.push(field)
    records.push({ startLine, cells })
  }
  return records
}

function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function toNumber(raw: string): number | null {
  if (raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function emptyToNull(value: string): string | null {
  return value === '' ? null : value
}

function parseFlag(raw: string, fallback: boolean): boolean {
  const value = raw.trim().toLowerCase()
  if (TRUE_SPELLINGS.has(value)) return true
  if (FALSE_SPELLINGS.has(value)) return false
  return fallback
}

function isCompletelyEmpty(record: RawRecord): boolean {
  return record.cells.length === 1 && record.cells[0] === ''
}

export function parseOrderCsv(text: string, sites: KnownSites): ParseResult {
  const records = tokenizeCsv(text).filter((record) => !isCompletelyEmpty(record))

  const emptySummary: ParseSummary = { rows: 0, ready: 0, warnings: 0, errors: 0, duplicatesInFile: 0 }

  const columnIndex = new Map<string, number>()
  records[0]?.cells.forEach((cell, idx) => {
    const name = normalizeHeaderName(cell)
    if (name !== '' && !columnIndex.has(name)) columnIndex.set(name, idx)
  })

  const headerErrors: string[] = []
  for (const column of REQUIRED_COLUMNS) {
    if (!columnIndex.has(column)) headerErrors.push(`Column '${column}' is missing.`)
  }
  if (headerErrors.length > 0) {
    return { headerErrors, rows: [], summary: emptySummary }
  }

  const pickupKeys = new Set(sites.pickup.map((label) => label.trim().toLowerCase()))
  const dropKeys = new Set(sites.drop.map((label) => label.trim().toLowerCase()))

  const rows: ParsedRow[] = []
  const seenLineKeys = new Set<string>()
  let ready = 0
  let warnings = 0
  let errors = 0
  let duplicatesInFile = 0

  for (let r = 1; r < records.length; r += 1) {
    const record = records[r]
    const get = (column: string): string => {
      const idx = columnIndex.get(column)
      return idx === undefined || idx >= record.cells.length ? '' : record.cells[idx].trim()
    }

    const messages: string[] = []
    let hasError = false
    const err = (message: string) => {
      messages.push(message)
      hasError = true
    }

    for (const column of REQUIRED_COLUMNS) {
      if (get(column) === '') err(`${FIELD_LABELS[column]} is missing.`)
    }

    const quantityRaw = get('quantity')
    let quantity: number | null = null
    if (quantityRaw !== '') {
      const parsed = toNumber(quantityRaw)
      if (parsed === null || parsed <= 0) err('Quantity must be a number greater than zero.')
      else quantity = parsed
    }

    const lineNoRaw = get('line_no')
    let lineNo: number | null = null
    if (lineNoRaw !== '') {
      const parsed = toNumber(lineNoRaw)
      if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
        err('Line number must be a whole number greater than zero.')
      } else {
        lineNo = parsed
      }
    }

    const unitRaw = get('unit')
    const unitKey = unitRaw.toLowerCase()
    const unit = (SUPPORTED_UNITS.has(unitKey) ? unitKey : null) as OrderUnit | null
    if (unitRaw !== '' && unit === null) err(`Unit '${unitRaw}' is not supported`)

    // For kg/tonne the quantity itself is the line weight; for piece/carton a
    // missing weight is only a warning (the load plan treats it as unweighted).
    const weightRaw = get('weight_per_unit')
    let weight: number | null = null
    if (weightRaw !== '') {
      const parsed = toNumber(weightRaw)
      if (parsed === null || parsed < 0) err('Weight must be a number.')
      else weight = parsed
    }
    let weightPerUnitKg: number | null = null
    if (unit === 'kg') {
      weightPerUnitKg = 1
    } else if (unit === 'tonne') {
      weightPerUnitKg = 1000
    } else if (unit !== null) {
      if (weightRaw === '') {
        messages.push('Weight is missing; the load plan will treat this line as unweighted.')
      } else if (weight !== null) {
        weightPerUnitKg = get('weight_unit').toLowerCase() === 'tonne' ? weight * 1000 : weight
      }
    }

    const dimUnit = get('dim_unit').toLowerCase()
    const dimensionMeters: Record<string, number | null> = { length: null, width: null, height: null }
    for (const column of ['length', 'width', 'height'] as const) {
      const raw = get(column)
      if (raw === '') continue
      const parsed = toNumber(raw)
      if (parsed === null || parsed <= 0) {
        err(`${FIELD_LABELS[column]} must be a number greater than zero.`)
      } else {
        dimensionMeters[column] =
          dimUnit === 'mm' ? parsed / 1000 : dimUnit === 'cm' ? parsed / 100 : parsed
      }
    }

    const pickupSite = get('pickup_site')
    if (pickupSite !== '' && !pickupKeys.has(pickupSite.toLowerCase())) {
      err('Pickup site not found for this client.')
    }
    const dropSite = get('drop_site')
    if (dropSite !== '' && !dropKeys.has(dropSite.toLowerCase())) {
      err('Drop site not found for this client.')
    }

    const dateColumns = ['pickup_from', 'pickup_to', 'delivery_from', 'delivery_to'] as const
    const dateTs: Record<string, number | null> = {}
    for (const column of dateColumns) {
      const raw = get(column)
      if (raw === '') continue
      const ts = Date.parse(raw)
      if (Number.isNaN(ts)) err(`${FIELD_LABELS[column]} is not a valid date.`)
      else dateTs[column] = ts
    }

    const pickupFrom = dateTs.pickup_from ?? null
    const pickupTo = dateTs.pickup_to ?? null
    const deliveryFrom = dateTs.delivery_from ?? null
    const deliveryTo = dateTs.delivery_to ?? null
    if (pickupFrom !== null && pickupTo !== null && pickupTo < pickupFrom) {
      err('Pickup window ends before it starts.')
    }
    if (deliveryFrom !== null && deliveryTo !== null && deliveryTo < deliveryFrom) {
      err('Delivery window ends before it starts.')
    }
    if (
      pickupFrom !== null &&
      ((deliveryTo !== null && deliveryTo < pickupFrom) ||
        (deliveryFrom !== null && deliveryFrom < pickupFrom))
    ) {
      err('Delivery window ends before pickup window.')
    }

    const clientOrderRef = get('client_order_ref')
    const lineKey = `${clientOrderRef}\u0000${lineNoRaw}`
    if (seenLineKeys.has(lineKey)) {
      err('Duplicate line in this file.')
      duplicatesInFile += 1
    } else {
      seenLineKeys.add(lineKey)
    }

    const status: RowStatus = hasError ? 'error' : messages.length > 0 ? 'warning' : 'ready'
    let line: NormalizedLine | null = null
    if (!hasError && unit !== null && quantity !== null && lineNo !== null) {
      line = {
        clientOrderRef,
        lineNo,
        sku: get('sku'),
        description: emptyToNull(get('description')),
        quantity,
        unit,
        weightPerUnitKg,
        lengthM: dimensionMeters.length,
        widthM: dimensionMeters.width,
        heightM: dimensionMeters.height,
        pickupSite,
        dropSite,
        pickupFrom: emptyToNull(get('pickup_from')),
        pickupTo: emptyToNull(get('pickup_to')),
        deliveryFrom: emptyToNull(get('delivery_from')),
        deliveryTo: emptyToNull(get('delivery_to')),
        stackable: parseFlag(get('stackable'), true),
        fragile: parseFlag(get('fragile'), false),
      }
    }

    rows.push({ rowNumber: record.startLine, status, messages, line })
    if (status === 'ready') ready += 1
    else if (status === 'warning') warnings += 1
    else errors += 1
  }

  return {
    headerErrors,
    rows,
    summary: { rows: rows.length, ready, warnings, errors, duplicatesInFile },
  }
}

/** Lowercase hex SHA-256 of the UTF-8 text, via the platform Web Crypto. */
export async function hashOrderFile(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * CSV of the NOT-ready rows: row_number, status, messages (joined with
 * ' | '). The messages cell is always quoted with RFC 4180 doubling, and a
 * message starting with = + - @ is prefixed with a single quote so opening
 * the export in a spreadsheet can never execute it.
 */
export function orderRowsToCsv(rows: ParsedRow[]): string {
  const lines = ['row_number,status,messages']
  for (const row of rows) {
    if (row.status === 'ready') continue
    const messages = row.messages
      .map((message) => (/^[=+\-@]/.test(message) ? `'${message}` : message))
      .join(' | ')
    lines.push(`${row.rowNumber},${row.status},"${messages.replace(/"/g, '""')}"`)
  }
  return `${lines.join('\n')}\n`
}
