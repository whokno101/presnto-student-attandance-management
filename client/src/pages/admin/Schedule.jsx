import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, CalendarPlus, CheckCircle2, Loader2, RotateCcw, Trash2, Undo2, X } from 'lucide-react'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import FilterSelect, { DateFilter } from '@/components/common/FilterSelect'
import PageHeader from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import useApiQuery from '@/hooks/useApiQuery'
import useFilterOptions from '@/hooks/useFilterOptions'
import { useToast } from '@/hooks/use-toast'
import { getErrorDetails, getErrorMessage } from '@/lib/api'
import { formatDay, toYmd } from '@/lib/attendance'
import { DAYS, DAY_ABBR } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { cancelSession, createSchedule, listSchedule, previewSchedule } from '@/services/schedule'
import { listClasses } from '@/services/classes'

const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const EMPTY_FORM = { classId: '', room: '', startTime: '09:00', endTime: '10:30', weekly: [], from: '', to: '' }

function TimeField({ id, label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <Input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function Schedule() {
  const { toast } = useToast()
  const { classes } = useFilterOptions({ includeArchived: false })
  const [classRooms, setClassRooms] = useState({})
  const [form, setForm] = useState(EMPTY_FORM)
  const [dates, setDates] = useState([])
  const [preview, setPreview] = useState(null)
  const [removed, setRemoved] = useState(new Set())
  const [busy, setBusy] = useState(null)
  const [formError, setFormError] = useState(null)
  const [conflicts, setConflicts] = useState(null)
  const [cancelling, setCancelling] = useState({ open: false, session: null, loading: false })
  const [listClass, setListClass] = useState('')

  useEffect(() => {
    listClasses({ limit: 100, status: 'active' })
      .then((res) => setClassRooms(Object.fromEntries(res.data.map((c) => [c.id, c.room]))))
      .catch(() => {})
  }, [])

  const upcoming = useApiQuery(listSchedule, listClass ? { classId: listClass } : {})
  const set = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setPreview(null)
  }

  const pickClass = (classId) => {
    setForm((prev) => ({ ...prev, classId, room: prev.room || classRooms[classId] || '' }))
    setPreview(null)
  }

  const toggleWeekday = (day) =>
    set('weekly')(form.weekly.includes(day) ? form.weekly.filter((d) => d !== day) : [...form.weekly, day])

  const payload = () => ({
    classId: form.classId,
    room: form.room.trim().toUpperCase() || undefined,
    startTime: form.startTime,
    endTime: form.endTime,
    dates: dates.map(toYmd),
    recurrence: form.weekly.length && form.from && form.to ? { days: form.weekly, from: form.from, to: form.to } : null,
  })

  const validate = () => {
    if (!form.classId) return 'Choose a class'
    if (!form.startTime || !form.endTime) return 'Enter a start and end time'
    if (form.endTime <= form.startTime) return 'End time must be after start time'
    if (form.weekly.length && (!form.from || !form.to)) return 'Choose a start and end date for the weekly pattern'
    if (!dates.length && !form.weekly.length) return 'Pick at least one date or a weekly pattern'
    return null
  }

  const runPreview = async () => {
    const problem = validate()
    setFormError(problem)
    if (problem) return
    setBusy('preview')
    try {
      setPreview(await previewSchedule(payload()))
      setRemoved(new Set())
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const kept = useMemo(() => (preview ? preview.occurrences.filter((o) => !removed.has(o.date)) : []), [preview, removed])
  const blocked = kept.filter((o) => !o.ok)

  const save = async () => {
    setBusy('save')
    try {
      const res = await createSchedule({ ...payload(), recurrence: undefined, dates: kept.map((o) => o.date) })
      toast({ title: res.message, description: `${preview.class.code}: ${res.data.saved.length} dates booked in ${kept[0].room}.`, variant: 'success' })
      setPreview(null)
      setDates([])
      setForm((prev) => ({ ...EMPTY_FORM, classId: prev.classId, room: prev.room }))
      upcoming.refresh()
    } catch (err) {
      if (err?.response?.status === 409 && getErrorDetails(err).length) {
        setConflicts({ message: getErrorMessage(err), details: getErrorDetails(err) })
        runPreview()
      } else {
        toast({ title: 'Could not save the schedule', description: getErrorMessage(err), variant: 'destructive' })
      }
    } finally {
      setBusy(null)
    }
  }

  const doCancel = async () => {
    setCancelling((prev) => ({ ...prev, loading: true }))
    try {
      await cancelSession(cancelling.session.id)
      toast({ title: 'Session cancelled', description: 'The room and teacher are free again for that slot.', variant: 'success' })
      setCancelling({ open: false, session: null, loading: false })
      upcoming.refresh()
    } catch (err) {
      toast({ title: 'Could not cancel', description: getErrorMessage(err), variant: 'destructive' })
      setCancelling((prev) => ({ ...prev, loading: false }))
    }
  }

  const sessions = upcoming.data?.data ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Schedule" description="Book class sessions on several dates at once. Every date is checked for room and teacher clashes before anything is saved." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New sessions</CardTitle>
          <CardDescription>Choose individual dates, a weekly pattern, or both. You can remove any date from the preview.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect id="schedule-class" label="Class" value={form.classId} onChange={pickClass} options={classes} allLabel="Choose a class" />
            <div className="space-y-1.5">
              <label htmlFor="schedule-room" className="text-sm font-medium leading-none">
                Room
              </label>
              <Input id="schedule-room" value={form.room} onChange={(e) => set('room')(e.target.value.toUpperCase())} placeholder="B-204" className="uppercase" />
            </div>
            <TimeField id="schedule-start" label="Start time" value={form.startTime} onChange={set('startTime')} />
            <TimeField id="schedule-end" label="End time" value={form.endTime} onChange={set('endTime')} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <fieldset className="space-y-2 rounded-md border p-4">
              <legend className="px-1 text-sm font-medium">Individual dates</legend>
              <Calendar
                mode="multiple"
                selected={dates}
                onSelect={(value) => {
                  setDates(value ?? [])
                  setPreview(null)
                }}
                disabled={{ before: today() }}
                className="rounded-md border"
              />
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {dates.length ? `${dates.length} date${dates.length === 1 ? '' : 's'} selected` : 'No individual dates selected'}
              </p>
            </fieldset>

            <fieldset className="space-y-3 rounded-md border p-4">
              <legend className="px-1 text-sm font-medium">Weekly pattern</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Weekdays">
                {DAYS.map((day) => {
                  const on = form.weekly.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleWeekday(day)}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                      )}
                    >
                      <span aria-hidden="true">{DAY_ABBR[day]}</span>
                      <span className="sr-only">{day}</span>
                    </button>
                  )
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DateFilter id="schedule-from" label="From" value={form.from} onChange={set('from')} min={toYmd(today())} max={form.to || undefined} />
                <DateFilter id="schedule-to" label="To" value={form.to} onChange={set('to')} min={form.from || toYmd(today())} />
              </div>
            </fieldset>
          </div>

          {formError ? (
            <p role="alert" className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={runPreview} disabled={busy === 'preview'}>
              {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Preview dates
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(EMPTY_FORM)
                setDates([])
                setPreview(null)
                setFormError(null)
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Clear
            </Button>
          </div>

          {preview ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {preview.class.code} — {preview.class.name} · {preview.class.instructor ?? 'no teacher assigned'}
                  </p>
                  <p className="text-muted-foreground" aria-live="polite">
                    {kept.length} of {preview.occurrences.length} dates kept · {blocked.length ? `${blocked.length} conflict${blocked.length === 1 ? '' : 's'} — remove ${blocked.length === 1 ? 'it' : 'them'} to save` : 'no conflicts'}
                  </p>
                </div>
                <Button onClick={save} disabled={!kept.length || blocked.length > 0 || busy === 'save'}>
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save {kept.length} session{kept.length === 1 ? '' : 's'}
                </Button>
              </div>
              <div className="max-h-96 overflow-auto rounded-md border">
                <Table>
                  <caption className="sr-only">Proposed sessions</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Check</TableHead>
                      <TableHead className="text-right">Keep</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.occurrences.map((o) => {
                      const isRemoved = removed.has(o.date)
                      return (
                        <TableRow key={o.date} className={cn(isRemoved && 'opacity-50')}>
                          <TableCell className="whitespace-nowrap font-medium">{formatDay(o.date)}</TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {o.startTime}–{o.endTime}
                          </TableCell>
                          <TableCell>{o.room}</TableCell>
                          <TableCell className="min-w-[240px] text-sm">
                            {o.ok ? (
                              <Badge variant="success">
                                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                                Available
                              </Badge>
                            ) : (
                              <>
                                <Badge variant="destructive">
                                  <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                                  Conflict
                                </Badge>
                                {o.conflicts.map((c) => (
                                  <p key={`${c.type}-${c.sessionId}`} className="mt-1 text-xs">
                                    {c.reason}
                                  </p>
                                ))}
                              </>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const next = new Set(removed)
                                if (isRemoved) next.delete(o.date)
                                else next.add(o.date)
                                setRemoved(next)
                              }}
                              aria-label={`${isRemoved ? 'Keep' : 'Remove'} ${formatDay(o.date)}`}
                            >
                              {isRemoved ? <Undo2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                              {isRemoved ? 'Keep' : 'Remove'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Upcoming sessions</CardTitle>
            <CardDescription>The next 90 days.</CardDescription>
          </div>
          <FilterSelect id="schedule-list-class" label="Class" value={listClass} onChange={setListClass} options={classes} allLabel="All classes" className="sm:w-64" />
        </CardHeader>
        <CardContent className="p-0 sm:px-6 sm:pb-6">
          {upcoming.error ? <EmptyState icon={AlertCircle} title="Could not load sessions" description={upcoming.errorMessage} /> : null}
          {!upcoming.loading && !upcoming.error && !sessions.length ? (
            <EmptyState icon={CalendarPlus} title="No sessions scheduled" description="Sessions you save above will appear here." />
          ) : null}
          {sessions.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap font-medium">{formatDay(s.date)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {s.startTime}–{s.endTime}
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap font-mono text-xs">{s.classCode}</span> <span className="text-muted-foreground">{s.className}</span>
                    </TableCell>
                    <TableCell>{s.room}</TableCell>
                    <TableCell>{s.instructor ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setCancelling({ open: true, session: s, loading: false })}
                        aria-label={`Cancel ${s.classCode} on ${formatDay(s.date)}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(conflicts)} onOpenChange={(open) => !open && setConflicts(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule not saved</DialogTitle>
            <DialogDescription>{conflicts?.message}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {conflicts?.details.map((d) => (
              <li key={d.field} className="rounded-md border p-3">
                <p className="font-medium">{formatDay(d.field)}</p>
                <p className="text-muted-foreground">{d.message}</p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setConflicts(null)}>Review the dates</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelling.open}
        onOpenChange={(open) => setCancelling((prev) => ({ ...prev, open }))}
        title="Cancel this session?"
        description={
          cancelling.session
            ? `${cancelling.session.classCode} on ${formatDay(cancelling.session.date)}, ${cancelling.session.startTime}–${cancelling.session.endTime} in ${cancelling.session.room}. The booking is kept as history and the slot becomes free.`
            : ''
        }
        confirmLabel="Cancel session"
        cancelLabel="Keep it"
        destructive
        loading={cancelling.loading}
        onConfirm={doCancel}
      />
    </div>
  )
}
