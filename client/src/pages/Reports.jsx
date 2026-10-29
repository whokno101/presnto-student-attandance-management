import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, AlertTriangle, BarChart3, CalendarDays, Download, FileSpreadsheet, Loader2, RotateCcw, UserX } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import FilterSelect, { DateFilter } from '@/components/common/FilterSelect'
import PageHeader from '@/components/common/PageHeader'
import RateCell from '@/components/common/RateCell'
import SortHeader from '@/components/common/SortHeader'
import StatCard from '@/components/common/StatCard'
import TablePagination from '@/components/common/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { labelVariants } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/context/AuthContext'
import useApiQuery, { useDebounced } from '@/hooks/useApiQuery'
import useFilterOptions from '@/hooks/useFilterOptions'
import usePolicy from '@/hooks/usePolicy'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { formatDay, STATUS_META, STATUS_OPTIONS, toYmd } from '@/lib/attendance'
import { DEPARTMENTS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { exportReport, getReport } from '@/services/reports'

const PAGE_SIZE = 25
const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }))

const defaultRange = () => {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 29)
  return { from: toYmd(from), to: toYmd(to) }
}

const EMPTY = { classId: '', department: '', facultyId: '', status: '', risk: '' }

const VIEWS = {
  sessions: { label: 'Sessions', defaultSort: { key: 'date', dir: 'desc' } },
  students: { label: 'Students', defaultSort: { key: 'rate', dir: 'asc' } },
  records: { label: 'Records', defaultSort: { key: 'date', dir: 'desc' } },
}

// Tag each result with its view: while a new view loads, the previous view's
// rows must not be rendered with the new view's columns.
const fetchReport = ({ view, ...params }) => getReport(view, params).then((data) => ({ ...data, view }))

function ArchivedBadge({ show }) {
  return show ? (
    <Badge variant="secondary" className="ms-2">
      Archived
    </Badge>
  ) : null
}

function Counts({ row }) {
  return (
    <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      <span title="Present">{row.present}P</span> · <span title="Late">{row.late}L</span> ·{' '}
      <span title="Absent" className={cn(row.absent > 0 && 'font-semibold text-destructive')}>
        {row.absent}A
      </span>{' '}
      · <span title="Excused">{row.excused}E</span>
    </span>
  )
}

export default function Reports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const policy = usePolicy()
  const { toast } = useToast()
  const { faculty, classes } = useFilterOptions()

  // Links from Insights/notifications open a pre-filtered view (?view&classId&student).
  const [searchParams] = useSearchParams()
  const initialView = VIEWS[searchParams.get('view')] ? searchParams.get('view') : 'sessions'
  const linked = Boolean(searchParams.get('classId') || searchParams.get('student'))
  const [view, setView] = useState(initialView)
  const [range, setRange] = useState(() => (linked ? { from: '', to: '' } : defaultRange()))
  const [filters, setFilters] = useState(() => ({ ...EMPTY, classId: searchParams.get('classId') ?? '' }))
  const [studentInput, setStudentInput] = useState(searchParams.get('student') ?? '')
  const student = useDebounced(studentInput.trim())
  const [sort, setSort] = useState(VIEWS[initialView].defaultSort)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  useEffect(() => setPage(1), [filters, range, student, view, sort])

  const changeView = (next) => {
    setView(next)
    setSort(VIEWS[next].defaultSort)
  }

  const params = useMemo(
    () => ({
      ...Object.fromEntries(Object.entries({ ...filters, ...range, student }).filter(([, v]) => v)),
      sort: sort.key,
      order: sort.dir,
    }),
    [filters, range, student, sort]
  )

  const query = useApiQuery(fetchReport, { view, ...params, page, limit: PAGE_SIZE })
  const result = query.data?.view === view ? query.data : null
  const rows = result?.data ?? []
  const summary = result?.summary
  const pagination = result?.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE }

  const setFilter = (field) => (value) => setFilters((prev) => ({ ...prev, [field]: value }))
  const reset = () => {
    setFilters(EMPTY)
    setRange(defaultRange())
    setStudentInput('')
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const filename = await exportReport(view, params)
      toast({ title: 'Export ready', description: `${filename} contains the rows matching your filters.`, variant: 'success' })
    } catch (error) {
      toast({ title: 'Could not export', description: getErrorMessage(error), variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const to = Math.min(pagination.page * pagination.limit, pagination.total)

  const cards = summary
    ? [
        view === 'students'
          ? { key: 'students', icon: UserX, label: 'Students', value: summary.students, hint: `${summary.enrollments} class enrollments`, tone: 1 }
          : view === 'records'
            ? { key: 'records', icon: FileSpreadsheet, label: 'Records', value: summary.records, hint: 'Matching attendance records', tone: 1 }
            : { key: 'sessions', icon: CalendarDays, label: 'Sessions', value: summary.sessions, hint: `${summary.classes} classes`, tone: 1 },
        {
          key: 'rate',
          icon: BarChart3,
          label: 'Attendance rate',
          value: summary.eligible > 0 ? `${summary.rate}%` : '—',
          hint: summary.eligible > 0 ? `${summary.attended} attended of ${summary.eligible} eligible` : 'No eligible sessions',
          tone: 4,
        },
        {
          key: 'absent',
          icon: UserX,
          label: 'Unexcused absences',
          value: summary.absent,
          hint: `${summary.excused} excused`,
          tone: 2,
        },
        view === 'students'
          ? {
              key: 'risk',
              icon: AlertTriangle,
              label: 'Students at risk',
              value: summary.atRisk,
              hint: `Below ${policy.studentRiskRate}% or ${policy.riskMinUnexcusedAbsences}+ absences`,
              tone: 5,
            }
          : {
              key: 'warning',
              icon: AlertTriangle,
              label: `Sessions below ${policy.sessionWarningRate}%`,
              value: summary.belowWarning ?? '—',
              hint: view === 'records' ? 'See the Sessions view' : `of ${summary.sessions} sessions`,
              tone: 5,
            },
      ]
    : []

  const columns = 6

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAdmin ? 'Attendance Reports' : 'Class Reports'}
        description={
          isAdmin
            ? 'Session, student and record-level attendance across every class. Filters apply to the table, the totals and the export.'
            : 'Session, student and record-level attendance for the classes you teach.'
        }
        action={
          <Button variant="outline" onClick={handleExport} disabled={exporting || !rows.length}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <DateFilter id="report-from" label="From" value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} max={range.to || undefined} />
          <DateFilter id="report-to" label="To" value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} min={range.from || undefined} />
          <FilterSelect id="report-class" label="Class" value={filters.classId} onChange={setFilter('classId')} options={classes} allLabel={isAdmin ? 'All classes' : 'All my classes'} />
          <FilterSelect id="report-status" label="Attendance status" value={filters.status} onChange={setFilter('status')} options={STATUS_OPTIONS} allLabel="Any status" />
          {isAdmin ? (
            <>
              <FilterSelect id="report-department" label="Department" value={filters.department} onChange={setFilter('department')} options={DEPARTMENT_OPTIONS} allLabel="All departments" />
              <FilterSelect id="report-faculty" label="Faculty member" value={filters.facultyId} onChange={setFilter('facultyId')} options={faculty} allLabel="All faculty" />
            </>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="report-student" className={labelVariants()}>
              Student
            </label>
            <Input id="report-student" type="search" value={studentInput} onChange={(e) => setStudentInput(e.target.value)} placeholder="Name or student ID" />
          </div>
          {view === 'students' ? (
            <FilterSelect id="report-risk" label="Risk" value={filters.risk} onChange={setFilter('risk')} options={[{ value: 'at_risk', label: 'At risk only' }]} allLabel="Everyone" />
          ) : null}
          <div className="flex items-end justify-end sm:col-span-2 lg:col-span-4">
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={view} onValueChange={changeView}>
        <TabsList aria-label="Report view">
          {Object.entries(VIEWS).map(([value, meta]) => (
            <TabsTrigger key={value} value={value}>
              {meta.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={view} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
        {summary
          ? cards.map((card) => <StatCard key={card.key} {...{ icon: card.icon, label: card.label, value: card.value, hint: card.hint, tone: card.tone }} loading={false} />)
          : Array.from({ length: 4 }).map((_, i) => <StatCard key={i} icon={BarChart3} label="Loading" loading tone={1} />)}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            Showing {VIEWS[view].label.toLowerCase()} from {result?.range?.from ?? range.from ?? 'the start'} to {result?.range?.to ?? range.to ?? 'today'}.
            Rate = (present + late) ÷ (marked − excused).
            {view === 'sessions' ? ` Sessions below ${policy.sessionWarningRate}% are flagged.` : ''}
          </p>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {view === 'sessions' ? (
                  <>
                    <SortHeader label="Date" column="date" sort={sort} onSort={setSort} defaultDir="desc" />
                    <SortHeader label="Class" column="code" sort={sort} onSort={setSort} />
                    <TableHead>Faculty</TableHead>
                    <TableHead className="text-end">Enrolled</TableHead>
                    <SortHeader label="Status counts" column="absent" sort={sort} onSort={setSort} defaultDir="desc" />
                    <SortHeader label="Rate" column="rate" sort={sort} onSort={setSort} />
                  </>
                ) : view === 'students' ? (
                  <>
                    <SortHeader label="Student" column="studentName" sort={sort} onSort={setSort} />
                    <SortHeader label="Class" column="code" sort={sort} onSort={setSort} />
                    <SortHeader label="Absences" column="absent" sort={sort} onSort={setSort} defaultDir="desc" />
                    <TableHead>Status counts</TableHead>
                    <SortHeader label="Rate" column="rate" sort={sort} onSort={setSort} />
                    <TableHead>Risk</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Date</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recorded via</TableHead>
                    <TableHead>Recorded by</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.loading && !result
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`s-${i}`} className="hover:bg-transparent">
                      <TableCell colSpan={columns}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                : null}

              {query.error ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns} className="p-0">
                    <EmptyState icon={AlertCircle} title="Could not load the report" description={query.errorMessage} action={<Button variant="outline" size="sm" onClick={query.refresh}>Try again</Button>} />
                  </TableCell>
                </TableRow>
              ) : null}

              {!query.loading && !query.error && rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns} className="p-0">
                    <EmptyState icon={CalendarDays} title="No attendance matches these filters" description="Try a wider date range or clear the status and student filters." />
                  </TableCell>
                </TableRow>
              ) : null}

              {view === 'sessions'
                ? rows.map((row) => (
                    <TableRow key={`${row.classId}-${row.date}`} className={cn(row.belowWarning && 'bg-warning/5')}>
                      <TableCell className="whitespace-nowrap font-medium">{formatDay(row.date)}</TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap font-mono text-xs">{row.code}</span>
                        <ArchivedBadge show={row.archived} />
                        <p className="text-xs text-muted-foreground">
                          {row.name} · {row.semester}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{row.faculty}</TableCell>
                      <TableCell className="text-end tabular-nums">{row.enrolled}</TableCell>
                      <TableCell>
                        <Counts row={row} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <RateCell rate={row.rate} attended={row.attended} marked={row.eligible} />
                          {row.belowWarning ? (
                            <Badge variant="warning">
                              <AlertTriangle className="me-1 h-3 w-3" aria-hidden="true" />
                              Below {policy.sessionWarningRate}%
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                : null}

              {view === 'students'
                ? rows.map((row) => (
                    <TableRow key={`${row.studentId}-${row.classId}`}>
                      <TableCell>
                        <p className="font-medium">{row.studentName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{row.studentNumber}</p>
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap font-mono text-xs">{row.code}</span>
                        <ArchivedBadge show={row.archived} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <span className={cn('text-base font-semibold', row.absent >= policy.riskMinUnexcusedAbsences && 'text-destructive')}>{row.absent}</span>
                        <span className="text-xs text-muted-foreground"> unexcused</span>
                      </TableCell>
                      <TableCell>{row.marked ? <Counts row={row} /> : <span className="text-xs text-muted-foreground">No history yet</span>}</TableCell>
                      <TableCell>
                        <RateCell rate={row.rate} attended={row.attended} marked={row.eligible} />
                      </TableCell>
                      <TableCell>
                        {row.atRisk ? (
                          <div className="space-y-1">
                            <Badge variant="destructive">At risk</Badge>
                            <p className="max-w-[220px] text-xs text-muted-foreground">{row.riskText}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                : null}

              {view === 'records'
                ? rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatDay(row.date)}</TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap font-mono text-xs">{row.code}</span>
                        <ArchivedBadge show={row.archived} />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{row.studentName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{row.studentNumber}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_META[row.status]?.variant ?? 'secondary'}>{STATUS_META[row.status]?.label ?? row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{row.source === 'qr' ? 'QR check-in' : row.source}</TableCell>
                      <TableCell className="text-sm">{row.markedBy}</TableCell>
                    </TableRow>
                  ))
                : null}
            </TableBody>
          </Table>

          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            from={from}
            to={to}
            total={pagination.total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={query.loading}
          />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
