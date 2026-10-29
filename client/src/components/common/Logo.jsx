import { useState } from 'react'

import logoMark from '@/assets/logo-mark.svg'
import logoMarkInverse from '@/assets/logo-mark-inverse.svg'
import { cn } from '@/lib/utils'

export const PRODUCT_NAME = 'UniTrack'

/**
 * Brand logo (PB-21): the SVG mark, optionally followed by the product name.
 *
 * - With the name shown, the mark is decorative (`alt=""`) so screen readers
 *   do not announce "UniTrack UniTrack"; on its own it carries the name.
 * - `inverse` is the white mark for coloured backgrounds (login panel).
 * - If the asset fails to load, a text badge with the initial takes its place
 *   and the name (or an sr-only label) keeps the brand readable.
 */
export default function Logo({ size = 36, showName = true, subtitle, inverse = false, className }) {
  const [failed, setFailed] = useState(false)

  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      {failed ? (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg font-bold',
            inverse ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
          )}
          style={{ width: size, height: size, fontSize: size * 0.45 }}
          aria-hidden="true"
        >
          {PRODUCT_NAME[0]}
        </span>
      ) : (
        <img
          src={inverse ? logoMarkInverse : logoMark}
          width={size}
          height={size}
          alt={showName ? '' : PRODUCT_NAME}
          className="shrink-0"
          onError={() => setFailed(true)}
        />
      )}

      {showName ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">{PRODUCT_NAME}</span>
          {subtitle ? (
            <span className={cn('block truncate text-xs', !inverse && 'text-muted-foreground')}>
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : failed ? (
        <span className="sr-only">{PRODUCT_NAME}</span>
      ) : null}
    </span>
  )
}
