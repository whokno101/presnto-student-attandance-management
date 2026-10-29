import { useId } from 'react'

const W = 100
const H = 32
const PAD = 3

/**
 * Tiny trend line for stat cards. Draws in `currentColor` (set a text colour on
 * a parent) and stretches to the card width. Null values break the line.
 * Scaled to its own min/max (direction, not magnitude) unless `min` pins the
 * floor, e.g. 0 for counts so a drop of one does not look like a collapse.
 */
export default function Sparkline({ values, label, min: floor, className }) {
  const gradientId = `spark${useId().replace(/:/g, '')}`
  const known = values.filter((v) => v != null)
  if (known.length < 2) return null

  const min = floor ?? Math.min(...known)
  const max = Math.max(...known)
  const x = (i) => (i / (values.length - 1)) * W
  const y = (v) => (max === min ? H / 2 : H - PAD - ((v - min) / (max - min)) * (H - PAD * 2))

  // Split into runs of consecutive known values.
  const runs = []
  values.forEach((v, i) => {
    if (v == null) return
    if (i === 0 || values[i - 1] == null) runs.push([])
    runs[runs.length - 1].push([x(i), y(v)])
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {runs.map((run, i) => {
        const line = run.map(([px, py], j) => `${j ? 'L' : 'M'}${px},${py}`).join(' ')
        return (
          <g key={i}>
            {run.length > 1 ? <path d={`${line} L${run.at(-1)[0]},${H} L${run[0][0]},${H} Z`} fill={`url(#${gradientId})`} /> : null}
            <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        )
      })}
    </svg>
  )
}
