import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Accent colours come from the decorative chart tokens. They only decorate:
 * the label and value always carry the meaning.
 */
const TONES = {
  1: { border: 'border-t-chart-1', icon: 'bg-chart-1/10 text-chart-1' },
  2: { border: 'border-t-chart-2', icon: 'bg-chart-2/10 text-chart-2' },
  3: { border: 'border-t-chart-3', icon: 'bg-chart-3/10 text-chart-3' },
  4: { border: 'border-t-chart-4', icon: 'bg-chart-4/10 text-chart-4' },
  5: { border: 'border-t-chart-5', icon: 'bg-chart-5/10 text-chart-5' },
}

/** Dashboard metric tile: icon, big value, label and an optional hint line. */
export default function StatCard({ icon: Icon, label, value, hint, tone = 1, loading = false }) {
  const accent = TONES[tone] ?? TONES[1]

  return (
    <Card className={cn('border-t-4 transition-shadow duration-200 hover:shadow-md', accent.border)}>
      <CardContent className="p-5">
        <div className={cn('mb-4 flex h-10 w-10 items-center justify-center rounded-lg', accent.icon)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        {loading ? (
          <div className="h-9 w-20 animate-pulse rounded bg-muted" aria-hidden="true" />
        ) : (
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        )}

        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        {hint && !loading ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {loading ? <span className="sr-only">Loading {label}</span> : null}
      </CardContent>
    </Card>
  )
}
