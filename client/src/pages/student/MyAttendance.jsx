import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CalendarCheck2 } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import SummaryStrip from '@/components/board/SummaryStrip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getErrorMessage } from '@/lib/api'
import {
  formatDay,
  percentTone,
  STATUS_META,
  TONE_LABEL,
  TONE_TEXT,
} from '@/lib/attendance'
import { cn } from '@/lib/utils'
import { getMyAttendance } from '@/services/attendance'

export default function MyAttendance() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await getMyAttendance())
    } catch (err) {
      setError(err)
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const overall = report?.summary
  const tone = percentTone(overall?.percentage ?? 0)

  return (
    <div className="space-y-5">
      <PageHeader title="My Attendance" description="Your record for every class you are enrolled in." />

      {loading ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="h-24 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardContent className="space-y-3 p-6">
                  <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
                  <div className="h-24 w-full animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={AlertCircle}
              title="Could not load your attendance"
              description={getErrorMessage(error)}
              action={
                <Button variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : !overall || overall.total === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarCheck2}
              title="No attendance recorded yet"
              description="Once your teachers mark a class, your percentages will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryStrip
            items={[
              {
                label: 'Overall',
                value: `${overall.percentage}%`,
                hint: (
                  <>
                    <span className={cn('font-display font-semibold uppercase tracking-[0.06em]', TONE_TEXT[tone])}>{TONE_LABEL[tone]}</span>
                    {` · ${overall.attended} of ${overall.eligible ?? overall.total} attended${overall.excused ? ` (${overall.excused} excused)` : ''} · 90% keeps you on track`}
                  </>
                ),
              },
              { label: 'Present', value: overall.present },
              { label: 'Late', value: overall.late },
              { label: 'Absent', value: overall.absent, className: overall.absent ? 'text-destructive' : undefined },
              { label: 'Excused', value: overall.excused ?? 0 },
            ]}
            className="sm:grid-cols-[minmax(18rem,2fr)_repeat(4,minmax(6rem,1fr))]"
          />

          <Card>
            <CardHeader className="pb-0">
              <CardTitle>By class</CardTitle>
            </CardHeader>
            <CardContent className="divide-y pt-2">
              {report.classes.map((classDoc) => {
                const classTone = percentTone(classDoc.summary.percentage)

                return (
                  <section key={classDoc.id} aria-labelledby={`class-${classDoc.id}`} className="py-5 first:pt-3 last:pb-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        <h3 id={`class-${classDoc.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-mono text-[0.95rem] font-medium">{classDoc.code}</span>
                          <span className="font-display text-lg font-semibold uppercase tracking-[0.03em]">{classDoc.name}</span>
                          {classDoc.archived ? <Badge variant="secondary">Archived</Badge> : null}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {classDoc.faculty ? `Taught by ${classDoc.faculty.name}` : 'No teacher assigned'}
                        </p>
                      </div>
                      <dl className="flex items-baseline gap-5 font-mono text-sm tabular-nums">
                        <div className="flex items-baseline gap-2">
                          <dt className="sr-only">Rate</dt>
                          <dd className="text-xl font-medium">{classDoc.summary.percentage}%</dd>
                          <dd className={cn('font-display text-[0.9rem] font-semibold uppercase tracking-[0.06em]', TONE_TEXT[classTone])}>
                            {TONE_LABEL[classTone]}
                          </dd>
                        </div>
                        <div className="text-muted-foreground">
                          <dt className="sr-only">Attended</dt>
                          <dd>
                            {classDoc.summary.attended}/{classDoc.summary.eligible ?? classDoc.summary.total}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <ul
                      className="mt-3 grid border-t sm:grid-cols-2 sm:gap-x-8 xl:grid-cols-3"
                      aria-label={`${classDoc.code} attendance history`}
                    >
                      {classDoc.records.map((record) => {
                        const meta = STATUS_META[record.status]
                        return (
                          <li key={record.id} className="flex items-center justify-between gap-3 border-b py-2">
                            <span className="whitespace-nowrap font-mono text-sm">{formatDay(record.date)}</span>
                            <Badge variant={meta?.variant ?? 'secondary'}>{meta?.label ?? record.status}</Badge>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
