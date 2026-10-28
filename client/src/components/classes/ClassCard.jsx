import { Clock, GraduationCap, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatSchedule } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Shared class card used by My Classes and Enroll Classes: code + semester,
 * name, schedule, teacher and a seat gauge. `footer` holds the page-specific
 * action (Enroll / Unenroll / nothing).
 */
export default function ClassCard({ classDoc, badge, footer }) {
  const capacity = classDoc.capacity || 0
  const pct = capacity > 0 ? Math.min(100, Math.round((classDoc.enrolled / capacity) * 100)) : 0
  const seatsLeft = Math.max(0, capacity - classDoc.enrolled)
  const full = capacity > 0 && classDoc.enrolled >= capacity

  return (
    <Card className="flex flex-col transition-shadow duration-200 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="secondary" className="font-mono text-[11px]">
            {classDoc.code}
          </Badge>
          <div className="flex items-center gap-2">
            {badge}
            <span className="text-xs text-muted-foreground">{classDoc.semester}</span>
          </div>
        </div>

        <div className="space-y-0.5">
          <h3 className="text-base font-semibold leading-snug">{classDoc.name}</h3>
          <p className="text-xs text-muted-foreground">{classDoc.department}</p>
        </div>

        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{formatSchedule(classDoc.schedule)}</span>
          </p>
          <p className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 shrink-0" aria-hidden="true" />
            {classDoc.faculty ? (
              <span>{classDoc.faculty.name}</span>
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </p>
        </div>

        <div className="mt-auto space-y-1.5 pt-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {classDoc.enrolled} / {capacity} enrolled
            </span>
            {full ? (
              <Badge variant="warning" className="text-[10px]">
                Full
              </Badge>
            ) : (
              <span className="text-muted-foreground">
                {seatsLeft} {seatsLeft === 1 ? 'seat' : 'seats'} left
              </span>
            )}
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', full ? 'bg-amber-500' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {footer ? <div className="pt-2">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}
