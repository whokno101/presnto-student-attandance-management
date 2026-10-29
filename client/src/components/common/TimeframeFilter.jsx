import { ChevronDown } from 'lucide-react'

import FilterSelect, { DateFilter, nativeControlClass } from '@/components/common/FilterSelect'
import { labelVariants } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export const TIMEFRAME_OPTIONS = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'quarter', label: 'Last 12 weeks' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]

export const timeframeLabel = (value) => TIMEFRAME_OPTIONS.find((o) => o.value === value)?.label ?? value

/**
 * Date-range filter: presets first, custom range behind the last option.
 * `value` is { timeframe, from, to }.
 */
export default function TimeframeFilter({ idPrefix, value, onChange }) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-timeframe`} className={labelVariants()}>
          Date range
        </label>
        <div className="relative">
          <select
            id={`${idPrefix}-timeframe`}
            value={value.timeframe}
            onChange={(event) => onChange({ ...value, timeframe: event.target.value })}
            className={cn(nativeControlClass, 'appearance-none pe-9')}
          >
            {TIMEFRAME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-3 top-3 h-4 w-4 opacity-50" aria-hidden="true" />
        </div>
      </div>
      {value.timeframe === 'custom' ? (
        <>
          <DateFilter id={`${idPrefix}-from`} label="From" value={value.from} onChange={(from) => onChange({ ...value, from })} max={value.to || undefined} />
          <DateFilter id={`${idPrefix}-to`} label="To" value={value.to} onChange={(to) => onChange({ ...value, to })} min={value.from || undefined} />
        </>
      ) : null}
    </>
  )
}

export { FilterSelect }
