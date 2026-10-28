import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import FormDialog from '@/components/common/FormDialog'
import FormField from '@/components/common/FormField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { assignFaculty } from '@/services/classes'
import { listActiveFaculty } from '@/services/faculty'

/** Radix Select cannot carry an empty string, so "no teacher" needs a sentinel. */
const UNASSIGNED = 'unassigned'

export default function AssignFacultyDialog({ open, onOpenChange, classDoc, onSaved }) {
  const { toast } = useToast()

  const currentFacultyId = classDoc?.faculty?.id ?? UNASSIGNED
  const [value, setValue] = useState(currentFacultyId)
  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    listActiveFaculty()
      .then((rows) => {
        if (active) setFaculty(rows)
      })
      .catch((error) => {
        if (active) setLoadError(getErrorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  // The assigned teacher may have been deactivated since — show the truth
  // instead of silently rendering "Unassigned".
  const assignedIsMissing =
    classDoc?.faculty && !loading && !faculty.some((item) => item.id === classDoc.faculty.id)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (value === currentFacultyId) return

    setSubmitting(true)
    try {
      await assignFaculty(classDoc.id, value === UNASSIGNED ? null : value)
      toast({
        title: value === UNASSIGNED ? 'Faculty unassigned' : 'Faculty assigned',
        description:
          value === UNASSIGNED
            ? `${classDoc.code} no longer has a teacher.`
            : `${classDoc.code} is now taught by ${
                faculty.find((item) => item.id === value)?.name ?? 'the selected faculty member'
              }.`,
        variant: 'success',
      })
      onSaved?.()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Could not update the assignment',
        description: getErrorMessage(error),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign Faculty"
      description={
        classDoc ? `${classDoc.code} — ${classDoc.name}` : 'Choose who teaches this class.'
      }
      onSubmit={handleSubmit}
      submitting={submitting}
      canSubmit={value !== currentFacultyId && !loading && !loadError}
      submitLabel="Save assignment"
    >
      <FormField
        label="Faculty"
        htmlFor="assign-faculty"
        hint="Only active faculty members can take on a class."
        error={loadError}
        className="sm:col-span-2"
      >
        {loading ? (
          <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading faculty…
          </div>
        ) : (
          <Select value={value} onValueChange={setValue} disabled={Boolean(loadError)}>
            <SelectTrigger id="assign-faculty">
              <SelectValue placeholder="Select faculty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned — no teacher</SelectItem>

              {assignedIsMissing ? (
                <SelectItem value={classDoc.faculty.id}>
                  {classDoc.faculty.name} (inactive)
                </SelectItem>
              ) : null}

              {faculty.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} · {item.employeeId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      {!loading && !loadError && faculty.length === 0 ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">
          There are no active faculty accounts yet. Add one under Manage Faculty first.
        </p>
      ) : null}
    </FormDialog>
  )
}
