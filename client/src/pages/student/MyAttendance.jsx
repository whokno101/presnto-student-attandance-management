import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CalendarCheck2 } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getErrorMessage } from '@/lib/api'
import {
  formatDay,
  percentTone,
  STATUS_META,
  TONE_BADGE,
  TONE_BAR,
  TONE_LABEL,
  TONE_TEXT,
} from '@/lib/attendance'
import { cn } from '@/lib/utils'
import { getMyAttendance } from '@/services/attendance'

const TONE_BORDER = {
  strong: 'border-emerald-600',
  fair: 'border-amber-500',
  low: 'border-rose-600',
}

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
      <PageHeader
        title="My Attendance"
        description="Your record for every class you are enrolled in."
        action={
          overall && overall.total > 0 ? (
            <Badge variant={TONE_BADGE[tone]} className="text-sm">
              {overall.percentage}% overall
            </Badge>
          ) : null
        }
      />

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
          <Card className={cn('border-l-4', TONE_BORDER[tone])}>
            <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <p className={cn('text-4xl font-semibold tabular-nums tracking-tight', TONE_TEXT[tone])}>
                  {overall.percentage}%
                </p>
                <p className={cn('text-sm font-medium', TONE_TEXT[tone])}>{TONE_LABEL[tone]}</p>
                <p className="text-xs text-muted-foreground">
                  {overall.attended} of {overall.total} classes attended
                </p>
              </div>

              <div className="flex-1 space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', TONE_BAR[tone])}
                    style={{ width: `${Math.min(100, overall.percentage)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Across {report.classes.length} {report.classes.length === 1 ? 'class' : 'classes'} ·{' '}
                  90% required to stay on track
                </p>
              </div>

              <dl className="grid shrink-0 grid-cols-3 gap-4 text-center">
                {[
                  ['Present', overall.present, 'text-emerald-600'],
                  ['Late', overall.late, 'text-amber-600'],
                  ['Absent', overall.absent, 'text-rose-600'],
                ].map(([label, value, color]) => (
                  <div key={label}>
                    <dd className={cn('text-xl font-semibold tabular-nums', color)}>{value}</dd>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {report.classes.map((classDoc) => {
              const classTone = percentTone(classDoc.summary.percentage)

              return (
                <Card key={classDoc.id} className="flex flex-col">
                  <CardHeader className="space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="font-mono text-[11px]">
                            {classDoc.code}
                          </Badge>
                          <CardTitle className="text-base">{classDoc.name}</CardTitle>
                        </div>
                        <CardDescription>
                          {classDoc.faculty ? `Taught by ${classDoc.faculty.name}` : 'No teacher assigned'}
                        </CardDescription>
                      </div>

                      <Badge variant={TONE_BADGE[classTone]} className="shrink-0">
                        {classDoc.summary.percentage}%
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-3 pb-6">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {classDoc.summary.attended} of {classDoc.summary.total} attended
                        </span>
                        <span>
                          {classDoc.summary.present}P · {classDoc.summary.late}L ·{' '}
                          {classDoc.summary.absent}A
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', TONE_BAR[classTone])}
                          style={{ width: `${Math.min(100, classDoc.summary.percentage)}%` }}
                        />
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {classDoc.records.map((record) => {
                            const meta = STATUS_META[record.status]
                            return (
                              <TableRow key={record.id}>
                                <TableCell className="whitespace-nowrap text-sm">
                                  {formatDay(record.date)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant={meta?.variant ?? 'secondary'}>
                                    {meta?.label ?? record.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
