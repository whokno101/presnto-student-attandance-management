/**
 * Recharts tooltip body. Value first (strong), label second; rows keyed with a
 * short line in the series colour. Text always uses text tokens, never the
 * series colour.
 */
export default function ChartTooltip({ active, payload, title, rows }) {
  if (!active || !payload?.length) return null
  const datum = payload[0].payload
  const items = rows(datum)

  return (
    <div className="min-w-[160px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 font-medium text-muted-foreground">{title(datum)}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            {item.key ? <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: item.key }} aria-hidden="true" /> : <span className="w-3 shrink-0" aria-hidden="true" />}
            <span className="text-sm font-semibold tabular-nums text-foreground">{item.value}</span>
            <span className="text-muted-foreground">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
