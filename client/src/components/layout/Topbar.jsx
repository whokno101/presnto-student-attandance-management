import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { navItemsFor, ROLE_LABEL } from '@/lib/navigation'
import { useAuth } from '@/context/AuthContext'

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'

// Role-aware: the same path can carry a different label per role (/reports).
const titleFor = (pathname, role) => {
  const match = [...navItemsFor(role)].sort((a, b) => b.to.length - a.to.length).find((item) => pathname.startsWith(item.to))
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
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
        <h1 className="truncate text-base font-semibold">{titleFor(pathname, user?.role)}</h1>
        <p className="truncate text-xs text-muted-foreground">University Attendance Management System</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden text-right sm:block">
          <p className="max-w-[180px] truncate text-sm font-medium leading-tight">{user?.name}</p>
          <p className="max-w-[180px] truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>

        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden="true"
          title={user?.name}
        >
          {initialsOf(user?.name)}
        </div>

        <Badge variant="outline" className="hidden capitalize md:inline-flex">
          {ROLE_LABEL[user?.role] || user?.role}
        </Badge>

        <Button variant="outline" size="sm" onClick={handleLogout} title="Sign out">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  )
}
