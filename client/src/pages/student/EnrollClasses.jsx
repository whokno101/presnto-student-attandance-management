import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, BookOpen, Loader2, SearchX } from 'lucide-react'

import ClassCard from '@/components/classes/ClassCard'
import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import SearchInput from '@/components/common/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { enrollInClass, listAvailableClasses, unenrollFromClass } from '@/services/classes'

export default function EnrollClasses() {
  const { toast } = useToast()

  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setClasses(await listAvailableClasses())
    } catch (err) {
      setError(err)
      setClasses([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const enrolledCount = classes.filter((item) => item.isEnrolled).length

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return classes
    return classes.filter((item) =>
      `${item.code} ${item.name} ${item.department}`.toLowerCase().includes(term)
    )
  }, [classes, search])

  const handleEnroll = async (classDoc) => {
    setBusyId(classDoc.id)
    try {
      await enrollInClass(classDoc.id)
      toast({
        title: `Enrolled in ${classDoc.code}`,
        description: `${classDoc.name} was added to your classes.`,
        variant: 'success',
      })
      await load()
    } catch (err) {
      toast({
        title: 'Could not enroll',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleUnenroll = async (classDoc) => {
    setBusyId(classDoc.id)
    try {
      await unenrollFromClass(classDoc.id)
      toast({
        title: `Unenrolled from ${classDoc.code}`,
        description: 'You can enroll again while seats remain.',
        variant: 'success',
      })
      await load()
    } catch (err) {
      toast({
        title: 'Could not unenroll',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  const renderAction = (classDoc) => {
    const busy = busyId === classDoc.id

    if (busy) {
      return (
        <Button size="sm" className="w-full" disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
          Working…
        </Button>
      )
    }

    if (classDoc.isEnrolled) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => handleUnenroll(classDoc)}
        >
          Unenroll
        </Button>
      )
    }

    if (classDoc.isFull) {
      return (
        <Button size="sm" className="w-full" disabled>
          Class full
        </Button>
      )
    }

    return (
      <Button size="sm" className="w-full" onClick={() => handleEnroll(classDoc)}>
        Enroll
      </Button>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Enroll in Classes"
        description={
          loading
            ? 'Browse the classes available this semester.'
            : `You are enrolled in ${enrolledCount} of ${classes.length} ${
                classes.length === 1 ? 'class' : 'classes'
              } this semester.`
        }
        action={<Badge variant="secondary">{enrolledCount} enrolled</Badge>}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by name, code or department..."
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={`skeleton-${index}`}>
              <CardContent className="space-y-3 p-5">
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-9 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={AlertCircle}
              title="Could not load the class catalog"
              description={getErrorMessage(error)}
              action={
                <Button variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={classes.length === 0 ? BookOpen : SearchX}
              title={classes.length === 0 ? 'No classes available' : 'No matching classes'}
              description={
                classes.length === 0
                  ? 'An administrator has not created any classes for this semester yet.'
                  : `No class matches “${search.trim()}”. Try another name or code.`
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((classDoc) => (
            <ClassCard
              key={classDoc.id}
              classDoc={classDoc}
              badge={classDoc.isEnrolled ? <Badge variant="success">Enrolled</Badge> : null}
              footer={renderAction(classDoc)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
