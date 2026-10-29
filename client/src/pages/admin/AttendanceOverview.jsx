import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BarChart3, BookOpen, Users } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import RateCell from '@/components/common/RateCell'
import SearchInput from '@/components/common/SearchInput'
import StatCard from '@/components/common/StatCard'
import TablePagination from '@/components/common/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getErrorMessage } from '@/lib/api'
import { percentTone, TONE_BADGE } from '@/lib/attendance'
import { PAGE_SIZES, DEFAULT_PAGE_SIZE } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { getAttendanceOverview } from '@/services/attendance'

const CLASS_COLUMNS = 5
const STUDENT_COLUMNS = 5

/** Default: worst attendance first — that is what an admin looks for. */
const INITIAL_SORT = { key: 'rate', dir: 'asc' }

/** Student table columns — every one maps to a server-side sort key. */
const SORTABLE_COLUMNS = [
  { key: 'studentId', label: 'Student ID' },
  { key: 'name', label: 'Name' },
  { key: 'department', label: 'Department' },
  { key: 'classes', label: 'Classes' },
  { key: 'rate', label: 'Rate' },
]

export default function AttendanceOverview() {
  const [overview, setOverview] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState(INITIAL_SORT)
  const [reloadKey, setReloadKey] = useState(0)

  // Same 300ms debounce the other admin tables use; Enter bypasses it.
  useEffect(() => {
    if (searchInput === search) return undefined

    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput, search])

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)

    getAttendanceOverview({ search, page, limit, sort: sort.key, order: sort.dir })
      .then((result) => {
        if (!active) return
        setOverview(result.data)
        setPagination(result.pagination ?? { page, limit, total: 0, totalPages: 1 })
      })
      .catch((err) => {
        if (!active) return
        setOverview(null)
        setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [search, page, limit, sort, reloadKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'rate' ? 'asc' : 'desc' }
    )

  const changeLimit = (nextLimit) => {
    setLimit(Number(nextLimit))
    setPage(1)
  }

  const overall = overview?.overall
  const bands = overview?.bands ?? { total: 0, noData: 0, green: 0, amber: 0, red: 0 }
  const classes = overview?.byClass ?? []
  const students = overview?.byStudent ?? []
  const tone = percentTone(overall?.rate ?? 0)

  const total = pagination.total ?? 0
  const from = total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const to = Math.min(pagination.page * pagination.limit, total)

  const showEmpty = !loading && students.length === 0

  const statCards = [
    {
      key: 'overall',
      icon: BarChart3,
      label: 'Overall Attendance Rate',
      value: `${overall?.rate ?? 0}%`,
      hint: `${overall?.attended ?? 0} attended of ${overall?.marked ?? 0} marked`,
      tone: 4,
    },
    {
      key: 'classes',
      icon: BookOpen,
      label: 'Classes',
      value: classes.length,
      hint: `${classes.filter((c) => c.marked > 0 && c.rate >= 90).length} above 90%`,
      tone: 3,
    },
    {
      key: 'risk',
      icon: AlertTriangle,
      label: 'Students at Risk (< 75%)',
      value: bands.red,
      hint: `of ${bands.total} students`,
      tone: 5,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Overview"
        description="Attendance rates across every class and student. Green is 90% or above, amber 75-89%, red below 75%."
        action={
          overall && overall.marked > 0 ? (
            <Badge variant={TONE_BADGE[tone]} className="text-sm">
              {overall.rate}% overall
            </Badge>
          ) : null
        }
      />

      {error ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={AlertCircle}
              title="Could not load the overview"
              description={getErrorMessage(error)}
              action={
                <Button variant="outline" size="sm" onClick={reload}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {statCards.map((card) => (
          <StatCard
            key={card.key}
            icon={card.icon}
            label={card.label}
            value={card.value}
            hint={card.hint}
            tone={card.tone}
            loading={loading && !overview}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Class</CardTitle>
          <CardDescription>Attendance rate and roster size for every class on the timetable.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <Table stack={false}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-4 sm:ps-6">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Faculty</TableHead>
                <TableHead className="text-end">Students</TableHead>
                <TableHead className="pe-4 sm:pe-6">Rate</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading && classes.length === 0
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`class-skeleton-${index}`} className="hover:bg-transparent">
                      <TableCell colSpan={CLASS_COLUMNS} className="px-4 sm:px-6">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                : null}

              {!loading && classes.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={CLASS_COLUMNS} className="p-0">
                    <EmptyState icon={BookOpen} title="No classes yet" description="Create a class to start tracking attendance." />
                  </TableCell>
                </TableRow>
              ) : null}

              {classes.map((classDoc) => (
                <TableRow key={classDoc.classId}>
                  <TableCell className="ps-4 font-mono text-xs font-medium sm:ps-6">{classDoc.code}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-medium">{classDoc.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{classDoc.faculty}</TableCell>
                  <TableCell className="text-end tabular-nums">{classDoc.students}</TableCell>
                  <TableCell className="pe-4 sm:pe-6">
                    <RateCell rate={classDoc.rate} attended={classDoc.attended} marked={classDoc.marked} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Student</CardTitle>
          <CardDescription>
            {bands.green} on track · {bands.amber} watch · {bands.red} at risk
            {bands.noData ? ` · ${bands.noData} not marked yet` : ''} (of {bands.total} matching)
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              onSubmit={() => {
                setSearch(searchInput)
                setPage(1)
              }}
              placeholder="Search by name or student ID..."
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows</span>
              <Select value={String(limit)} onValueChange={changeLimit}>
                <SelectTrigger className="w-[80px]" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {SORTABLE_COLUMNS.map((column) => {
                  const activeSort = sort.key === column.key
                  const Icon = !activeSort ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown

                  return (
                    <TableHead key={column.key} className={cn(column.key === 'classes' && 'text-center')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn('-ms-3 h-8 px-2', activeSort && 'text-foreground')}
                        onClick={() => toggleSort(column.key)}
                        aria-label={`Sort by ${column.label}`}
                      >
                        {column.label}
                        <Icon className={cn('ms-1 h-3.5 w-3.5', !activeSort && 'text-muted-foreground/60')} aria-hidden="true" />
                      </Button>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading && students.length === 0
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`student-skeleton-${index}`} className="hover:bg-transparent">
                      <TableCell colSpan={STUDENT_COLUMNS}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                : null}

              {showEmpty ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={STUDENT_COLUMNS} className="p-0">
                    <EmptyState
                      icon={Users}
                      title="No results found"
                      description={
                        searchInput
                          ? `No students match “${searchInput}”. Try a different search.`
                          : 'No students have been enrolled yet.'
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : null}

              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-mono text-xs font-medium">{student.studentId}</TableCell>
                  <TableCell className="max-w-[200px] truncate font-medium">{student.name}</TableCell>
                  <TableCell className="text-muted-foreground">{student.department}</TableCell>
                  <TableCell className="text-center tabular-nums">{student.classes}</TableCell>
                  <TableCell>
                    <RateCell rate={student.rate} attended={student.attended} marked={student.marked} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            from={from}
            to={to}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            disabled={loading}
          />
        </CardContent>
      </Card>
    </div>
  )
}
