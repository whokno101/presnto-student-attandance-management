import { useCallback } from 'react'

import FormDialog from '@/components/common/FormDialog'
import FormField from '@/components/common/FormField'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import useFormState from '@/hooks/useFormState'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { DEPARTMENTS } from '@/lib/constants'
import { createFaculty, updateFaculty } from '@/services/faculty'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ID_RE = /^[A-Za-z0-9-]{3,20}$/

const validate = (values, isEdit) => {
  const errors = {}

  if (!values.name.trim()) errors.name = 'Full name is required'
  else if (values.name.trim().length < 2) errors.name = 'Use at least 2 characters'

  if (!values.email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address'

  if (!values.employeeId.trim()) errors.employeeId = 'Employee ID is required'
  else if (!ID_RE.test(values.employeeId.trim())) errors.employeeId = '3-20 letters, numbers or dashes'

  if (!values.department) errors.department = 'Select a department'

  if (!isEdit && !values.password) errors.password = 'Password is required'
  else if (values.password && values.password.length < 8) errors.password = 'Use at least 8 characters'

  return errors
}

const emptyValues = {
  name: '',
  email: '',
  employeeId: '',
  department: '',
  password: '',
}

export default function FacultyForm({ open, onOpenChange, faculty, onSaved }) {
  const isEdit = Boolean(faculty)
  const { toast } = useToast()

  const validateValues = useCallback((values) => validate(values, isEdit), [isEdit])

  const form = useFormState({
    initialValues: faculty
      ? {
          name: faculty.name === '—' ? '' : faculty.name,
          email: faculty.email === '—' ? '' : faculty.email,
          employeeId: faculty.employeeId,
          department: faculty.department,
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
        employeeId: form.values.employeeId.trim(),
        department: form.values.department,
      }
      if (form.values.password) payload.password = form.values.password

      if (isEdit) {
        await updateFaculty(faculty.id, payload)
        toast({ title: 'Faculty updated', variant: 'success' })
      } else {
        await createFaculty(payload)
        toast({ title: 'Faculty created', variant: 'success' })
      }

      onSaved?.()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: isEdit ? 'Could not update faculty' : 'Could not create faculty',
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
      title={isEdit ? 'Edit Faculty' : 'Add Faculty'}
      description={
        isEdit ? 'Update this faculty member’s details.' : 'Create a faculty account and profile.'
      }
      onSubmit={handleSubmit}
      submitting={form.submitting}
      canSubmit={form.isValid}
    >
      <FormField label="Full Name" htmlFor="faculty-name" required error={form.fieldError('name')}>
        <Input
          id="faculty-name"
          value={form.values.name}
          onChange={(event) => form.setValue('name', event.target.value)}
          onBlur={() => form.markTouched('name')}
          placeholder="Dr. Alan Turing"
          autoComplete="off"
        />
      </FormField>

      <FormField label="Email" htmlFor="faculty-email" required error={form.fieldError('email')}>
        <Input
          id="faculty-email"
          type="email"
          value={form.values.email}
          onChange={(event) => form.setValue('email', event.target.value)}
          onBlur={() => form.markTouched('email')}
          placeholder="a.turing@university.edu"
          autoComplete="off"
        />
      </FormField>

      <FormField
        label="Employee ID"
        htmlFor="faculty-employee-id"
        required
        error={form.fieldError('employeeId')}
      >
        <Input
          id="faculty-employee-id"
          value={form.values.employeeId}
          onChange={(event) => form.setValue('employeeId', event.target.value)}
          onBlur={() => form.markTouched('employeeId')}
          placeholder="EMP-1003"
          autoComplete="off"
        />
      </FormField>

      <FormField
        label="Department"
        htmlFor="faculty-department"
        required
        error={form.fieldError('department')}
      >
        <Select
          value={form.values.department || undefined}
          onValueChange={(value) => form.setValue('department', value)}
        >
          <SelectTrigger id="faculty-department">
            <SelectValue placeholder="Select department" />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map((department) => (
              <SelectItem key={department} value={department}>
                {department}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Password"
        htmlFor="faculty-password"
        required={!isEdit}
        error={form.fieldError('password')}
        hint={isEdit ? 'Leave blank to keep the current password.' : 'Minimum 8 characters.'}
        className="sm:col-span-2"
      >
        <Input
          id="faculty-password"
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
