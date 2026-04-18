export function generateShipmentId(now = new Date()): string {
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const random = Math.random().toString(36).slice(2, 8).toUpperCase()

    return `SHP-${year}${month}${day}-${random}`
}