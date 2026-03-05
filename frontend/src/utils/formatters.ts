/**
 * formatters.ts — Central formatting utilities for TruckOpti
 *
 * Always import from here instead of writing inline formatting logic.
 * Ensures consistent display of percentages, currency, distances, and durations.
 */

/**
 * Format a percentage value: rounds to given decimals, appends "%"
 *   formatPercent(37.819)     → "38%"
 *   formatPercent(37.819, 1)  → "37.8%"
 */
export function formatPercent(value: number, decimals = 0): string {
  if (!isFinite(value)) return '0%'
  return `${value.toFixed(decimals)}%`
}

/**
 * Format Indian Rupee currency with commas
 *   formatCurrency(12980)     → "₹12,980"
 *   formatCurrency(1234567)   → "₹12,34,567"
 *   formatCurrency(12980, true) → "₹12,980.00"
 */
export function formatCurrency(value: number, showPaise = false): string {
  if (!isFinite(value)) return '₹0'
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  })
  return formatter.format(value)
}

/**
 * Format distance in kilometres
 *   formatDistance(1147.8)   → "1,148 km"
 *   formatDistance(0.5)      → "500 m"
 */
export function formatDistance(km: number): string {
  if (!isFinite(km) || km < 0) return '0 km'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${new Intl.NumberFormat('en-IN').format(Math.round(km))} km`
}

/**
 * Format duration stored as decimal HOURS
 *   formatDuration(28.7)   → "28h 42m"
 *   formatDuration(0.5)    → "0h 30m"
 *   formatDuration(1.0)    → "1h 0m"
 */
export function formatDuration(hours: number): string {
  if (!isFinite(hours) || hours < 0) return '0h 0m'
  const h = Math.floor(hours)
  const m = Math.round((hours % 1) * 60)
  return `${h}h ${m}m`
}

/**
 * Format duration from total MINUTES
 *   formatDurationFromMinutes(1720) → "28h 40m"
 */
export function formatDurationFromMinutes(minutes: number): string {
  if (!isFinite(minutes) || minutes < 0) return '0h 0m'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${m}m`
}

/**
 * Format a weight value
 *   formatWeight(1500)   → "1,500 kg"
 *   formatWeight(0.5)    → "0.5 kg"
 */
export function formatWeight(kg: number, decimals = 1): string {
  if (!isFinite(kg) || kg < 0) return '0 kg'
  return `${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(kg)} kg`
}

/**
 * Format a volume value in cubic metres
 *   formatVolume(2.5)   → "2.50 m³"
 */
export function formatVolume(m3: number, decimals = 2): string {
  if (!isFinite(m3) || m3 < 0) return '0 m³'
  return `${m3.toFixed(decimals)} m³`
}

/**
 * Truncate long text with ellipsis
 *   truncate("Hello World Logistics", 10) → "Hello Worl…"
 */
export function truncate(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}
