import { cn } from '@/lib/utils'

/**
 * A ruled strip of figures, like the GATE / BOARDING / SEAT row of a pass:
 * small caps labels over tabular values, hairlines between segments.
 *
 * items: [{ label, value, hint? (text or node), className? }]   loading: shows bars in place of values
 */
export default function SummaryStrip({ items, loading = false, className }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 overflow-hidden rounded-md border bg-card sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]',
        className
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="-mb-px -me-px border-b border-e px-5 py-4">
          <dt className="font-display text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{item.label}</dt>
          <dd className={cn('mt-1.5 font-mono text-[1.75rem] font-medium leading-none tabular-nums', item.className)}>
            {loading ? <span className="block h-7 w-16 animate-pulse rounded-sm bg-muted" aria-hidden="true" /> : item.value}
          </dd>
          {item.hint && !loading ? <dd className="mt-1.5 text-sm text-muted-foreground">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  )
}
