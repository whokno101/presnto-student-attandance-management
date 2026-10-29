import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, AlertTriangle, BarChart3, CalendarDays, TrendingDown, UserX } from 'lucide-react'

import TrendChart from '@/components/charts/TrendChart'
import EmptyState from '@/components/common/EmptyState'
import FilterSelect from '@/components/common/FilterSelect'
import PageHeader from '@/components/common/PageHeader'
import StatCard from '@/components/common/StatCard'
import TimeframeFilter, { timeframeLabel } from '@/components/common/TimeframeFilter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import useApiQuery from '@/hooks/useApiQuery'
import useFilterOptions from '@/hooks/useFilterOptions'
import usePolicy from '@/hooks/usePolicy'
import { cn } from '@/lib/utils'
import { getFacultyInsights } from '@/services/analytics'

const REFRESH_MS = 60000

const reportLink = (row) => `/reports?view=records&classId=${row.classId}&student=${encodeURIComponent(row.studentNumber)}`

function SmallList({ title, description, empty, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:px-6 sm:pb-6">{children ?? <p className="px-6 pb-6 text-sm text-muted-foreground sm:px-0 sm:pb-0">{empty}</p>}</CardContent>
    </Card>
  )
}

export default function Insights() {
  const policy = usePolicy()
  const { classes } = useFilterOptions()
  const [searchParams] = useSearchParams()
  const highlight = searchParams.get('student')
  const [classId, setClassId] = useState(searchParams.get('classId') ?? '')
  const [range, setRange] = useState({ timeframe: 'all', from: '', to: '' })

  const params = useMemo(() => {
    const p = { timeframe: range.timeframe }
    if (classId) p.classId = classId
    if (range.timeframe === 'custom') {
      if (range.from) p.from = range.from
      if (range.to) p.to = range.to
    }
    return p
  }, [classId, range])

  const query = useApiQuery(getFacultyInsights, params, { intervalMs: REFRESH_MS })
  const data = query.data?.data
  const m = data?.metrics

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Insights"
        description="Trends, frequent absences and students who may need academic support in the classes you teach."
      />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <FilterSelect id="insights-class" label="Class" value={classId} onChange={setClassId} options={classes} allLabel="All my classes" />
          <TimeframeFilter idPrefix="insights" value={range} onChange={setRange} />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Trend and absences cover <span className="font-medium text-foreground">{timeframeLabel(range.timeframe).toLowerCase()}</span>. Risk always uses each
        student&apos;s whole record in the class: below {policy.studentRiskRate}% or {policy.riskMinUnexcusedAbsences}+ unexcused absences. Pending excuses do not
        change it until approved.
      </p>

      {query.error && !data ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={AlertCircle} title="Could not load insights" description={query.errorMessage} action={<Button variant="outline" size="sm" onClick={query.refresh}>Try again</Button>} />
          </CardContent>
        </Card>
      ) : null}

      {!data && query.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCard key={i} icon={BarChart3} label="Loading" loading tone={1} />
          ))}
        </div>
      ) : null}

      {data ? (
        <div className={cn('space-y-5 transition-opacity', query.loading && 'opacity-60')} aria-busy={query.loading}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={BarChart3} label="Attendance rate" value={m.rate == null ? '—' : `${m.rate}%`} hint={`${m.attended} attended of ${m.eligible} eligible`} tone={1} />
            <StatCard icon={UserX} label="Unexcused absences" value={m.absences} hint={`${m.excused} excused`} tone={2} />
            <StatCard icon={AlertTriangle} label="Students at risk" value={m.atRisk} hint="Need academic support" tone={5} />
            <StatCard icon={TrendingDown} label="Declining attendance" value={m.declining} hint={`Last ${data.thresholds.recentSessions} sessions ${data.thresholds.declinePoints}+ points below earlier`} tone={4} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Students at risk</CardTitle>
              <CardDescription>An academic-support indicator, not a disciplinary decision.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:px-6 sm:pb-6">
              {data.atRisk.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-end">Rate</TableHead>
                      <TableHead className="text-end">Unexcused</TableHead>
                      <TableHead>Why</TableHead>
                      <TableHead>Next step</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.atRisk.map((row) => (
                      <TableRow key={`${row.studentId}-${row.classId}`} className={cn(highlight && row.studentNumber === highlight && 'bg-primary/5 ring-2 ring-inset ring-ring')}>
                        <TableCell>
                          <p className="font-medium">{row.studentName}</p>
                          <p className="font-mono text-xs text-muted-foreground">{row.studentNumber}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{row.code}</TableCell>
                        <TableCell className="text-end tabular-nums">{row.rate == null ? '—' : `${row.rate}%`}</TableCell>
                        <TableCell className="text-end tabular-nums">{row.absent}</TableCell>
                        <TableCell className="max-w-[240px] text-sm">
                          <Badge variant="destructive" className="mb-1">
                            At risk
                          </Badge>
                          <p>{row.reason}</p>
                        </TableCell>
                        <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                          {row.nextStep}{' '}
                          <Link to={reportLink(row)} className="font-medium text-primary underline-offset-4 hover:underline">
                            View records
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState icon={AlertTriangle} title="No students at risk" description="Nobody is below the attendance threshold or over the absence limit." />
              )}
            </CardContent>
          </Card>

          {data.empty ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState icon={CalendarDays} title="No attendance in this range" description="Choose a wider date range to see trends and absences." />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attendance rate over time</CardTitle>
                <CardDescription>{data.trend.unit === 'week' ? 'Weekly' : 'Daily'} rate for the selected classes.</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart title="Class attendance rate over time" points={data.trend.points} unit={data.trend.unit} threshold={data.thresholds.rate} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <SmallList title="Frequent absences" description="Most unexcused absences in the selected range." empty="No unexcused absences in this range.">
              {data.frequentAbsences.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-end">Absences</TableHead>
                      <TableHead className="text-end">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.frequentAbsences.map((row) => (
                      <TableRow key={`${row.studentId}-${row.classId}`}>
                        <TableCell>
                          <Link to={reportLink(row)} className="font-medium hover:underline">
                            {row.studentName}
                          </Link>
                          {row.atRisk ? (
                            <Badge variant="destructive" className="ms-2">
                              At risk
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{row.code}</TableCell>
                        <TableCell className="text-end tabular-nums">{row.absent}</TableCell>
                        <TableCell className="text-end tabular-nums">{row.rate == null ? '—' : `${row.rate}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </SmallList>

            <SmallList title="Declining attendance" description="Recent sessions well below the student's earlier rate." empty="No students show a significant decline.">
              {data.declining.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-end">Earlier</TableHead>
                      <TableHead className="text-end">Last {data.thresholds.recentSessions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.declining.map((row) => (
                      <TableRow key={`${row.studentId}-${row.classId}`}>
                        <TableCell className="font-medium">{row.studentName}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{row.code}</TableCell>
                        <TableCell className="text-end tabular-nums">{row.earlierRate}%</TableCell>
                        <TableCell className="text-end tabular-nums">
                          <TrendingDown className="me-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {row.recentRate}%<span className="sr-only"> (down {row.drop} points)</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </SmallList>
          </div>
        </div>
      ) : null}
    </div>
  )
}
