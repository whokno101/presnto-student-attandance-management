import Sparkline from '@/components/charts/Sparkline'
import { Card, CardContent } from '@/components/ui/card'
import useCountUp from '@/hooks/useCountUp'
import { cn } from '@/lib/utils'

/**
 * Series colours from the chart tokens tint only the sparkline; the label and
 * value always carry the meaning.
 */
const TONES = {
  1: 'text-chart-1',
  2: 'text-chart-2',
  3: 'text-chart-3',
  4: 'text-chart-4',
  5: 'text-chart-5',
}

// Numbers and "87.5%" count up; anything else ("—") is shown as is.
const PERCENT = /^(\d+(?:\.\d+)?)%$/

/**
 * Dashboard metric, set like a boarding-pass segment: a small caps label over a
 * large tabular value, an optional hint line and an optional sparkline (`trend`: values per period, `trendLabel` describes it,
 * `trendMin` pins the floor — see Sparkline).
 */
export default function StatCard({ icon: Icon, label, value, hint, trend, trendLabel, trendMin, tone = 1, loading = false }) {
  const accent = TONES[tone] ?? TONES[1]
  const percent = typeof value === 'string' ? PERCENT.exec(value) : null
  const numeric = typeof value === 'number' ? value : percent ? Number(percent[1]) : null
  const counted = useCountUp(numeric)
  const display = numeric == null ? value : `${counted}${percent ? '%' : ''}`

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-2 font-display text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          {label}
        </p>

        {loading ? (
          <div className="mt-3 h-10 w-24 animate-pulse rounded-md bg-muted" aria-hidden="true" />
        ) : (
          <p className="mt-2 font-display text-[2.75rem] font-semibold leading-none tabular-nums tracking-[-0.01em]">{display}</p>
        )}

        {hint && !loading ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
        {trend && !loading ? <Sparkline values={trend} label={trendLabel} min={trendMin} className={cn('mt-auto h-8 w-full pt-3', accent)} /> : null}
        {loading ? <span className="sr-only">Loading {label}</span> : null}
      </CardContent>
    </Card>
  )
}
