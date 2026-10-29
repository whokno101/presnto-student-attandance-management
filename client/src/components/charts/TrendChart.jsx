import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import ChartTooltip from '@/components/charts/ChartTooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const SERIES = 'hsl(var(--chart-1))'
const GRID = 'hsl(var(--border))'
const MUTED = 'hsl(var(--muted-foreground))'
const SURFACE = 'hsl(var(--card))'

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const periodLabel = (period, unit, long = false) => {
  const date = new Date(`${period}T00:00:00.000Z`)
  if (unit === 'week') return `${long ? 'Week of ' : 'Wk '}${DAY.format(date)}`
  return long ? LONG.format(date) : DAY.format(date)
}

/** Only the latest point gets a direct label; the axis and tooltip carry the rest. */
const EndLabel = ({ x, y, value, index, lastIndex }) =>
  index === lastIndex && value != null ? (
    <text x={x} y={y - 12} textAnchor="middle" className="fill-foreground text-xs font-semibold">
      {value}%
    </text>
  ) : null

/**
 * Attendance rate over time (single series: the title names it, so no legend).
 * Crosshair tooltip on hover and keyboard (accessibilityLayer); the same values
 * are always available in the table below.
 */
export default function TrendChart({ title, points, unit = 'day', threshold, height = 260 }) {
  const data = points.map((p) => ({ ...p, label: periodLabel(p.period, unit) }))
  const lastIndex = data.reduce((last, p, i) => (p.rate != null ? i : last), -1)
  const tableId = `trend-table-${title.replace(/\W+/g, '-').toLowerCase()}`

  return (
    <figure className="space-y-3" aria-label={`${title}: line chart of attendance rate by ${unit}. Values are listed in the data table.`}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 24, right: 32, bottom: 0, left: -8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: MUTED, fontSize: 12 }} minTickGap={16} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
              tick={{ fill: MUTED, fontSize: 12 }}
              width={48}
            />
            {threshold != null ? (
              // Explained in the card description; an in-plot label collides with the line.
              <ReferenceLine y={threshold} stroke={MUTED} strokeWidth={1} />
            ) : null}
            <Tooltip
              cursor={{ stroke: MUTED, strokeWidth: 1 }}
              content={
                <ChartTooltip
                  title={(d) => periodLabel(d.period, unit, true)}
                  rows={(d) => [
                    { key: SERIES, value: d.rate == null ? '—' : `${d.rate}%`, label: 'attendance rate' },
                    { value: `${d.attended}/${d.eligible}`, label: 'attended / eligible' },
                    { value: d.absent, label: 'unexcused absences' },
                    { value: d.sessions, label: d.sessions === 1 ? 'session' : 'sessions' },
                  ]}
                />
              }
            />
            <Area type="monotone" dataKey="rate" stroke="none" fill={SERIES} fillOpacity={0.1} isAnimationActive={false} connectNulls={false} />
            <Line
              type="monotone"
              dataKey="rate"
              stroke={SERIES}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
              label={<EndLabel lastIndex={lastIndex} />}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <details className="group rounded-md border text-sm">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-controls={tableId}>
          Show data table
        </summary>
        <div id={tableId} className="max-h-72 overflow-auto border-t">
          <Table>
            <caption className="sr-only">{title}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{unit === 'week' ? 'Week' : 'Day'}</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Attended / eligible</TableHead>
                <TableHead className="text-right">Absences</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.period}>
                  <TableCell>{periodLabel(p.period, unit, true)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.rate == null ? '—' : `${p.rate}%`}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.attended}/{p.eligible}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.absent}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.sessions}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </figure>
  )
}
