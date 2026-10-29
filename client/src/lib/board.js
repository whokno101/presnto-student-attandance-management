import { DAYS } from '@/lib/constants'

const pad = (n) => String(n).padStart(2, '0')
export const ymdLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Status of one meeting relative to now: in session is the live row. */
const statusOf = (date, startTime, endTime, now) => {
  if (date !== ymdLocal(now)) return { label: 'Scheduled', tone: 'muted' }
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  if (clock >= startTime && clock < endTime) return { label: 'In session', tone: 'live' }
  if (clock >= endTime) return { label: 'Ended', tone: 'muted' }
  return { label: 'Scheduled', tone: 'muted' }
}

/**
 * Board rows for the week ahead, ranked by start: each class's weekly meeting
 * (its next occurrence, today included even once it has ended) merged with
 * dated sessions from the schedule. A dated session wins over the weekly
 * meeting for the same class on the same day.
 *
 * classes: class DTOs ({ id, code, name, schedule: { day, startTime, endTime }, room, faculty })
 * sessions: schedule DTOs ({ id, classId, classCode, className, instructor, room, date, startTime, endTime })
 * action(meeting) -> { to, label } | undefined, for a per-row link
 */
export function weekBoardRows(classes = [], sessions = [], { now = new Date(), limit = 8, action } = {}) {
  const today = ymdLocal(now)
  const tomorrow = ymdLocal(addDays(now, 1))
  const horizon = ymdLocal(addDays(now, 6))
  const meetings = new Map()

  for (const s of sessions) {
    if (s.date < today || s.date > horizon) continue
    meetings.set(`${s.classId}|${s.date}`, {
      id: `session-${s.id}`,
      classId: s.classId,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      code: s.classCode,
      title: s.className,
      detail: s.instructor ?? undefined,
      hall: s.room || '—',
    })
  }

  for (const c of classes) {
    const dayIndex = DAYS.indexOf(c.schedule?.day)
    if (dayIndex === -1 || !c.schedule?.startTime) continue
    // DAYS starts on Monday; Date#getDay() starts on Sunday.
    const offset = ((dayIndex + 1) % 7 - now.getDay() + 7) % 7
    const date = ymdLocal(addDays(now, offset))
    const key = `${c.id}|${date}`
    if (meetings.has(key)) continue
    meetings.set(key, {
      id: `class-${c.id}`,
      classId: c.id,
      date,
      startTime: c.schedule.startTime,
      endTime: c.schedule.endTime,
      code: c.code,
      title: c.name,
      detail: c.faculty?.name ?? undefined,
      hall: c.room || '—',
    })
  }

  const rows = [...meetings.values()]
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
    .slice(0, limit)
    .map((m) => ({
      ...m,
      day: m.date === today ? 'Today' : m.date === tomorrow ? 'Tomorrow' : dayLabel.format(new Date(`${m.date}T00:00`)),
      time: m.startTime,
      status: statusOf(m.date, m.startTime, m.endTime, now),
      action: action?.(m),
    }))

  // With nothing in session, the first session still to come is the one to watch.
  if (!rows.some((r) => r.status.tone === 'live')) {
    const next = rows.find((r) => r.status.label === 'Scheduled')
    if (next) next.status = { label: 'Next', tone: 'default' }
  }
  return rows
}
