// Calendar days for India (Asia/Kolkata, UTC+05:30, no DST). Use these instead of
// toISOString().split('T')[0], which returns the UTC day and is wrong for the first
// 5.5 hours of every IST day.

const IST_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The India calendar day of an instant as YYYY-MM-DD, or null when the value is not a valid date. */
export function indiaCalendarDate(value: Date | string | number): string | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return IST_DAY_FORMAT.format(date)
}
