import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Departures board: sessions ranked by start time, one row each, the way an
 * airport ranks flights. A row whose status or hall just changed lands in
 * signal yellow and keeps a yellow chip until the data moves on, so a change
 * is never missed. Status is always a word; colour only reinforces it.
 *
 * rows: [{ id, day?, time, code, title, detail?, hall, status: { label, tone }, changed?: 'hall' | 'status', changedAt?,
 *          action?: { to, label } }]
 * tone: 'live' (signal chip) · 'ok' · 'alert' · 'muted' · 'default'
 * surface: 'shell' (ink ground: login, live views) or 'card' (inside the app)
 */
const TONES = {
  shell: {
    ok: 'text-shell-ok',
    alert: 'text-shell-alert',
    muted: 'text-shell-muted',
    default: 'text-shell-foreground',
  },
  card: {
    ok: 'text-success',
    alert: 'text-destructive',
    muted: 'text-muted-foreground',
    default: 'text-foreground',
  },
}

/** The signal chip: the only yellow in the app, for live or changed state. */
export function Signal({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm bg-signal px-1.5 py-px font-display text-[0.9rem] font-bold uppercase tracking-[0.06em] text-signal-foreground">
      {children}
    </span>
  )
}

export default function DeparturesBoard({ rows, caption, surface = 'shell', className, dense = false }) {
  const tones = TONES[surface]
  const shell = surface === 'shell'
  // Leave the Hall column out when no row has a hall to show.
  const showHall = rows.some((row) => row.hall && row.hall !== '—')

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-start tabular-nums">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr
            className={cn(
              'border-b font-display text-[0.78rem] font-semibold uppercase tracking-[0.14em]',
              shell ? 'border-shell-border text-shell-muted' : 'border-border text-muted-foreground'
            )}
          >
            <th scope="col" className="w-[5.5rem] whitespace-nowrap py-2 pe-4 text-start font-semibold">Time</th>
            <th scope="col" className="py-2 pe-4 text-start font-semibold">Course</th>
            {showHall ? <th scope="col" className="hidden py-2 pe-4 text-start font-semibold sm:table-cell">Hall</th> : null}
            <th scope="col" className="whitespace-nowrap py-2 text-start font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const tone = row.status?.tone ?? 'default'
            return (
              <tr
                key={`${row.id}-${row.changedAt ?? 0}`}
                className={cn(
                  'animate-row-in border-b align-top',
                  shell ? 'border-shell-border' : 'border-border',
                  row.changed && 'animate-signal-in'
                )}
                style={{ animationDelay: row.changed ? undefined : `${index * 45}ms` }}
              >
                <td className={cn('pe-4 font-mono font-medium', dense ? 'py-2.5 text-base' : 'py-3.5 text-lg', shell ? 'text-shell-foreground' : 'text-foreground')}>
                  {row.day ? (
                    <span className={cn('block whitespace-nowrap font-display text-[0.75rem] font-semibold uppercase tracking-[0.1em]', shell ? 'text-shell-muted' : 'text-muted-foreground')}>
                      {row.day}
                    </span>
                  ) : null}
                  <time>{row.time}</time>
                </td>
                <td className={cn('w-full max-w-0 pe-4', dense ? 'py-2.5' : 'py-3.5')}>
                  <span className={cn('block font-mono text-[0.95rem] font-medium', shell ? 'text-shell-foreground' : 'text-foreground')}>
                    {row.code}
                  </span>
                  <span className={cn('block break-words text-sm sm:truncate', shell ? 'text-shell-muted' : 'text-muted-foreground')}>
                    {row.title}
                    {row.detail ? ` · ${row.detail}` : null}
                  </span>
                </td>
                {showHall ? (
                  <td className={cn('hidden pe-4 font-mono text-[0.95rem] sm:table-cell', dense ? 'py-2.5' : 'py-3.5', shell ? 'text-shell-foreground' : 'text-foreground')}>
                    {row.changed === 'hall' ? <Signal>{row.hall}</Signal> : row.hall}
                  </td>
                ) : null}
                <td className={cn(dense ? 'py-2.5' : 'py-3.5')}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {tone === 'live' || row.changed === 'status' ? (
                        <Signal>{row.status.label}</Signal>
                      ) : (
                        <span className={cn('font-display text-[0.95rem] font-semibold uppercase tracking-[0.06em]', tones[tone] ?? tones.default)}>
                          {row.status?.label}
                        </span>
                      )}
                      {/* The Hall column drops on phones; a changed hall must still show. */}
                      {row.changed === 'hall' ? (
                        <span className="sm:hidden">
                          <Signal>Hall {row.hall}</Signal>
                        </span>
                      ) : null}
                    </span>
                    {row.action ? (
                      <Link
                        to={row.action.to}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-display text-[0.85rem] font-semibold uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2',
                          shell
                            ? 'border-shell-foreground/70 text-shell-foreground hover:bg-shell-foreground hover:text-shell focus-visible:ring-shell-foreground'
                            : 'border-foreground/80 hover:bg-foreground hover:text-background focus-visible:ring-ring'
                        )}
                      >
                        {row.action.label}
                        <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
