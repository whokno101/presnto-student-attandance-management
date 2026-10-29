import { formatSchedule } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Classes as timetable rows (My Classes, Enroll): code, course, slot, room,
 * instructor and seats, hairline-ruled. `badge(classDoc)` adds a status chip
 * after the title; `action(classDoc)` fills the trailing column.
 */
export default function ClassRows({ classes, badge, action, caption }) {
  const showRoom = classes.some((c) => c.room)

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full min-w-[44rem] border-collapse text-start text-sm tabular-nums">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b font-display text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <th scope="col" className="w-28 px-4 py-2.5 text-start font-semibold">Code</th>
            <th scope="col" className="px-4 py-2.5 text-start font-semibold">Course</th>
            <th scope="col" className="px-4 py-2.5 text-start font-semibold">Slot</th>
            {showRoom ? <th scope="col" className="px-4 py-2.5 text-start font-semibold">Room</th> : null}
            <th scope="col" className="px-4 py-2.5 text-start font-semibold">Instructor</th>
            <th scope="col" className="px-4 py-2.5 text-end font-semibold">Seats</th>
            {action ? (
              <th scope="col" className="px-4 py-2.5 text-end font-semibold">
                <span className="sr-only">Action</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => {
            const capacity = c.capacity || 0
            const full = capacity > 0 && c.enrolled >= capacity
            return (
              <tr key={c.id} className="border-b align-middle transition-colors last:border-0 hover:bg-muted/60">
                <td className="px-4 py-3 font-mono font-medium">{c.code}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {c.name}
                    {badge?.(c)}
                  </span>
                  <span className="block text-muted-foreground">
                    {c.department}
                    {c.semester ? ` · ${c.semester}` : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono">{formatSchedule(c.schedule)}</td>
                {showRoom ? <td className="px-4 py-3 font-mono">{c.room || '—'}</td> : null}
                <td className="px-4 py-3">{c.faculty ? c.faculty.name : <span className="italic text-muted-foreground">Unassigned</span>}</td>
                <td className={cn('whitespace-nowrap px-4 py-3 text-end font-mono', full && 'font-semibold text-warning')}>
                  {c.enrolled}/{capacity}
                  {full ? <span className="ms-1.5 font-display uppercase tracking-[0.06em]">Full</span> : null}
                </td>
                {action ? <td className="whitespace-nowrap px-4 py-3 text-end">{action(c)}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
