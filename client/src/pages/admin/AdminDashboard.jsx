import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, ClipboardCheck, GraduationCap, Users } from 'lucide-react'

import PageHeader from '@/components/common/PageHeader'
import BoardClock from '@/components/common/BoardClock'
import DeparturesBoard from '@/components/board/DeparturesBoard'
import SummaryStrip from '@/components/board/SummaryStrip'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { getAdminStats } from '@/services/dashboard'
import { listSchedule } from '@/services/schedule'
import { listAllClasses } from '@/services/classes'
import { weekBoardRows, ymdLocal } from '@/lib/board'

const STAT_CARDS = [
  {
    key: 'students',
    label: 'Total Students',
  },
  {
    key: 'faculty',
    label: 'Total Faculty',
  },
  {
    key: 'classes',
    label: 'Total Classes',
  },
  {
    key: 'todayAttendance',
    label: "Today's Attendance Rate",
    // `{ marked, attended, rate }` — or null when nothing is marked yet.
    format: (value) => (value == null ? '—' : `${value.rate}%`),
    hint: (value) =>
      value == null ? 'Not marked yet today' : `${value.marked} records marked`,
  },
]

const BOARD_ROWS = 8

const QUICK_ACTIONS = [
  { to: '/admin/students', label: 'Manage Students', icon: Users },
  { to: '/admin/faculty', label: 'Manage Faculty', icon: GraduationCap },
  { to: '/admin/classes', label: 'Manage Classes', icon: BookOpen },
  { to: '/attendance/mark', label: 'Mark Attendance', icon: ClipboardCheck },
]

export default function AdminDashboard() {
  const { toast } = useToast()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [boardRows, setBoardRows] = useState(null)

  // Today's board: every class's weekly meeting plus dated sessions from the schedule.
  useEffect(() => {
    let active = true
    Promise.all([listAllClasses().then((res) => res.data).catch(() => []), listSchedule({ from: ymdLocal(new Date()) }).then((res) => res.data).catch(() => [])])
      .then(([classes, sessions]) => {
        if (active) setBoardRows(weekBoardRows(classes, sessions, { limit: BOARD_ROWS }))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    getAdminStats()
      .then((data) => {
        if (active) setStats(data)
      })
      .catch((error) => {
        if (active) {
          toast({
            title: 'Could not load dashboard',
            description: getErrorMessage(error),
            variant: 'destructive',
          })
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="A snapshot of the institution, including today’s attendance rate." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-2">
            <CardTitle>This week’s sessions</CardTitle>
            <BoardClock className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {boardRows == null ? (
              <div className="space-y-2" role="status" aria-label="Loading sessions">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : boardRows.length ? (
              <DeparturesBoard surface="card" dense rows={boardRows} caption="This week's sessions, by start time" />
            ) : (
              <div className="rounded-md border border-dashed px-4 py-8 text-center">
                <p className="font-display text-lg font-semibold uppercase tracking-[0.04em]">No sessions this week</p>
                <p className="mt-1 text-sm text-muted-foreground">Classes with a weekly time and scheduled dates appear here, in start-time order.</p>
                <Link to="/admin/schedule" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
                  Open the schedule
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>The most common admin tasks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y border-y">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon

                return (
                  <li key={action.to}>
                    <Link
                      to={action.to}
                      className="group flex items-center justify-between gap-3 px-1 py-3 font-display text-[1rem] font-semibold uppercase tracking-[0.05em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {action.label}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground rtl:-scale-x-100" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
      <SummaryStrip
        loading={loading}
        items={STAT_CARDS.map((card) => {
          const raw = stats?.[card.key]
          return { label: card.label, value: card.format ? card.format(raw) : raw ?? '—', hint: card.hint?.(raw) }
        })}
      />
    </div>
  )
}
