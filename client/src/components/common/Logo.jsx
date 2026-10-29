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
 * - `inverse` is for the shell (sidebar, login board): the ink mark on the
 *   light shell, the white mark on the dark one.
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
            inverse ? 'bg-shell-foreground text-shell' : 'bg-primary text-primary-foreground'
          )}
          style={{ width: size, height: size, fontSize: size * 0.45 }}
          aria-hidden="true"
        >
          {PRODUCT_NAME[0]}
        </span>
      ) : inverse ? (
        <>
          <img src={logoMark} width={size} height={size} alt={showName ? '' : PRODUCT_NAME} className="shrink-0 dark:hidden" onError={() => setFailed(true)} />
          <img src={logoMarkInverse} width={size} height={size} alt={showName ? '' : PRODUCT_NAME} className="hidden shrink-0 dark:block" onError={() => setFailed(true)} />
        </>
      ) : (
        <img
          src={logoMark}
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
