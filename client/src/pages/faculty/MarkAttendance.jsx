import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCheck, Loader2, Save, Users } from 'lucide-react'

import DatePicker from '@/components/common/DatePicker'
import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { formatDay, STATUS_META, STATUS_ORDER, toYmd } from '@/lib/attendance'
import { formatSchedule } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { getClassAttendance, markAttendance } from '@/services/attendance'
import { listClasses, listMyClasses } from '@/services/classes'

const DEFAULT_STATUS = 'present'

export default function MarkAttendance() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [classes, setClasses] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(() => new Date())

  const [sheet, setSheet] = useState(null)
  const [marks, setMarks] = useState({})
  const [loadingSheet, setLoadingSheet] = useState(false)
  const [sheetError, setSheetError] = useState(null)
  const [saving, setSaving] = useState(false)
  // Switching class/date quickly must not let a slower, older response win.
  const sheetRequest = useRef(0)

  const day = useMemo(() => toYmd(date), [date])
  const selectedClass = classes.find((item) => item.id === classId) || null

  // Admins see every class; faculty only the ones assigned to them.
  useEffect(() => {
    let active = true

    const load = async () => {
      setLoadingClasses(true)
      try {
        const rows =
          user?.role === 'admin'
            ? (await listClasses({ limit: 100 })).data
            : await listMyClasses()

        if (!active) return
        setClasses(rows)
        setClassId((current) => current || rows[0]?.id || '')
      } catch (error) {
        if (active) {
          toast({
            title: 'Could not load your classes',
            description: getErrorMessage(error),
            variant: 'destructive',
          })
        }
      } finally {
        if (active) setLoadingClasses(false)
      }
    }

    load()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role])

  const loadSheet = useCallback(
    async (targetClassId, targetDay) => {
      const request = sheetRequest.current + 1
      sheetRequest.current = request

      if (!targetClassId) {
        setSheet(null)
        return
      }

      setLoadingSheet(true)
      setSheetError(null)
      try {
        const data = await getClassAttendance(targetClassId, targetDay)
        if (sheetRequest.current !== request) return
        setSheet(data)
        setMarks(
          Object.fromEntries(data.students.map((student) => [student.id, student.status || DEFAULT_STATUS]))
        )
      } catch (error) {
        if (sheetRequest.current !== request) return
        setSheet(null)
        setSheetError(error)
      } finally {
        if (sheetRequest.current === request) setLoadingSheet(false)
      }
    },
    []
  )

  useEffect(() => {
    loadSheet(classId, day)
  }, [classId, day, loadSheet])

  const setStatus = (studentId, status) => {
    setMarks((prev) => ({ ...prev, [studentId]: status }))
  }

  const markAllPresent = () => {
    if (!sheet) return
    setMarks(Object.fromEntries(sheet.students.map((student) => [student.id, DEFAULT_STATUS])))
  }

  const handleSave = async () => {
    if (!sheet || sheet.students.length === 0) return

    const records = sheet.students.map((student) => ({
      studentId: student.id,
      status: marks[student.id] || DEFAULT_STATUS,
    }))

    setSaving(true)
    try {
      const response = await markAttendance({ classId: classId, date: day, records })
      const { summary } = response.data

      toast({
        title: 'Attendance saved',
        description: `${summary.present} present · ${summary.late} late · ${summary.absent} absent`,
        variant: 'success',
      })

      await loadSheet(classId, day)
    } catch (error) {
      toast({
        title: 'Could not save attendance',
        description: getErrorMessage(error),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const renderBody = () => {
    if (loadingClasses) {
      return (
        <Card>
          <CardContent className="p-6">
            <div className="h-24 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      )
    }

    if (classes.length === 0) {
      return (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="No classes to mark"
              description={
                user?.role === 'admin'
                  ? 'Create a class and assign a faculty member first.'
                  : 'An administrator has not assigned any classes to you yet.'
              }
            />
          </CardContent>
        </Card>
      )
    }

    if (loadingSheet) {
      return (
        <Card>
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`skeleton-${index}`} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )
    }

    if (sheetError) {
      return (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={AlertCircle}
              title="Could not load the roster"
              description={getErrorMessage(sheetError)}
              action={
                <Button variant="outline" size="sm" onClick={() => loadSheet(classId, day)}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      )
    }

    if (!sheet) return null

    if (sheet.students.length === 0) {
      return (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="No students enrolled"
              description={`${sheet.code} has no students on its roster yet.`}
            />
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {sheet.code} — {sheet.name}
            </CardTitle>
            <CardDescription>
              {formatDay(sheet.date)} · {sheet.students.length} enrolled
              {sheet.marked > 0 ? ` · ${sheet.marked} already marked` : ''}
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={markAllPresent}>
              <CheckCheck className="h-4 w-4" />
              Mark all present
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save attendance
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0 pb-4 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Student</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {sheet.students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <p className="font-medium">{student.name}</p>
                    <p className="text-xs text-muted-foreground">{student.department}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {student.studentId}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <div
                        className="inline-flex rounded-md border p-0.5"
                        role="group"
                        aria-label={`Attendance for ${student.name}`}
                      >
                        {STATUS_ORDER.map((status) => {
                          const active = (marks[student.id] || DEFAULT_STATUS) === status
                          return (
                            <button
                              key={status}
                              type="button"
                              aria-pressed={active}
                              aria-label={`${STATUS_META[status].label} for ${student.name}`}
                              onClick={() => setStatus(student.id, status)}
                              className={cn(
                                'rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                                active
                                  ? STATUS_META[status].active
                                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                              )}
                            >
                              {STATUS_META[status].label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mark Attendance"
        description="Pick a class and a date, then mark every student present, late or absent."
      />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <Label htmlFor="mark-class">Class</Label>
            <Select value={classId} onValueChange={setClassId} disabled={classes.length === 0}>
              <SelectTrigger id="mark-class">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} — {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedClass ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-normal">
                  {formatSchedule(selectedClass.schedule)}
                </Badge>
                {selectedClass.enrolled} enrolled
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mark-date">Date</Label>
            <DatePicker
              id="mark-date"
              value={date}
              onChange={setDate}
              maxDate={new Date()}
              disabled={classes.length === 0}
            />
            <p className="text-xs text-muted-foreground">Re-saving a day updates the existing marks.</p>
          </div>
        </CardContent>
      </Card>

      {renderBody()}
    </div>
  )
}
