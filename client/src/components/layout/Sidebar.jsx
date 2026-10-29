import { NavLink } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

import Logo from '@/components/common/Logo'
import BoardClock from '@/components/common/BoardClock'

import { cn } from '@/lib/utils'
import { navItemsFor, ROLE_LABEL, homeFor } from '@/lib/navigation'
import { useAuth } from '@/context/AuthContext'

/**
 * Role-aware sidebar on the ink shell. Menu entries come from NAV_ITEMS filtered
 * by the current user's role, so a faculty account can never see admin links
 * (and vice versa) even before the route guard rejects the URL. The active route
 * is a white panel on ink; signal yellow stays reserved for live and changed state.
 */
export default function Sidebar({ onNavigate }) {
  const { user } = useAuth()
  const items = navItemsFor(user?.role)

  return (
    <div className="flex h-full flex-col bg-shell text-shell-foreground">
      <div className="flex h-16 items-center border-b border-shell-border px-5">
        <Logo inverse size={32} subtitle="Attendance" />
      </div>

      <div className="border-b border-shell-border px-5 py-3">
        <span className="block font-display text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-shell-foreground">
          {ROLE_LABEL[user?.role] || user?.role}
        </span>
        <BoardClock className="mt-0.5 block text-shell-muted" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-md px-3 py-2 font-display text-[0.98rem] font-semibold uppercase tracking-[0.05em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-foreground',
                    isActive
                      ? 'bg-shell-foreground text-shell'
                      : 'text-shell-muted hover:bg-shell-accent hover:text-shell-foreground'
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-shell-border p-3">
        <a
          href={homeFor(user?.role)}
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-shell-muted hover:bg-shell-accent hover:text-shell-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-foreground"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Session secured by JWT
        </a>
      </div>
    </div>
  )
}
