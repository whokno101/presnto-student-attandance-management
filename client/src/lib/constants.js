/** Values shared by the admin dialogs and tables. */

export const DEPARTMENTS = ['Computer Science', 'Software Engineering', 'Information Security']

const THIS_YEAR = new Date().getFullYear()

export const SEMESTERS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].flatMap((year) => [
  `Spring ${year}`,
  `Fall ${year}`,
])

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const DAY_ABBR = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
}

/**
 * Select options plus the record's current value when it is not one of them
 * (a past semester, a department added outside this list), so editing an
 * older record never blanks a required field.
 */
export const withCurrent = (options, current) =>
  current && !options.includes(current) ? [current, ...options] : options

export const PAGE_SIZES = [10, 25, 50]

export const DEFAULT_PAGE_SIZE = 10

/**
 * A class's weekly meetings in day order. Accepts the list the API sends and
 * the older single `{ day, startTime, endTime }` object.
 */
export const meetingsOf = (schedule) => {
  const list = Array.isArray(schedule) ? schedule : schedule?.day ? [schedule] : []
  return [...list].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day))
}

/** Meetings -> "Mon 09:00-10:30, Wed 13:00-14:30" (table cell). */
export const formatSchedule = (schedule) => {
  const meetings = meetingsOf(schedule)
  if (!meetings.length) return '—'
  return meetings.map((m) => `${DAY_ABBR[m.day] || m.day} ${m.startTime}-${m.endTime}`).join(', ')
}
