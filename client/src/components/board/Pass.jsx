import { cn } from '@/lib/utils'

/**
 * A segmented pass (sign-in, check-in): white segments separated by dashed
 * tear lines with punched notches. `ground` is the class of the surface the
 * pass sits on, so the notches read as holes; the hairline outlines both
 * the pass and the notches, which keeps them visible on a ground as light as
 * the pass itself.
 */
export function Pass({ className, children, ...props }) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl border bg-card text-card-foreground shadow-[0_32px_80px_-32px_rgb(0_0_0/0.55)]', className)}
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
      <span className={cn('absolute -start-3 -top-3 h-6 w-6 rounded-full border', ground)} />
      <span className={cn('absolute -end-3 -top-3 h-6 w-6 rounded-full border', ground)} />
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

/**
 * Decorative barcode for a pass stub. Bars are derived from `value` (FNV-1a
 * seeded PRNG), so the same value always prints the same code and typing
 * reprints it. Not a scannable symbology; hidden from assistive tech.
 */
export function PassBarcode({ value = '', className }) {
  let seed = 2166136261
  for (let i = 0; i < value.length; i += 1) seed = Math.imul(seed ^ value.charCodeAt(i), 16777619)
  const next = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507)
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909)
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296
  }

  const bars = []
  let x = 0
  while (x < 116) {
    const width = 1 + Math.floor(next() * 3)
    bars.push(<rect key={x} x={x} width={width} height="1" />)
    x += width + 1 + Math.floor(next() * 2)
  }

  return (
    <svg viewBox="0 0 120 1" preserveAspectRatio="none" className={cn('block h-12 w-full fill-current', className)} aria-hidden="true">
      {bars}
    </svg>
  )
}

