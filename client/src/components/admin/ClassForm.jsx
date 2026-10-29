import { useCallback } from 'react'

import FormDialog from '@/components/common/FormDialog'
import FormField from '@/components/common/FormField'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import useFormState from '@/hooks/useFormState'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { DAYS, DAY_ABBR, DEPARTMENTS, SEMESTERS, meetingsOf, withCurrent } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { createClass, updateClass } from '@/services/classes'

const CODE_RE = /^[A-Za-z0-9-]{3,15}$/

const validate = (values) => {
  const errors = {}

  if (!values.name.trim()) errors.name = 'Class name is required'
  else if (values.name.trim().length < 3) errors.name = 'Use at least 3 characters'

  if (!values.code.trim()) errors.code = 'Class code is required'
  else if (!CODE_RE.test(values.code.trim())) errors.code = '3-15 letters, numbers or dashes'

  if (!values.department) errors.department = 'Select a department'
  if (!values.semester) errors.semester = 'Select a semester'

  if (values.room && !/^[A-Za-z0-9 -]{1,30}$/.test(values.room.trim())) errors.room = 'Up to 30 letters, numbers, spaces or dashes'

  if (!values.meetings.length) errors.meetings = 'Pick at least one day'
  values.meetings.forEach(({ day, startTime, endTime }) => {
    if (!startTime) errors[`start-${day}`] = 'Start time is required'
    if (!endTime) errors[`end-${day}`] = 'End time is required'
    else if (startTime && endTime <= startTime) errors[`end-${day}`] = 'End time must be after start time'
  })

  return errors
}

const emptyValues = {
  name: '',
  code: '',
  department: '',
  semester: '',
  meetings: [],
  room: '',
}

export default function ClassForm({ open, onOpenChange, classDoc, onSaved }) {
  const isEdit = Boolean(classDoc)
  const { toast } = useToast()

  const validateValues = useCallback((values) => validate(values), [])

  const form = useFormState({
    initialValues: classDoc
      ? {
          name: classDoc.name,
          code: classDoc.code,
          department: classDoc.department,
          semester: classDoc.semester,
          meetings: meetingsOf(classDoc.schedule),
          room: classDoc.room ?? '',
        }
      : emptyValues,
    validate: validateValues,
  })

  const { meetings } = form.values

  // A newly picked day starts with the times of the last one, since most
  // classes meet at the same hour; each day can then be adjusted on its own.
  const toggleDay = (day) => {
    const next = meetings.some((m) => m.day === day)
      ? meetings.filter((m) => m.day !== day)
      : [...meetings, { day, startTime: meetings.at(-1)?.startTime ?? '', endTime: meetings.at(-1)?.endTime ?? '' }]
    form.setValue('meetings', meetingsOf(next))
  }

  const setMeetingTime = (day, field, value) =>
    form.setValue(
      'meetings',
      meetings.map((m) => (m.day === day ? { ...m, [field]: value } : m))
    )

  const handleSubmit = async (event) => {
    event.preventDefault()
    form.setSubmitted(true)
    if (!form.isValid) return

    form.setSubmitting(true)
    try {
      const payload = {
        name: form.values.name.trim(),
        code: form.values.code.trim().toUpperCase(),
        department: form.values.department,
        semester: form.values.semester,
        schedule: meetings.map(({ day, startTime, endTime }) => ({ day, startTime, endTime })),
        room: form.values.room.trim().toUpperCase(),
      }

      if (isEdit) {
        await updateClass(classDoc.id, payload)
        toast({ title: 'Class updated', variant: 'success' })
      } else {
        await createClass(payload)
        toast({ title: 'Class created', variant: 'success' })
      }

      onSaved?.()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: isEdit ? 'Could not update class' : 'Could not create class',
        description: getErrorMessage(error),
        variant: 'destructive',
      })
    } finally {
      form.setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Class' : 'Add Class'}
      description={
        isEdit ? 'Update this class’s details and schedule.' : 'Create a class and add it to the timetable.'
      }
      onSubmit={handleSubmit}
      submitting={form.submitting}
      canSubmit={form.isValid}
    >
      <FormField label="Class Name" htmlFor="class-name" required error={form.fieldError('name')}>
        <Input
          id="class-name"
          value={form.values.name}
          onChange={(event) => form.setValue('name', event.target.value)}
          onBlur={() => form.markTouched('name')}
          placeholder="Operating Systems"
          autoComplete="off"
        />
      </FormField>

      <FormField label="Class Code" htmlFor="class-code" required error={form.fieldError('code')}>
        <Input
          id="class-code"
          value={form.values.code}
          onChange={(event) => form.setValue('code', event.target.value.toUpperCase())}
          onBlur={() => form.markTouched('code')}
          placeholder="CS-401"
          className="uppercase"
          autoComplete="off"
        />
      </FormField>

      <FormField
        label="Department"
        htmlFor="class-department"
        required
        error={form.fieldError('department')}
      >
        <Select
          value={form.values.department || undefined}
          onValueChange={(value) => form.setValue('department', value)}
        >
          <SelectTrigger id="class-department">
            <SelectValue placeholder="Select department" />
          </SelectTrigger>
          <SelectContent>
            {withCurrent(DEPARTMENTS, classDoc?.department).map((department) => (
              <SelectItem key={department} value={department}>
                {department}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Semester"
        htmlFor="class-semester"
        required
        error={form.fieldError('semester')}
      >
        <Select
          value={form.values.semester || undefined}
          onValueChange={(value) => form.setValue('semester', value)}
        >
          <SelectTrigger id="class-semester">
            <SelectValue placeholder="Select semester" />
          </SelectTrigger>
          <SelectContent>
            {withCurrent(SEMESTERS, classDoc?.semester).map((semester) => (
              <SelectItem key={semester} value={semester}>
                {semester}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Default room"
        htmlFor="class-room"
        error={form.fieldError('room')}
        hint="Used when scheduling sessions. Optional."
      >
        <Input
          id="class-room"
          value={form.values.room}
          onChange={(event) => form.setValue('room', event.target.value.toUpperCase())}
          onBlur={() => form.markTouched('room')}
          placeholder="B-204"
          className="uppercase"
          autoComplete="off"
        />
      </FormField>

      <fieldset className="space-y-3 sm:col-span-2">
        <legend className="text-sm font-medium leading-none">
          Days
          <span className="ms-0.5 text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meeting days">
          {DAYS.map((day) => {
            const on = meetings.some((m) => m.day === day)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(day)}
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
        {form.fieldError('meetings') ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {form.fieldError('meetings')}
          </p>
        ) : null}

        {meetings.map(({ day, startTime, endTime }) => (
          <div key={day} className="grid grid-cols-[3rem_1fr_1fr] items-start gap-3 rounded-md border p-3">
            <span className="pt-8 text-sm font-medium">{DAY_ABBR[day]}</span>
            <FormField
              label={
                <>
                  Start<span className="sr-only"> time on {day}</span>
                </>
              }
              htmlFor={`class-start-${day}`}
              required
              error={form.fieldError(`start-${day}`)}
            >
              <Input
                id={`class-start-${day}`}
                type="time"
                value={startTime}
                onChange={(event) => setMeetingTime(day, 'startTime', event.target.value)}
                onBlur={() => form.markTouched(`start-${day}`)}
              />
            </FormField>
            <FormField
              label={
                <>
                  End<span className="sr-only"> time on {day}</span>
                </>
              }
              htmlFor={`class-end-${day}`}
              required
              error={form.fieldError(`end-${day}`)}
            >
              <Input
                id={`class-end-${day}`}
                type="time"
                value={endTime}
                onChange={(event) => setMeetingTime(day, 'endTime', event.target.value)}
                onBlur={() => form.markTouched(`end-${day}`)}
              />
            </FormField>
          </div>
        ))}
      </fieldset>
    </FormDialog>
  )
}
