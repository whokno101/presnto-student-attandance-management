import { useEffect, useState } from 'react'
import { AlertCircle, ClipboardList, Eye, History, RotateCcw } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import FilterSelect, { DateFilter } from '@/components/common/FilterSelect'
import PageHeader from '@/components/common/PageHeader'
import SearchInput from '@/components/common/SearchInput'
import TablePagination from '@/components/common/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useApiQuery, { useDebounced } from '@/hooks/useApiQuery'
import useFilterOptions from '@/hooks/useFilterOptions'
import usePolicy from '@/hooks/usePolicy'
import { DEPARTMENTS } from '@/lib/constants'
import { formatDateTime, formatHours } from '@/lib/format'
import { formatDay } from '@/lib/attendance'
import { cn } from '@/lib/utils'
import { getActivity, listActionCategories, listActivity, listSubmissions } from '@/services/audit'

const PAGE_SIZE = 25
const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }))

const OUTCOME_BADGE = {
  success: null,
  failure: { variant: 'warning', label: 'Rejected' },
  denied: { variant: 'destructive', label: 'Denied' },
}

/** Readable label for a dotted action id: attendance.status_changed -> Status changed */
const actionLabel = (action) => {
  const verb = action.split('.').slice(1).join(' ').replace(/_/g, ' ')
  return verb.charAt(0).toUpperCase() + verb.slice(1)
}

const SUBMISSION_STATUS = {
  on_time: { label: 'On time', variant: 'success' },
  late: { label: 'Late', variant: 'warning' },
  pending: { label: 'Pending', variant: 'secondary' },
  missing: { label: 'Missing', variant: 'destructive' },
}

function ResetButton({ onClick, disabled }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={disabled} className="self-end">
      <RotateCcw className="h-4 w-4" />
      Reset filters
    </Button>
  )
}

function LoadingRows({ columns }) {
  return Array.from({ length: 6 }).map((_, index) => (
    <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
      <TableCell colSpan={columns}>
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
      </TableCell>
    </TableRow>
  ))
}

/* ------------------------------------------------------------------ *
 *   Activity
 * ------------------------------------------------------------------ */

const EMPTY_ACTIVITY_FILTERS = { facultyId: '', department: '', category: '', classId: '', from: '', to: '' }

function ActivityTab({ timeZone, faculty, classes }) {
  const [filters, setFilters] = useState(EMPTY_ACTIVITY_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounced(searchInput)
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState([])
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    listActionCategories().then(setCategories).catch(() => {})
  }, [])

  useEffect(() => setPage(1), [filters, search])

  const query = useApiQuery(listActivity, { ...filters, search, page, limit: PAGE_SIZE })
  const rows = query.data?.data ?? []
  const pagination = query.data?.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE }
  const setFilter = (field) => (value) => setFilters((prev) => ({ ...prev, [field]: value }))
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_ACTIVITY_FILTERS) || searchInput

  const openDetail = async (row) => {
    setDetail({ ...row, loading: true })
    try {
      setDetail(await getActivity(row.id))
    } catch {
      setDetail({ ...row, loading: false })
    }
  }

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const to = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect id="activity-faculty" label="Faculty member" value={filters.facultyId} onChange={setFilter('facultyId')} options={faculty} allLabel="All faculty" />
          <FilterSelect id="activity-department" label="Department" value={filters.department} onChange={setFilter('department')} options={DEPARTMENT_OPTIONS} allLabel="All departments" />
          <FilterSelect id="activity-category" label="Action type" value={filters.category} onChange={setFilter('category')} options={categories.map((c) => ({ value: c.value, label: c.label }))} allLabel="All actions" />
          <FilterSelect id="activity-class" label="Class" value={filters.classId} onChange={setFilter('classId')} options={classes} allLabel="All classes" />
          <DateFilter id="activity-from" label="From" value={filters.from} onChange={setFilter('from')} max={filters.to || undefined} />
          <DateFilter id="activity-to" label="To" value={filters.to} onChange={setFilter('to')} min={filters.from || undefined} />
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-5">
            <label htmlFor="activity-search" className="mb-1.5 block text-sm font-medium">
              Search descriptions
            </label>
            <SearchInput id="activity-search" value={searchInput} onChange={setSearchInput} onSubmit={() => {}} placeholder="e.g. a student name or class code" />
          </div>
          <ResetButton
            onClick={() => {
              setFilters(EMPTY_ACTIVITY_FILTERS)
              setSearchInput('')
            }}
            disabled={!dirty}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {query.loading && !query.data ? 'Loading activity…' : `${pagination.total} matching ${pagination.total === 1 ? 'entry' : 'entries'}`}
            {filters.from || filters.to ? ` · ${filters.from || 'start'} to ${filters.to || 'today'}` : ''}
          </p>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-end">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.loading && !query.data ? <LoadingRows columns={6} /> : null}
              {query.error ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={AlertCircle}
                      title="Could not load the activity log"
                      description={query.errorMessage}
                      action={<Button variant="outline" size="sm" onClick={query.refresh}>Try again</Button>}
                    />
                  </TableCell>
                </TableRow>
              ) : null}
              {!query.loading && !query.error && rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState icon={History} title="No activity found" description="No entries match these filters. Try widening the date range." />
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => {
                const outcome = OUTCOME_BADGE[row.outcome]
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateTime(row.createdAt, timeZone)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.actor.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{row.actor.role}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm">{actionLabel(row.action)}</span>
                      {outcome ? (
                        <Badge variant={outcome.variant} className="ms-2">
                          {outcome.label}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.classCode ?? '—'}</TableCell>
                    <TableCell className="min-w-[260px] text-sm">{row.summary}</TableCell>
                    <TableCell className="text-end">
                      <Button variant="ghost" size="icon" onClick={() => openDetail(row)} aria-label={`View details: ${row.summary}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
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

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail ? actionLabel(detail.action) : ''}</DialogTitle>
            <DialogDescription>{detail?.summary}</DialogDescription>
          </DialogHeader>
          {detail ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">When</dt>
              <dd>{formatDateTime(detail.createdAt, timeZone)}</dd>
              <dt className="text-muted-foreground">Who</dt>
              <dd>
                {detail.actor.name} <span className="capitalize text-muted-foreground">({detail.actor.role})</span>
              </dd>
              <dt className="text-muted-foreground">Action</dt>
              <dd className="font-mono text-xs">{detail.action}</dd>
              <dt className="text-muted-foreground">Outcome</dt>
              <dd className="capitalize">{detail.outcome}</dd>
              {detail.entityType ? (
                <>
                  <dt className="text-muted-foreground">Record</dt>
                  <dd className="break-all font-mono text-xs">
                    {detail.entityType} {detail.entityId}
                  </dd>
                </>
              ) : null}
              {detail.classCode ? (
                <>
                  <dt className="text-muted-foreground">Class</dt>
                  <dd>{detail.classCode}</dd>
                </>
              ) : null}
              {detail.department ? (
                <>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd>{detail.department}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {detail?.changes?.length ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Field</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.changes.map((change) => (
                    <TableRow key={change.field}>
                      <TableCell className="font-medium">{change.field}</TableCell>
                      <TableCell>{change.from == null ? '—' : String(change.from)}</TableCell>
                      <TableCell>{change.to == null ? '—' : String(change.to)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *   Submissions
 * ------------------------------------------------------------------ */

const EMPTY_SUBMISSION_FILTERS = { facultyId: '', department: '', classId: '', status: '', from: '', to: '' }
const STATUS_OPTIONS = Object.entries(SUBMISSION_STATUS).map(([value, meta]) => ({ value, label: meta.label }))

function SubmissionsTab({ timeZone, faculty, classes, overdueAfterHours }) {
  const [filters, setFilters] = useState(EMPTY_SUBMISSION_FILTERS)
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [filters])

  const query = useApiQuery(listSubmissions, { ...filters, page, limit: PAGE_SIZE })
  const rows = query.data?.data ?? []
  const summary = query.data?.summary
  const range = query.data?.range
  const pagination = query.data?.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE }
  const setFilter = (field) => (value) => setFilters((prev) => ({ ...prev, [field]: value }))
  const facultyClasses = classes

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const to = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect id="sub-faculty" label="Faculty member" value={filters.facultyId} onChange={setFilter('facultyId')} options={faculty} allLabel="All faculty" />
          <FilterSelect id="sub-department" label="Department" value={filters.department} onChange={setFilter('department')} options={DEPARTMENT_OPTIONS} allLabel="All departments" />
          <FilterSelect id="sub-class" label="Class" value={filters.classId} onChange={setFilter('classId')} options={facultyClasses} allLabel="All classes" />
          <FilterSelect id="sub-status" label="Status" value={filters.status} onChange={setFilter('status')} options={STATUS_OPTIONS} allLabel="Any status" />
          <DateFilter id="sub-from" label="From" value={filters.from} onChange={setFilter('from')} max={filters.to || undefined} />
          <DateFilter id="sub-to" label="To" value={filters.to} onChange={setFilter('to')} min={filters.from || undefined} />
          <div className="flex justify-end sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <ResetButton onClick={() => setFilters(EMPTY_SUBMISSION_FILTERS)} disabled={JSON.stringify(filters) === JSON.stringify(EMPTY_SUBMISSION_FILTERS)} />
          </div>
        </CardContent>
      </Card>

      {summary ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Submission summary">
          {Object.entries(SUBMISSION_STATUS).map(([status, meta]) => (
            <li key={status}>
              <button
                type="button"
                onClick={() => setFilter('status')(filters.status === status ? '' : status)}
                aria-pressed={filters.status === status}
                className={cn(
                  'w-full rounded-lg border bg-card p-4 text-start transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filters.status === status && 'ring-2 ring-ring'
                )}
              >
                <p className="text-2xl font-semibold tabular-nums">{summary[status]}</p>
                <Badge variant={meta.variant} className="mt-1">
                  {meta.label}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {range ? `Sessions from ${range.from} to ${range.to}. ` : ''}
            Attendance is due when the session ends; it is flagged <strong className="text-destructive">Missing</strong> once
            still unsubmitted {overdueAfterHours} hours after that deadline.
          </p>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Session</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Faculty</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.loading && !query.data ? <LoadingRows columns={6} /> : null}
              {query.error ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState icon={AlertCircle} title="Could not load submissions" description={query.errorMessage} action={<Button variant="outline" size="sm" onClick={query.refresh}>Try again</Button>} />
                  </TableCell>
                </TableRow>
              ) : null}
              {!query.loading && !query.error && rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState icon={ClipboardList} title="No sessions found" description="No scheduled sessions match these filters in this date range." />
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => {
                const meta = SUBMISSION_STATUS[row.status]
                return (
                  <TableRow key={`${row.classId}-${row.date}`} className={cn(row.status === 'missing' && 'bg-destructive/5')}>
                    <TableCell className="whitespace-nowrap">
                      <p className="text-sm font-medium">{formatDay(row.date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.startTime}–{row.endTime}
                        {row.room ? ` · ${row.room}` : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{row.code}</span>
                      {row.archived ? (
                        <Badge variant="secondary" className="ms-2">
                          Archived
                        </Badge>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{row.name}</p>
                    </TableCell>
                    <TableCell className="text-sm">{row.faculty?.name ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateTime(row.deadline, timeZone)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {row.submittedAt ? (
                        <>
                          {formatDateTime(row.submittedAt, timeZone)}
                          <p className="text-xs text-muted-foreground">
                            {row.marked} of {row.enrolled} marked
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Not submitted</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {row.status === 'late' ? <p className="mt-1 text-xs text-muted-foreground">{formatHours(row.hoursLate)} after deadline</p> : null}
                      {row.status === 'missing' ? <p className="mt-1 text-xs font-medium">{formatHours(row.hoursLate)} overdue</p> : null}
                    </TableCell>
                  </TableRow>
                )
              })}
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
    </div>
  )
}

export default function ActivityLog() {
  const policy = usePolicy()
  const { faculty, classes } = useFilterOptions()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity Log"
        description="Who did what, and when: attendance changes, record management and destructive actions. Entries cannot be edited or deleted."
      />
      <Tabs defaultValue="activity">
        <TabsList aria-label="Activity log views">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="submissions">Submission timeliness</TabsTrigger>
        </TabsList>
        <TabsContent value="activity">
          <ActivityTab timeZone={policy.timeZone} faculty={faculty} classes={classes} />
        </TabsContent>
        <TabsContent value="submissions">
          <SubmissionsTab timeZone={policy.timeZone} faculty={faculty} classes={classes} overdueAfterHours={policy.overdueAfterHours} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
