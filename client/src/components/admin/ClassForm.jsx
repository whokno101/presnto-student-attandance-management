import { useCallback } from 'react'

import FormDialog from '@/components/common/FormDialog'
import FormField from '@/components/common/FormField'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import useFormState from '@/hooks/useFormState'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { DAYS, DAY_ABBR, DEPARTMENTS, SEMESTERS, withCurrent } from '@/lib/constants'
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
  if (!values.day) errors.day = 'Select a day'

  if (!values.startTime) errors.startTime = 'Start time is required'
  if (!values.endTime) errors.endTime = 'End time is required'
  else if (values.startTime && values.endTime <= values.startTime) {
    errors.endTime = 'End time must be after start time'
  }

  return errors
}

const emptyValues = {
  name: '',
  code: '',
  department: '',
  semester: '',
  day: '',
  startTime: '',
  endTime: '',
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
          day: classDoc.schedule?.day ?? '',
          startTime: classDoc.schedule?.startTime ?? '',
          endTime: classDoc.schedule?.endTime ?? '',
        }
      : emptyValues,
    validate: validateValues,
  })

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
        day: form.values.day,
        startTime: form.values.startTime,
        endTime: form.values.endTime,
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
        label="Day"
        htmlFor="class-day"
        required
        error={form.fieldError('day')}
        className="sm:col-span-2"
      >
        <Select value={form.values.day || undefined} onValueChange={(value) => form.setValue('day', value)}>
          <SelectTrigger id="class-day">
            <SelectValue placeholder="Select day" />
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((day) => (
              <SelectItem key={day} value={day}>
                {DAY_ABBR[day]} — {day}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Start Time"
        htmlFor="class-start"
        required
        error={form.fieldError('startTime')}
      >
        <Input
          id="class-start"
          type="time"
          value={form.values.startTime}
          onChange={(event) => form.setValue('startTime', event.target.value)}
          onBlur={() => form.markTouched('startTime')}
        />
      </FormField>

      <FormField label="End Time" htmlFor="class-end" required error={form.fieldError('endTime')}>
        <Input
          id="class-end"
          type="time"
          value={form.values.endTime}
          onChange={(event) => form.setValue('endTime', event.target.value)}
          onBlur={() => form.markTouched('endTime')}
        />
      </FormField>
    </FormDialog>
  )
}
