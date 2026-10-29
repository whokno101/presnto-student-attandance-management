/**
 * Timestamp formatting in the institution's time zone (handbook §2: stored
 * consistently, displayed in the configured zone). Pass `policy.timeZone`.
 */
const cache = new Map()

const formatter = (timeZone, options) => {
  const key = `${timeZone}|${JSON.stringify(options)}`
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat('en-GB', { timeZone, ...options }))
  return cache.get(key)
}

export const formatDateTime = (value, timeZone) =>
  value
    ? formatter(timeZone, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
    : '—'

export const formatTime = (value, timeZone) =>
  value ? formatter(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '—'

/** "3h", "1.5 days" — for how late/overdue something is. */
export const formatHours = (hours) => {
  if (hours == null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`
  return `${Math.round((hours / 24) * 10) / 10} days`
}

/** Whole days between now and a future instant (0 when passed). */
export const daysUntil = (value) =>
  value ? Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0
