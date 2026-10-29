import { useState } from 'react'

import logoMark from '@/assets/logo-mark.svg'
import logoMarkInverse from '@/assets/logo-mark-inverse.svg'
import { cn } from '@/lib/utils'

export const PRODUCT_NAME = 'Presnto'

/**
 * Brand logo (PB-21): the SVG mark, optionally followed by the product name.
 *
 * - With the name shown, the mark is decorative (`alt=""`) so screen readers
 *   do not announce "Presnto Presnto"; on its own it carries the name.
 * - `inverse` is the white mark for coloured backgrounds (login panel).
 * - If the asset fails to load, a text badge with the initial takes its place
 *   and the name (or an sr-only label) keeps the brand readable.
 */
export default function Logo({ size = 36, showName = true, subtitle, inverse = false, className }) {
  const [failed, setFailed] = useState(false)

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {failed ? (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md font-display font-bold',
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
          <span className="block truncate font-display text-xl font-bold uppercase leading-none tracking-[0.08em]">{PRODUCT_NAME}</span>
          {subtitle ? (
            <span className={cn('mt-0.5 block truncate font-display text-[0.72rem] font-medium uppercase tracking-[0.14em]', inverse ? 'text-shell-muted' : 'text-muted-foreground')}>
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
