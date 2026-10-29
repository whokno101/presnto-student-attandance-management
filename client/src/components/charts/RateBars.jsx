import { AlertTriangle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import ChartTooltip from '@/components/charts/ChartTooltip'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const SERIES = 'hsl(var(--chart-1))'
const GRID = 'hsl(var(--border))'
const MUTED = 'hsl(var(--muted-foreground))'

/**
 * Horizontal bars: attendance rate per class (one hue — the bars compare one
 * measure). Below-threshold classes are flagged with an icon + label in the
 * table, never by colour alone. Value at each bar tip; table view below.
 */
export default function RateBars({ title, rows, threshold }) {
  const charted = rows.filter((r) => r.rate != null)
  const height = Math.max(120, charted.length * 32 + 40)
  const tableId = `bars-table-${title.replace(/\W+/g, '-').toLowerCase()}`

  return (
    <figure className="space-y-3" aria-label={`${title}: bar chart of attendance rate per class. Values are listed in the data table.`}>
      {charted.length ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charted} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap={8} accessibilityLayer>
              <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
              <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: MUTED, fontSize: 12 }} />
              <YAxis type="category" dataKey="code" width={72} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
              {threshold != null ? <ReferenceLine x={threshold} stroke={MUTED} strokeWidth={1} /> : null}
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                content={
                  <ChartTooltip
                    title={(d) => `${d.code} — ${d.name}`}
                    rows={(d) => [
                      { key: SERIES, value: `${d.rate}%`, label: 'attendance rate' },
                      { value: d.absent, label: 'unexcused absences' },
                      { value: d.enrolled, label: 'enrolled' },
                    ]}
                  />
                }
              />
              <Bar dataKey="rate" fill={SERIES} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="rate" position="right" formatter={(v) => `${v}%`} className="fill-foreground text-xs font-medium" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <details className="rounded-md border text-sm">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-controls={tableId}>
          Show data table
        </summary>
        <div id={tableId} className="max-h-80 overflow-auto border-t">
          <Table>
            <caption className="sr-only">{title}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Class</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Absences</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.classId}>
                  <TableCell>
                    <span className="whitespace-nowrap font-mono text-xs">{r.code}</span> <span className="text-muted-foreground">{r.name}</span>
                    {r.archived ? (
                      <Badge variant="secondary" className="ml-2">
                        Archived
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.enrolled}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {r.rate == null ? (
                      <span className="text-muted-foreground">No data</span>
                    ) : (
                      <>
                        {r.belowThreshold ? (
                          <Badge variant="warning" className="mr-2">
                            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                            Below {threshold}%
                          </Badge>
                        ) : null}
                        {r.rate}%
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </figure>
  )
}
