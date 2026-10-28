import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, ClipboardCheck, GraduationCap, Users } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getAdminStats } from '@/services/dashboard'

const STAT_CARDS = [
  {
    key: 'students',
    label: 'Total Students',
    icon: Users,
    accent: 'border-t-blue-500',
    iconClass: 'bg-blue-500/10 text-blue-600',
  },
  {
    key: 'faculty',
    label: 'Total Faculty',
    icon: GraduationCap,
    accent: 'border-t-orange-500',
    iconClass: 'bg-orange-500/10 text-orange-600',
  },
  {
    key: 'classes',
    label: 'Total Classes',
    icon: BookOpen,
    accent: 'border-t-emerald-500',
    iconClass: 'bg-emerald-500/10 text-emerald-600',
  },
  {
    key: 'todayAttendance',
    label: "Today's Attendance Rate",
    icon: ClipboardCheck,
    accent: 'border-t-purple-500',
    iconClass: 'bg-purple-500/10 text-purple-600',
    // `{ marked, attended, rate }` — or null when nothing is marked yet.
    format: (value) => (value == null ? '—' : `${value.rate}%`),
    hint: (value) =>
      value == null ? 'Not marked yet today' : `${value.marked} records marked`,
  },
]

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
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Overview</h2>
        <p className="text-sm text-muted-foreground">
          A snapshot of the institution, including today&apos;s attendance rate.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon
          const raw = stats?.[card.key]
          const value = loading ? null : card.format ? card.format(raw) : raw ?? '—'
          const hint = loading ? null : card.hint?.(raw) ?? null

          return (
            <Card
              key={card.key}
              className={cn('border-t-4 transition-shadow duration-200 hover:shadow-md', card.accent)}
            >
              <CardContent className="p-5">
                <div
                  className={cn('mb-4 flex h-10 w-10 items-center justify-center rounded-lg', card.iconClass)}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>

                {value === null ? (
                  <div className="h-9 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
                )}

                <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
                {hint ? <p className="text-xs text-muted-foreground/80">{hint}</p> : null}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <CardDescription>Jump straight to the most common admin tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon

              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {action.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
