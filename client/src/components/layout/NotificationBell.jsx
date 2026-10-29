import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getUnreadCount } from '@/services/notifications'

const POLL_MS = 60000
const EVENT = 'uams:notifications-changed'

/** Call after marking notifications read so the bell updates immediately. */
export const notifyUnreadChanged = () => window.dispatchEvent(new Event(EVENT))

/**
 * Top-bar bell with the unread count. Polls every minute (paused while the tab
 * is hidden) and refreshes immediately when the Notifications page changes
 * read state. The count is part of the accessible name.
 */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let active = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      getUnreadCount()
        .then((count) => active && setUnread(count))
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, POLL_MS)
    window.addEventListener(EVENT, load)
    document.addEventListener('visibilitychange', load)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener(EVENT, load)
      document.removeEventListener('visibilitychange', load)
    }
  }, [])

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <Button asChild variant="ghost" size="icon" className="relative" title={label}>
      <Link to="/notifications" aria-label={label}>
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  )
}
