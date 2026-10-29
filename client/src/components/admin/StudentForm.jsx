import { useCallback } from 'react'

import FormDialog from '@/components/common/FormDialog'
import FormField from '@/components/common/FormField'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import useFormState from '@/hooks/useFormState'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { DEPARTMENTS, withCurrent } from '@/lib/constants'
import { createStudent, updateStudent } from '@/services/students'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ID_RE = /^[A-Za-z0-9-]{3,20}$/

const validate = (values, isEdit) => {
  const errors = {}

  if (!values.name.trim()) errors.name = 'Full name is required'
  else if (values.name.trim().length < 2) errors.name = 'Use at least 2 characters'

  if (!values.email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address'

  if (!values.studentId.trim()) errors.studentId = 'Student ID is required'
  else if (!ID_RE.test(values.studentId.trim())) errors.studentId = '3-20 letters, numbers or dashes'

  if (!values.department) errors.department = 'Select a department'

  if (!isEdit && !values.password) errors.password = 'Password is required'
  else if (values.password && values.password.length < 8) errors.password = 'Use at least 8 characters'

  return errors
}

const emptyValues = {
  name: '',
  email: '',
  studentId: '',
  department: '',
  password: '',
}

export default function StudentForm({ open, onOpenChange, student, onSaved }) {
  const isEdit = Boolean(student)
  const { toast } = useToast()

  const validateValues = useCallback((values) => validate(values, isEdit), [isEdit])

  const form = useFormState({
    initialValues: student
      ? {
          name: student.name === '—' ? '' : student.name,
          email: student.email === '—' ? '' : student.email,
          studentId: student.studentId,
          department: student.department,
          password: '',
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
        email: form.values.email.trim(),
        studentId: form.values.studentId.trim(),
        department: form.values.department,
      }
      if (form.values.password) payload.password = form.values.password

      if (isEdit) {
        await updateStudent(student.id, payload)
        toast({ title: 'Student updated', variant: 'success' })
      } else {
        await createStudent(payload)
        toast({ title: 'Student created', variant: 'success' })
      }

      onSaved?.()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: isEdit ? 'Could not update student' : 'Could not create student',
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
      title={isEdit ? 'Edit Student' : 'Add Student'}
      description={
        isEdit ? 'Update the student’s account details.' : 'Create a student account and profile.'
      }
      onSubmit={handleSubmit}
      submitting={form.submitting}
      canSubmit={form.isValid}
    >
      <FormField label="Full Name" htmlFor="student-name" required error={form.fieldError('name')}>
        <Input
          id="student-name"
          value={form.values.name}
          onChange={(event) => form.setValue('name', event.target.value)}
          onBlur={() => form.markTouched('name')}
          placeholder="Jane Doe"
          autoComplete="off"
        />
      </FormField>

      <FormField label="Email" htmlFor="student-email" required error={form.fieldError('email')}>
        <Input
          id="student-email"
          type="email"
          value={form.values.email}
          onChange={(event) => form.setValue('email', event.target.value)}
          onBlur={() => form.markTouched('email')}
          placeholder="jane.doe@university.edu"
          autoComplete="off"
        />
      </FormField>

      <FormField
        label="Student ID"
        htmlFor="student-id"
        required
        error={form.fieldError('studentId')}
      >
        <Input
          id="student-id"
          value={form.values.studentId}
          onChange={(event) => form.setValue('studentId', event.target.value)}
          onBlur={() => form.markTouched('studentId')}
          placeholder="STU-2006"
          autoComplete="off"
        />
      </FormField>

      <FormField
        label="Department"
        htmlFor="student-department"
        required
        error={form.fieldError('department')}
      >
        <Select
          value={form.values.department || undefined}
          onValueChange={(value) => form.setValue('department', value)}
        >
          <SelectTrigger id="student-department">
            <SelectValue placeholder="Select department" />
          </SelectTrigger>
          <SelectContent>
            {withCurrent(DEPARTMENTS, student?.department).map((department) => (
              <SelectItem key={department} value={department}>
                {department}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Password"
        htmlFor="student-password"
        required={!isEdit}
        error={form.fieldError('password')}
        hint={isEdit ? 'Leave blank to keep the current password.' : 'Minimum 8 characters.'}
        className="sm:col-span-2"
      >
        <Input
          id="student-password"
          type="password"
          value={form.values.password}
          onChange={(event) => form.setValue('password', event.target.value)}
          onBlur={() => form.markTouched('password')}
          placeholder={isEdit ? '••••••••' : 'At least 8 characters'}
          autoComplete="new-password"
        />
      </FormField>
    </FormDialog>
  )
}
