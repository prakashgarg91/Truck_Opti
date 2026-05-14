export interface ExportColumn<Row> {
    label: string
    value: (row: Row) => string | number | boolean | null | undefined
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
    const cell = value == null ? '' : String(value)
    return `"${cell.replace(/"/g, '""')}"`
}

function buildExportRows<Row>(rows: Row[], columns: ExportColumn<Row>[]) {
    return rows.map((row) => Object.fromEntries(
        columns.map((column) => [column.label, column.value(row) ?? ''])
    ))
}

export function downloadCsv<Row>(rows: Row[], columns: ExportColumn<Row>[], filename: string) {
    const csvContent = [
        columns.map((column) => escapeCsvCell(column.label)).join(','),
        ...rows.map((row) => columns.map((column) => escapeCsvCell(column.value(row))).join(','))
    ].join('\n')

    downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), filename)
}

export function downloadJson<Row>(rows: Row[], filename: string) {
    const jsonContent = JSON.stringify(rows, null, 2)
    downloadBlob(new Blob([jsonContent], { type: 'application/json;charset=utf-8;' }), filename)
}

export async function downloadXlsx<Row>(rows: Row[], columns: ExportColumn<Row>[], filename: string, sheetName = 'Export') {
    const XLSX = await import('xlsx-js-style')
    const worksheet = XLSX.utils.json_to_sheet(buildExportRows(rows, columns))

    worksheet['!cols'] = columns.map((column) => ({ wch: Math.max(column.label.length + 4, 16) }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    XLSX.writeFile(workbook, filename)
}