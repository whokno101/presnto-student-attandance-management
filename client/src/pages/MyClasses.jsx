import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, BookOpen, Plus } from 'lucide-react'

import ClassCard from '@/components/classes/ClassCard'
import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/api'
import { listMyClasses } from '@/services/classes'

const SKELETONS = 3

export default function MyClasses() {
  const { user } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setClasses(await listMyClasses())
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

  const isFaculty = user?.role === 'faculty'

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Classes"
        description={
          isFaculty
            ? 'The classes assigned to you this semester.'
            : 'The classes you are enrolled in this semester.'
        }
        action={
          !isFaculty && user?.role === 'student' ? (
            <Button asChild>
              <Link to="/enroll">
                <Plus className="h-4 w-4" />
                Enroll in classes
              </Link>
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: SKELETONS }).map((_, index) => (
            <Card key={`skeleton-${index}`}>
              <CardContent className="space-y-3 p-5">
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={AlertCircle}
              title="Could not load your classes"
              description={getErrorMessage(error)}
              action={
                <Button variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={BookOpen}
              title={isFaculty ? 'No classes assigned yet' : 'You have not enrolled in any classes'}
              description={
                isFaculty
                  ? 'An administrator assigns classes to faculty members. Check back after your timetable is published.'
                  : 'Browse the catalog and enroll in the classes you want to attend this semester.'
              }
              action={
                !isFaculty ? (
                  <Button asChild size="sm">
                    <Link to="/enroll">Browse classes</Link>
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((classDoc) => (
            <ClassCard key={classDoc.id} classDoc={classDoc} />
          ))}
        </div>
      )}
    </div>
  )
}
