import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import NotificationBell from '@/components/layout/NotificationBell'
import ThemeToggle from '@/components/common/ThemeToggle'
import BoardClock from '@/components/common/BoardClock'
import { navItemsFor } from '@/lib/navigation'
import { useAuth } from '@/context/AuthContext'

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'

// Pages reached from a link rather than the menu.
const EXTRA_TITLES = [{ to: '/attendance/qr', label: 'QR check-in' }]

// Role-aware: the same path can carry a different label per role (/reports).
const titleFor = (pathname, role) => {
  const match = [...navItemsFor(role), ...EXTRA_TITLES].sort((a, b) => b.to.length - a.to.length).find((item) => pathname.startsWith(item.to))
  return match?.label || 'Dashboard'
}

export default function Topbar({ onOpenSidebar, menuButtonRef }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        ref={menuButtonRef}
        onClick={onOpenSidebar}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[1.35rem] font-bold uppercase leading-none tracking-[0.04em] lg:sr-only">
          {titleFor(pathname, user?.role)}
        </h1>
        <BoardClock showDay={false} className="mt-1 block text-muted-foreground lg:hidden" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <NotificationBell />
        <div className="hidden text-end sm:block">
          <p className="max-w-[180px] truncate text-sm font-medium leading-tight">{user?.name}</p>
          <p className="max-w-[180px] truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>

        <div
          className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground font-display text-sm font-bold tracking-wider text-background"
          aria-hidden="true"
          title={user?.name}
        >
          {initialsOf(user?.name)}
        </div>

        <Button variant="outline" size="sm" onClick={handleLogout} title="Sign out">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  )
}
