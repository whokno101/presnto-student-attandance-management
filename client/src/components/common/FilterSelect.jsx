import { labelVariants } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Native controls (date, select) sized and styled to match Input and SelectTrigger. */
export const nativeControlClass =
  'flex h-10 w-full rounded-md border border-input bg-card px-3 py-1 text-[0.95rem] transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Radix Select cannot hold '', so "no filter" is this sentinel. */
export const ALL = 'all'

/**
 * Labelled filter select with an "All …" option. `value` of '' (or undefined)
 * means unfiltered; onChange receives '' for "All".
 */
export default function FilterSelect({ id, label, value, onChange, options, allLabel = 'All', className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className={labelVariants()}>
        {label}
      </label>
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? '' : next)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Labelled native date input (keyboard and screen-reader friendly). */
export function DateFilter({ id, label, value, onChange, min, max }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelVariants()}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className={nativeControlClass}
      />
    </div>
  )
}
