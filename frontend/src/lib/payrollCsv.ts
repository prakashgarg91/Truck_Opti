// CSV export helpers for closed payroll lines. Pure: no React, no network.
// Payroll is confidential and is opened in spreadsheets, so every text cell is
// guarded against formula injection (OWASP CSV injection).

/** Quote one CSV cell. A leading = + - @ (or tab/CR) gets a single quote prefix. */
export function csvCell(value: string | number): string {
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 123450 paise -> "1234.50" (plain digits so a spreadsheet reads a number). */
export function paiseToPlain(paise: number): string {
  const abs = Math.abs(Math.trunc(paise))
  return `${paise < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export interface PayrollCsvLine {
  driverLabel: string
  tripCount: number
  basePaise: number
  tripsPaise: number
  advancesPaise: number
  deductionsPaise: number
  carriedInPaise: number
  netPaise: number
  shortfallPaise: number
}

const HEADER = [
  'Driver',
  'Trips',
  'Base (INR)',
  'Trip earnings (INR)',
  'Earnings (INR)',
  'Advances (INR)',
  'Deductions (INR)',
  'Carried in (INR)',
  'Net (INR)',
  'Shortfall (INR)',
]

export function buildPayrollCsv(lines: PayrollCsvLine[]): string {
  const rows = lines.map((l) =>
    [
      l.driverLabel,
      l.tripCount,
      paiseToPlain(l.basePaise),
      paiseToPlain(l.tripsPaise),
      paiseToPlain(l.basePaise + l.tripsPaise),
      paiseToPlain(l.advancesPaise),
      paiseToPlain(l.deductionsPaise),
      paiseToPlain(l.carriedInPaise),
      paiseToPlain(l.netPaise),
      paiseToPlain(l.shortfallPaise),
    ].map(csvCell).join(',')
  )
  return [HEADER.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n'
}
