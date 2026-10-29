import { cn } from '@/lib/utils'

/**
 * A segmented pass (sign-in, check-in): white segments separated by dashed
 * tear lines with punched notches. `ground` is the class of the surface the
 * pass sits on, so the notches read as holes.
 */
export function Pass({ className, children, ...props }) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl bg-card text-card-foreground shadow-[0_32px_80px_-32px_rgb(0_0_0/0.55)]', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function PassPerforation({ ground = 'bg-background' }) {
  return (
    <div className="relative h-0" aria-hidden="true">
      <div className="mx-6 border-t-2 border-dashed border-border" />
      <span className={cn('absolute -start-3 -top-3 h-6 w-6 rounded-full', ground)} />
      <span className={cn('absolute -end-3 -top-3 h-6 w-6 rounded-full', ground)} />
    </div>
  )
}

/** Small caps field label over a value, like GATE / SEAT on a boarding pass. */
export function PassField({ label, children, className, wrap = false }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="font-display text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-mono text-[0.95rem] font-medium', wrap ? '[overflow-wrap:anywhere]' : 'truncate')}>{children}</p>
    </div>
  )
}
