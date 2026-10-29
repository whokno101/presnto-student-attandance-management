import { Badge } from '@/components/ui/badge'
import { percentTone, TONE_BADGE, TONE_BAR } from '@/lib/attendance'
import { cn } from '@/lib/utils'

/**
 * The single place the 90 / 75 rule is rendered: coloured badge + progress bar.
 * Optional `attended` / `marked` add a title with the raw counts.
 */
export default function RateCell({ rate = 0, attended, marked, className }) {
  // Nothing marked yet means there is no rate — not a 0% "at risk" rate.
  if (marked === 0) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <Badge variant="secondary" className="w-16 shrink-0 justify-center text-muted-foreground">
          No data
        </Badge>
      </div>
    )
  }

  const tone = percentTone(rate)
  const safeRate = Math.min(100, Math.max(0, rate))

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Badge
        variant={TONE_BADGE[tone]}
        className="w-16 shrink-0 justify-center tabular-nums"
        title={attended !== undefined ? `${attended} of ${marked} attended` : undefined}
      >
        {rate}%
      </Badge>

      <div
        className="h-1.5 w-full min-w-[60px] max-w-[120px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={safeRate}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Attendance rate"
      >
        <div
          className={cn('h-full rounded-full transition-all', TONE_BAR[tone])}
          style={{ width: `${safeRate}%` }}
        />
      </div>
    </div>
  )
}
