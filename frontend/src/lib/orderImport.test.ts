import { describe, expect, it } from 'vitest'
import {
  ORDER_CSV_TEMPLATE,
  hashOrderFile,
  orderRowsToCsv,
  parseOrderCsv,
  type KnownSites,
  type ParsedRow,
} from './orderImport'

const SITES: KnownSites = {
  pickup: ['Warehouse A', 'Plant North'],
  drop: ['Downtown Store', 'Mall Exit 4'],
}

const HEADER =
  'client_order_ref,line_no,sku,description,quantity,unit,weight_per_unit,weight_unit,length,width,height,dim_unit,pickup_site,drop_site,pickup_from,pickup_to,delivery_from,delivery_to,stackable,fragile'

/** Minimal valid row: everything required present, defaults otherwise. */
function validRow(overrides: Record<string, string> = {}): string {
  const cells: Record<string, string> = {
    client_order_ref: 'SO-1001',
    line_no: '1',
    sku: 'SKU-1',
    description: '',
    quantity: '10',
    unit: 'kg',
    weight_per_unit: '',
    weight_unit: '',
    length: '',
    width: '',
    height: '',
    dim_unit: '',
    pickup_site: 'Warehouse A',
    drop_site: 'Downtown Store',
    pickup_from: '',
    pickup_to: '',
    delivery_from: '',
    delivery_to: '',
    stackable: '',
    fragile: '',
    ...overrides,
  }
  return HEADER.split(',')
    .map((name) => cells[name] ?? '')
    .join(',')
}

function parse(text: string, sites: KnownSites = SITES) {
  return parseOrderCsv(text, sites)
}

function firstLine(row: ParsedRow) {
  if (row.line === null) throw new Error(`row ${row.rowNumber} has no line: ${row.messages.join(' | ')}`)
  return row.line
}

describe('parseOrderCsv — header handling', () => {
  it('accepts the full template header and returns zero errors', () => {
    const result = parse(`${HEADER}\n${validRow()}`)
    expect(result.headerErrors).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].status).toBe('ready')
  })

  it('matches header names case-insensitively and maps spaces/hyphens to underscores', () => {
    const header = 'Client Order Ref,Line-No,SKU,Quantity,Unit,Pickup Site,Drop Site'
    const row = 'SO-1,1,SKU-9,5,kg,Warehouse A,Downtown Store'
    const result = parse(`${header}\n${row}`)
    expect(result.headerErrors).toEqual([])
    expect(result.rows[0].status).toBe('ready')
  })

  it('reports each missing required column and returns no rows', () => {
    const result = parse('description,quantity,unit\nwhatever,5,kg')
    expect(result.headerErrors).toEqual([
      "Column 'client_order_ref' is missing.",
      "Column 'line_no' is missing.",
      "Column 'sku' is missing.",
      "Column 'pickup_site' is missing.",
      "Column 'drop_site' is missing.",
    ])
    expect(result.rows).toEqual([])
    expect(result.summary.rows).toBe(0)
  })

  it('rejects an empty file with a missing-column error', () => {
    const result = parse('')
    expect(result.headerErrors).toContain("Column 'client_order_ref' is missing.")
    expect(result.rows).toEqual([])
  })
})

describe('parseOrderCsv — CSV mechanics', () => {
  it('strips a UTF-8 BOM before parsing', () => {
    const result = parse(`\uFEFF${HEADER}\n${validRow()}`)
    expect(result.headerErrors).toEqual([])
    expect(result.rows[0].status).toBe('ready')
  })

  it('accepts CRLF line endings', () => {
    const result = parse(`${HEADER}\r\n${validRow()}\r\n${validRow({ line_no: '2' })}`)
    expect(result.summary.rows).toBe(2)
    expect(result.summary.ready).toBe(2)
  })

  it('parses quoted fields with commas, newlines and doubled quotes', () => {
    const result = parse(
      `${HEADER}\n${validRow({
        description: '"Fragile, painted ""red"" glass\nkeep upright"',
        sku: '"SKU, with comma"',
      })}`,
    )
    const line = firstLine(result.rows[0])
    expect(line.description).toBe('Fragile, painted "red" glass\nkeep upright')
    expect(line.sku).toBe('SKU, with comma')
  })

  it('ignores completely empty lines but keeps row numbering true to the file', () => {
    const result = parse(
      `${HEADER}\n\n${validRow()}\n\n${validRow({ line_no: '2' })}\n\n`,
    )
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].rowNumber).toBe(3)
    expect(result.rows[1].rowNumber).toBe(5)
  })

  it('trims whitespace around every cell', () => {
    const result = parse(`${HEADER}\n${validRow({ sku: '  SKU-1  ', pickup_site: '  Warehouse A  ' })}`)
    const line = firstLine(result.rows[0])
    expect(line.sku).toBe('SKU-1')
    expect(line.pickupSite).toBe('Warehouse A')
  })

  it('returns a formula-prefixed cell unchanged (CSV injection is neutralized only on export)', () => {
    const result = parse(`${HEADER}\n${validRow({ description: '=SUM(A1:A9)' })}`)
    expect(firstLine(result.rows[0]).description).toBe('=SUM(A1:A9)')
  })
})

describe('parseOrderCsv — row validation messages', () => {
  it('reports every missing required cell in one row', () => {
    const row = validRow({
      client_order_ref: '',
      line_no: '',
      sku: '',
      quantity: '',
      unit: '',
      pickup_site: '',
      drop_site: '',
    })
    const result = parse(`${HEADER}\n${row}`)
    expect(result.rows[0].status).toBe('error')
    expect(result.rows[0].line).toBeNull()
    expect(result.rows[0].messages).toEqual([
      'Order reference is missing.',
      'Line number is missing.',
      'SKU is missing.',
      'Quantity is missing.',
      'Unit is missing.',
      'Pickup site is missing.',
      'Drop site is missing.',
    ])
  })

  it('rejects non-numeric, zero and negative quantities', () => {
    for (const quantity of ['abc', '0', '-2']) {
      const result = parse(`${HEADER}\n${validRow({ quantity })}`)
      expect(result.rows[0].status).toBe('error')
      expect(result.rows[0].messages).toContain('Quantity must be a number greater than zero.')
    }
  })

  it('rejects line numbers that are not positive whole numbers', () => {
    for (const lineNo of ['0', '-1', '1.5', 'two']) {
      const result = parse(`${HEADER}\n${validRow({ line_no: lineNo })}`)
      expect(result.rows[0].messages).toContain('Line number must be a whole number greater than zero.')
    }
  })

  it('rejects an unsupported unit and echoes the given value', () => {
    const result = parse(`${HEADER}\n${validRow({ unit: 'bags' })}`)
    expect(result.rows[0].status).toBe('error')
    expect(result.rows[0].messages).toContain("Unit 'bags' is not supported")
  })

  it('rejects a non-numeric or negative weight_per_unit', () => {
    for (const weight of ['heavy', '-1']) {
      const result = parse(`${HEADER}\n${validRow({ unit: 'piece', weight_per_unit: weight })}`)
      expect(result.rows[0].messages).toContain('Weight must be a number.')
    }
  })

  it('warns when piece/carton rows have no weight, but stays a warning', () => {
    const result = parse(`${HEADER}\n${validRow({ unit: 'piece', weight_per_unit: '' })}`)
    expect(result.rows[0].status).toBe('warning')
    expect(result.rows[0].messages).toEqual([
      'Weight is missing; the load plan will treat this line as unweighted.',
    ])
    expect(result.rows[0].line).not.toBeNull()
  })

  it('does not warn for kg or tonne rows without weight_per_unit', () => {
    const result = parse(`${HEADER}\n${validRow({ unit: 'tonne', weight_per_unit: '' })}`)
    expect(result.rows[0].status).toBe('ready')
    expect(result.rows[0].messages).toEqual([])
  })

  it('rejects non-positive dimensions with a per-field message', () => {
    const result = parse(
      `${HEADER}\n${validRow({ length: 'flat', width: '0', height: '-3' })}`,
    )
    expect(result.rows[0].messages).toEqual([
      'Length must be a number greater than zero.',
      'Width must be a number greater than zero.',
      'Height must be a number greater than zero.',
    ])
  })

  it('rejects pickup and drop sites that are unknown for the client (case-insensitive match succeeds)', () => {
    const unknown = parse(`${HEADER}\n${validRow({ pickup_site: 'Nowhere', drop_site: 'Downtown Store' })}`)
    expect(unknown.rows[0].messages).toContain('Pickup site not found for this client.')

    const unknownDrop = parse(`${HEADER}\n${validRow({ pickup_site: 'Warehouse A', drop_site: 'Nowhere' })}`)
    expect(unknownDrop.rows[0].messages).toContain('Drop site not found for this client.')

    const matched = parse(`${HEADER}\n${validRow({ pickup_site: 'WAREHOUSE a', drop_site: 'DOWNTOWN store' })}`)
    expect(matched.rows[0].status).toBe('ready')
  })

  it('rejects each invalid date field with its label', () => {
    const result = parse(
      `${HEADER}\n${validRow({
        pickup_from: 'not-a-date',
        pickup_to: 'also no',
        delivery_from: 'nope',
        delivery_to: 'never',
      })}`,
    )
    expect(result.rows[0].messages).toEqual([
      'Pickup from is not a valid date.',
      'Pickup to is not a valid date.',
      'Delivery from is not a valid date.',
      'Delivery to is not a valid date.',
    ])
  })

  it('flags a window whose end precedes its start', () => {
    const pickup = parse(
      `${HEADER}\n${validRow({ pickup_from: '2026-01-10', pickup_to: '2026-01-08' })}`,
    )
    expect(pickup.rows[0].messages).toContain('Pickup window ends before it starts.')

    const delivery = parse(
      `${HEADER}\n${validRow({ delivery_from: '2026-01-10', delivery_to: '2026-01-08' })}`,
    )
    expect(delivery.rows[0].messages).toContain('Delivery window ends before it starts.')
  })

  it('flags a delivery window that ends before the pickup window starts', () => {
    const result = parse(
      `${HEADER}\n${validRow({
        pickup_from: '2026-01-10',
        delivery_from: '2026-01-05',
        delivery_to: '2026-01-08',
      })}`,
    )
    expect(result.rows[0].messages).toContain('Delivery window ends before pickup window.')
  })

  it('flags delivery_from before pickup_from when both windows exist', () => {
    const result = parse(
      `${HEADER}\n${validRow({
        pickup_from: '2026-01-10',
        delivery_from: '2026-01-09',
        delivery_to: '2026-01-20',
      })}`,
    )
    expect(result.rows[0].messages).toContain('Delivery window ends before pickup window.')
  })

  it('accepts a coherent window chain without messages', () => {
    const result = parse(
      `${HEADER}\n${validRow({
        pickup_from: '2026-01-05',
        pickup_to: '2026-01-06',
        delivery_from: '2026-01-07',
        delivery_to: '2026-01-09',
      })}`,
    )
    expect(result.rows[0].status).toBe('ready')
  })
})

describe('parseOrderCsv — duplicates and summary', () => {
  it('marks the second and later duplicate (ref, line_no) rows as errors and counts them', () => {
    const result = parse(
      `${HEADER}\n${validRow()}\n${validRow()}\n${validRow({ line_no: '2' })}`,
    )
    expect(result.rows[0].status).toBe('ready')
    expect(result.rows[1].status).toBe('error')
    expect(result.rows[1].messages).toContain('Duplicate line in this file.')
    expect(result.rows[2].status).toBe('ready')
    expect(result.summary).toEqual({
      rows: 3,
      ready: 2,
      warnings: 0,
      errors: 1,
      duplicatesInFile: 1,
    })
  })

  it('treats the same ref with a different line number as distinct', () => {
    const result = parse(`${HEADER}\n${validRow()}\n${validRow({ line_no: '2' })}`)
    expect(result.summary.duplicatesInFile).toBe(0)
    expect(result.summary.ready).toBe(2)
  })

  it('counts ready, warnings and errors across rows', () => {
    const result = parse(
      [
        HEADER,
        validRow(),
        validRow({ line_no: '2', unit: 'piece' }), // warning: unweighted piece
        validRow({ line_no: '3', quantity: 'bad' }), // error
      ].join('\n'),
    )
    expect(result.summary).toEqual({
      rows: 3,
      ready: 1,
      warnings: 1,
      errors: 1,
      duplicatesInFile: 0,
    })
  })
})

describe('parseOrderCsv — normalization', () => {
  it('normalizes tonne weights to kg with weightPerUnitKg 1000', () => {
    const result = parse(`${HEADER}\n${validRow({ unit: 'tonne', quantity: '2' })}`)
    const line = firstLine(result.rows[0])
    expect(line.unit).toBe('tonne')
    expect(line.weightPerUnitKg).toBe(1000)
    expect(line.quantity).toBe(2)
  })

  it('sets weightPerUnitKg to 1 for kg rows so quantity x weightPerUnitKg is the line weight', () => {
    const result = parse(`${HEADER}\n${validRow({ unit: 'kg', quantity: '12.5' })}`)
    const line = firstLine(result.rows[0])
    expect(line.weightPerUnitKg).toBe(1)
    expect(line.quantity).toBe(12.5)
  })

  it('converts an explicit weight_unit tonne weight to kg for piece rows', () => {
    const result = parse(
      `${HEADER}\n${validRow({ unit: 'piece', weight_per_unit: '0.5', weight_unit: 'tonne' })}`,
    )
    const line = firstLine(result.rows[0])
    expect(line.weightPerUnitKg).toBe(500)
  })

  it('keeps a kg weight_unit as-is', () => {
    const result = parse(
      `${HEADER}\n${validRow({ unit: 'carton', weight_per_unit: '3.2', weight_unit: 'kg' })}`,
    )
    expect(firstLine(result.rows[0]).weightPerUnitKg).toBeCloseTo(3.2, 10)
  })

  it('converts dimensions from mm to metres', () => {
    const result = parse(
      `${HEADER}\n${validRow({ length: '1200', width: '80', height: '1.5', dim_unit: 'mm' })}`,
    )
    const line = firstLine(result.rows[0])
    expect(line.lengthM).toBe(1.2)
    expect(line.widthM).toBeCloseTo(0.08, 12)
    expect(line.heightM).toBeCloseTo(0.0015, 15)
  })

  it('converts cm dimensions to metres', () => {
    const result = parse(
      `${HEADER}\n${validRow({ length: '120', width: '80', height: '60', dim_unit: 'cm' })}`,
    )
    const line = firstLine(result.rows[0])
    expect(line.lengthM).toBe(1.2)
    expect(line.widthM).toBeCloseTo(0.8, 12)
    expect(line.heightM).toBeCloseTo(0.6, 12)
  })

  it('defaults dim_unit to metres and weight_unit to kg', () => {
    const result = parse(
      `${HEADER}\n${validRow({ length: '2', unit: 'carton', weight_per_unit: '4' })}`,
    )
    const line = firstLine(result.rows[0])
    expect(line.lengthM).toBe(2)
    expect(line.weightPerUnitKg).toBe(4)
  })

  it('applies stackable/fragile defaults and parses all accepted truth spellings', () => {
    const result = parse(
      [
        HEADER,
        validRow({ stackable: '', fragile: '' }),
        validRow({ line_no: '2', stackable: 'no', fragile: 'YES' }),
        validRow({ line_no: '3', stackable: 'FALSE', fragile: 'true' }),
        validRow({ line_no: '4', stackable: '0', fragile: '1' }),
      ].join('\n'),
    )
    const [row1, row2, row3, row4] = result.rows.map(firstLine)
    expect([row1.stackable, row1.fragile]).toEqual([true, false])
    expect([row2.stackable, row2.fragile]).toEqual([false, true])
    expect([row3.stackable, row3.fragile]).toEqual([false, true])
    expect([row4.stackable, row4.fragile]).toEqual([false, true])
  })

  it('keeps trimmed strings and passes dates through as given', () => {
    const result = parse(
      `${HEADER}\n${validRow({
        client_order_ref: '  SO-77  ',
        pickup_from: '2026-01-05',
        delivery_to: '2026-03-01T08:00:00Z',
      })}`,
    )
    const line = firstLine(result.rows[0])
    expect(line.clientOrderRef).toBe('SO-77')
    expect(line.pickupFrom).toBe('2026-01-05')
    expect(line.deliveryTo).toBe('2026-03-01T08:00:00Z')
    expect(line.pickupTo).toBeNull()
    expect(line.description).toBeNull()
    expect(line.weightPerUnitKg).toBe(1)
    expect(line.lengthM).toBeNull()
  })
})

describe('ORDER_CSV_TEMPLATE', () => {
  it('round-trips through parseOrderCsv with the template sites and no errors', () => {
    const sites: KnownSites = { pickup: [], drop: [] }
    // Extract the site labels the template uses so the test cannot drift.
    const templateRows = ORDER_CSV_TEMPLATE.trim().split(/\r?\n/).slice(1)
    for (const row of templateRows) {
      const cells = row.split(',')
      sites.pickup.push(cells[12])
      sites.drop.push(cells[13])
    }
    const result = parseOrderCsv(ORDER_CSV_TEMPLATE, sites)
    expect(result.headerErrors).toEqual([])
    expect(result.summary).toEqual({
      rows: 2,
      ready: 2,
      warnings: 0,
      errors: 0,
      duplicatesInFile: 0,
    })
  })

  it('has a header line plus exactly two example rows', () => {
    const lines = ORDER_CSV_TEMPLATE.trim().split(/\r?\n/)
    expect(lines).toHaveLength(3)
    expect(lines[0].toLowerCase().startsWith('client_order_ref')).toBe(true)
  })
})

describe('orderRowsToCsv', () => {
  it('exports only not-ready rows with row_number, status and joined messages', () => {
    const result = parse(
      [
        HEADER,
        validRow(),
        validRow({ line_no: '2', unit: 'piece' }),
        validRow({ line_no: '3', quantity: 'bad' }),
      ].join('\n'),
    )
    const csv = orderRowsToCsv(result.rows)
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('row_number,status,messages')
    expect(lines[1]).toBe('3,warning,"Weight is missing; the load plan will treat this line as unweighted."')
    expect(lines[2]).toBe('4,error,"Quantity must be a number greater than zero."')
  })

  it('quotes fields containing commas, quotes and newlines using RFC 4180 doubling', () => {
    const rows: ParsedRow[] = [
      {
        rowNumber: 4,
        status: 'error',
        messages: ['First, with comma', 'say "hi"', 'line\nbreak'],
        line: null,
      },
    ]
    const csv = orderRowsToCsv(rows)
    expect(csv).toBe('row_number,status,messages\n4,error,"First, with comma | say ""hi"" | line\nbreak"\n')
  })

  it('returns just the header when every row is ready', () => {
    const result = parse(`${HEADER}\n${validRow()}`)
    expect(orderRowsToCsv(result.rows)).toBe('row_number,status,messages\n')
  })

  it('prefixes formula-prefixed message cells with a single quote (CSV injection guard)', () => {
    const rows: ParsedRow[] = [
      { rowNumber: 7, status: 'error', messages: ['=SUM(A1:A9)', '+1', '-2', '@cmd'], line: null },
    ]
    const csv = orderRowsToCsv(rows)
    expect(csv).toBe('row_number,status,messages\n7,error,"\'=SUM(A1:A9) | \'+1 | \'-2 | \'@cmd"\n')
  })
})

describe('hashOrderFile', () => {
  it('computes the known SHA-256 vector for "abc"', async () => {
    expect(await hashOrderFile('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('returns lowercase hex and is stable across calls', async () => {
    const a = await hashOrderFile('SO-1001,1,SKU-1')
    const b = await hashOrderFile('SO-1001,1,SKU-1')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes the UTF-8 bytes of the text (non-ASCII changes the digest)', async () => {
    const ascii = await hashOrderFile('order')
    const unicode = await hashOrderFile('ordér')
    expect(ascii).not.toBe(unicode)
    expect(unicode).toMatch(/^[0-9a-f]{64}$/)
  })
})
