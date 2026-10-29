/** Attendance vocabulary, date helpers and the 90 / 75 colour thresholds. */

export const STATUS_META = {
  present: {
    label: 'Present',
    variant: 'success',
    active: 'bg-success text-success-foreground shadow-sm',
  },
  late: {
    label: 'Late',
    variant: 'warning',
    active: 'bg-warning text-warning-foreground shadow-sm',
  },
  absent: {
    label: 'Absent',
    variant: 'destructive',
    active: 'bg-destructive text-destructive-foreground shadow-sm',
  },
  excused: {
    label: 'Excused',
    variant: 'info',
    active: 'bg-info text-info-foreground shadow-sm',
  },
}

export const STATUS_ORDER = ['present', 'late', 'absent', 'excused']

export const STATUS_OPTIONS = STATUS_ORDER.map((value) => ({ value, label: STATUS_META[value].label }))

/** Local calendar date -> `YYYY-MM-DD` (the format the API expects). */
export const toYmd = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const UTC_LONG = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const LOCAL_LONG = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/** Server dates are UTC midnight of a calendar day — never shift them. */
export const formatDay = (value) => {
  const date = new Date(value)
  return value == null || Number.isNaN(date.getTime()) ? '—' : UTC_LONG.format(date)
}

/** The picker holds a local Date, so format that one locally. */
export const formatPickedDay = (value) => LOCAL_LONG.format(value)

/** >= 90 green · 75-89 amber · < 75 red */
export const percentTone = (percentage) => {
  if (percentage >= 90) return 'strong'
  if (percentage >= 75) return 'fair'
  return 'low'
}

export const TONE_TEXT = {
  strong: 'text-success',
  fair: 'text-warning',
  low: 'text-destructive',
}

export const TONE_BADGE = { strong: 'success', fair: 'warning', low: 'destructive' }

export const TONE_BAR = {
  strong: 'bg-success',
  fair: 'bg-warning',
  low: 'bg-destructive',
}

export const TONE_LABEL = { strong: 'On track', fair: 'Watch', low: 'At risk' }
