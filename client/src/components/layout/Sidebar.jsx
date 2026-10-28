import { NavLink } from 'react-router-dom'
import { GraduationCap, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { navItemsFor, ROLE_LABEL, homeFor } from '@/lib/navigation'
import { useAuth } from '@/context/AuthContext'

/**
 * Role-aware sidebar. Menu entries come from NAV_ITEMS filtered by the current
 * user's role, so a faculty account can never see admin links (and vice versa)
 * even before the route guard rejects the URL.
 */
export default function Sidebar({ onNavigate }) {
  const { user } = useAuth()
  const items = navItemsFor(user?.role)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">UniTrack</p>
          <p className="truncate text-xs text-muted-foreground">Attendance System</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Menu</span>
        <Badge variant="secondary" className="text-[10px] uppercase">
          {ROLE_LABEL[user?.role] || user?.role}
        </Badge>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-4">
        <a
          href={homeFor(user?.role)}
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-accent"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Session secured by JWT
        </a>
      </div>
    </div>
  )
}
