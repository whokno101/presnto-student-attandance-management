import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * The board's clock: today's date and the current time in tabular figures.
 * Ticks once a minute, aligned to the minute boundary.
 */
export default function BoardClock({ className, showDay = true }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer
    const schedule = () => {
      const current = new Date()
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60000 - (current.getSeconds() * 1000 + current.getMilliseconds()))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  return (
    <time dateTime={now.toISOString()} className={cn('font-mono text-xs tabular-nums', className)}>
      {showDay ? `${dayFormat.format(now)} · ` : null}
      {timeFormat.format(now)}
    </time>
  )
}
