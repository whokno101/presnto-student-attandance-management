import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, Bell, CheckCheck, CheckCircle2, FileText } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import TablePagination from '@/components/common/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useApiQuery from '@/hooks/useApiQuery'
import usePolicy from '@/hooks/usePolicy'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { notifyUnreadChanged } from '@/components/layout/NotificationBell'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/notifications'

const TYPE_ICON = { risk: AlertTriangle, excuse_submitted: FileText, excuse_decided: FileText, system: Bell }

export default function Notifications() {
  const policy = usePolicy()
  const { toast } = useToast()
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const query = useApiQuery(listNotifications, { status: status === 'unread' ? 'unread' : undefined, page, limit: 20 })
  const rows = query.data?.data ?? []
  const unread = query.data?.unread ?? 0
  const pagination = query.data?.pagination ?? { page: 1, totalPages: 1, total: 0, limit: 20 }

  const markRead = async (item) => {
    if (item.read) return
    try {
      await markNotificationRead(item.id)
      notifyUnreadChanged()
      query.refresh()
    } catch (error) {
      toast({ title: 'Could not update notification', description: getErrorMessage(error), variant: 'destructive' })
    }
  }

  const markAll = async () => {
    try {
      const { updated } = await markAllNotificationsRead()
      notifyUnreadChanged()
      toast({ title: 'All caught up', description: `${updated} notification${updated === 1 ? '' : 's'} marked as read.`, variant: 'success' })
      query.refresh()
    } catch (error) {
      toast({ title: 'Could not update notifications', description: getErrorMessage(error), variant: 'destructive' })
    }
  }

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const to = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Alerts about your classes and requests. Read notifications stay here as history."
        action={
          <Button variant="outline" onClick={markAll} disabled={!unread}>
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        }
      />

      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value)
          setPage(1)
        }}
      >
        <TabsList aria-label="Filter notifications">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread{unread ? ` (${unread})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value={status}>
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {query.error ? (
            <EmptyState icon={AlertCircle} title="Could not load notifications" description={query.errorMessage} action={<Button variant="outline" size="sm" onClick={query.refresh}>Try again</Button>} />
          ) : null}
          {query.loading && !query.data ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : null}
          {!query.loading && !query.error && rows.length === 0 ? (
            <EmptyState icon={Bell} title={status === 'unread' ? 'No unread notifications' : 'No notifications yet'} description="Alerts about at-risk students and excuse requests will appear here." />
          ) : null}

          <ul className="divide-y">
            {rows.map((item) => {
              const Icon = TYPE_ICON[item.type] ?? Bell
              return (
                <li key={item.id} className={cn('flex gap-3 py-4 first:pt-0', !item.read && 'font-medium')}>
                  <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', item.type === 'risk' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm">{item.title}</p>
                      {!item.read ? <Badge>Unread</Badge> : null}
                      {item.resolved ? (
                        <Badge variant="success">
                          <CheckCircle2 className="me-1 h-3 w-3" aria-hidden="true" />
                          No longer at risk
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm font-normal text-muted-foreground">{item.message}</p>
                    {item.nextStep ? <p className="text-xs font-normal text-muted-foreground">Next step: {item.nextStep}</p> : null}
                    <p className="text-xs font-normal text-muted-foreground">{formatDateTime(item.createdAt, policy.timeZone)}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {item.link ? (
                        <Button asChild size="sm" variant="outline" onClick={() => markRead(item)}>
                          <Link to={item.link}>Open</Link>
                        </Button>
                      ) : null}
                      {!item.read ? (
                        <Button size="sm" variant="ghost" onClick={() => markRead(item)}>
                          Mark as read
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            from={from}
            to={to}
            total={pagination.total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={query.loading}
          />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
