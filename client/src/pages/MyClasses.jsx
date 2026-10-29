import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, BookOpen, Plus } from 'lucide-react'

import ClassRows from '@/components/classes/ClassRows'
import DeparturesBoard from '@/components/board/DeparturesBoard'
import BoardClock from '@/components/common/BoardClock'
import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/api'
import { listMyClasses } from '@/services/classes'
import { weekBoardRows } from '@/lib/board'


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
  const boardRows = weekBoardRows(classes, [], {
    action: isFaculty ? (m) => ({ to: `/attendance/mark?class=${m.classId}`, label: 'Take attendance' }) : undefined,
  })

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
        <div className="space-y-2" role="status" aria-label="Loading your classes">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
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
        <>
          <Card>
            <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1 space-y-0 pb-2">
              <CardTitle>This week</CardTitle>
              <BoardClock className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <DeparturesBoard surface="card" dense rows={boardRows} caption="Your sessions this week, by start time" />
            </CardContent>
          </Card>

          <ClassRows classes={classes} caption={isFaculty ? 'Classes you teach' : 'Classes you are enrolled in'} />
        </>
      )}
    </div>
  )
}
