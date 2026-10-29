import { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, BarChart3, BookOpen, CalendarDays, RefreshCw, UserX, Users } from 'lucide-react'

import RateBars from '@/components/charts/RateBars'
import TrendChart from '@/components/charts/TrendChart'
import EmptyState from '@/components/common/EmptyState'
import FilterSelect from '@/components/common/FilterSelect'
import PageHeader from '@/components/common/PageHeader'
import StatCard from '@/components/common/StatCard'
import TimeframeFilter, { timeframeLabel } from '@/components/common/TimeframeFilter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import useApiQuery from '@/hooks/useApiQuery'
import useFilterOptions from '@/hooks/useFilterOptions'
import usePolicy from '@/hooks/usePolicy'
import { DEPARTMENTS, SEMESTERS } from '@/lib/constants'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getAdminAnalytics } from '@/services/analytics'

const REFRESH_MS = 30000
const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }))
const SEMESTER_OPTIONS = SEMESTERS.map((s) => ({ value: s, label: s }))

export default function Analytics() {
  const policy = usePolicy()
  const { classes } = useFilterOptions()
  const [range, setRange] = useState({ timeframe: 'month', from: '', to: '' })
  const [filters, setFilters] = useState({ semester: '', department: '', classId: '' })

  const params = useMemo(() => {
    const p = { timeframe: range.timeframe, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }
    if (range.timeframe === 'custom') {
      if (range.from) p.from = range.from
      if (range.to) p.to = range.to
    }
    return p
  }, [range, filters])

  const query = useApiQuery(getAdminAnalytics, params, { intervalMs: REFRESH_MS })
  const data = query.data?.data
  const metrics = data?.metrics
  const setFilter = (field) => (value) => setFilters((prev) => ({ ...prev, [field]: value }))

  const scopeText = [
    query.data?.range?.from || query.data?.range?.to
      ? `${query.data.range.from ?? 'the start'} to ${query.data.range.to ?? 'today'}`
      : timeframeLabel(range.timeframe).toLowerCase(),
    filters.semester,
    filters.department,
    classes.find((c) => c.value === filters.classId)?.label,
  ]
    .filter(Boolean)
    .join(' · ')

  // Sparklines reuse the trend series (same filters and range as the cards).
  const points = data?.trend?.points ?? []
  const per = data?.trend?.unit === 'week' ? 'week' : 'day'
  const series = (field) => points.map((p) => p[field])

  const cards = metrics
    ? [
        { key: 'rate', icon: BarChart3, label: 'Overall attendance rate', value: metrics.rate == null ? '—' : `${metrics.rate}%`, hint: `${metrics.attended} attended of ${metrics.eligible} eligible`, tone: 1, trend: series('rate'), trendLabel: `Attendance rate by ${per} over the selected range` },
        { key: 'students', icon: Users, label: 'Total students', value: metrics.totalStudents, hint: `Enrolled in ${metrics.classes} classes`, tone: 3 },
        { key: 'absent', icon: UserX, label: 'Students absent in period', value: metrics.studentsAbsent, hint: `${metrics.absences} unexcused absences`, tone: 2, trend: series('absent'), trendLabel: `Absences by ${per} over the selected range`, trendMin: 0 },
        { key: 'sessions', icon: CalendarDays, label: 'Sessions held', value: metrics.sessionsHeld, hint: 'With attendance recorded', tone: 4, trend: series('sessions'), trendLabel: `Sessions by ${per} over the selected range`, trendMin: 0 },
        { key: 'below', icon: BookOpen, label: `Classes below ${data.threshold}%`, value: metrics.classesBelowThreshold, hint: `of ${metrics.classes} classes`, tone: 5 },
        { key: 'risk', icon: AlertTriangle, label: 'Students at risk', value: metrics.atRiskStudents, hint: `Below ${policy.studentRiskRate}% or ${policy.riskMinUnexcusedAbsences}+ absences`, tone: 5 },
      ]
    : []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description="Attendance trends and rates across the institution, from validated attendance records."
        action={
          <Button variant="outline" size="sm" onClick={query.refresh} disabled={query.loading}>
            <RefreshCw className={cn('h-4 w-4', query.loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4 xl:grid-cols-6">
          <TimeframeFilter idPrefix="analytics" value={range} onChange={setRange} />
          <FilterSelect id="analytics-semester" label="Academic period" value={filters.semester} onChange={setFilter('semester')} options={SEMESTER_OPTIONS} allLabel="All periods" />
          <FilterSelect id="analytics-department" label="Department" value={filters.department} onChange={setFilter('department')} options={DEPARTMENT_OPTIONS} allLabel="All departments" />
          <FilterSelect id="analytics-class" label="Class" value={filters.classId} onChange={setFilter('classId')} options={classes} allLabel="All classes" />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing <span className="font-medium text-foreground">{scopeText}</span>
        {query.updatedAt ? ` · updated ${formatTime(query.updatedAt, policy.timeZone)}, refreshes every ${REFRESH_MS / 1000} s` : ''}
      </p>

      {query.error && !data ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={AlertCircle} title="Could not load analytics" description={query.errorMessage} action={<Button variant="outline" size="sm" onClick={query.refresh}>Try again</Button>} />
          </CardContent>
        </Card>
      ) : null}

      {!data && query.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatCard key={i} icon={BarChart3} label="Loading" loading tone={1} />
          ))}
        </div>
      ) : null}

      {data?.empty ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={CalendarDays} title="No attendance recorded for these filters" description="Nothing matches this date range and filter combination. Widen the date range or clear a filter." />
          </CardContent>
        </Card>
      ) : null}

      {data && !data.empty ? (
        <div className={cn('space-y-5 transition-opacity', query.loading && 'opacity-60')} aria-busy={query.loading}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ key, ...card }) => (
              <StatCard key={key} {...card} />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendance rate over time</CardTitle>
              <CardDescription>
                {data.trend.unit === 'week' ? 'Weekly' : 'Daily'} rate = (present + late) ÷ (marked − excused). The line marks the {data.threshold}% risk threshold.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart title="Attendance rate over time" points={data.trend.points} unit={data.trend.unit} threshold={data.threshold} />
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attendance rate by class</CardTitle>
                <CardDescription>Lowest first. Classes below {data.threshold}% are flagged in the table.</CardDescription>
              </CardHeader>
              <CardContent>
                <RateBars title="Attendance rate by class" rows={data.byClass} threshold={data.threshold} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">By department</CardTitle>
                <CardDescription>Rate across each department&apos;s classes.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:px-6 sm:pb-6">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Department</TableHead>
                      <TableHead className="text-end">Classes</TableHead>
                      <TableHead className="text-end">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byDepartment.map((d) => (
                      <TableRow key={d.department}>
                        <TableCell className="font-medium">{d.department}</TableCell>
                        <TableCell className="text-end tabular-nums">{d.classes}</TableCell>
                        <TableCell className="text-end tabular-nums">{d.eligible ? `${d.rate}%` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  )
}
