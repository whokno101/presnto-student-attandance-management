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

/** "Monday, 09:00-10:30" -> "Mon 09:00-10:30" (table cell). */
export const formatSchedule = (schedule) => {
  if (!schedule?.day) return '—'
  return `${DAY_ABBR[schedule.day] || schedule.day} ${schedule.startTime}-${schedule.endTime}`
}
