import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from '@/lib/utils'

const DURATION_MS = 700

const decimalsOf = (n) => (String(n).split('.')[1] || '').length

/**
 * Animates a number up to `target` (ease-out), keeping the target's decimals.
 * Starts from 0 on mount and from the value on screen when the target changes
 * (a refresh with the same value does not re-animate). Non-numbers pass through.
 */
export default function useCountUp(target) {
  const animate = typeof target === 'number' && !prefersReducedMotion()
  const [shown, setShown] = useState(animate ? 0 : target)
  const shownRef = useRef(shown)
  shownRef.current = shown

  useEffect(() => {
    if (typeof target !== 'number' || prefersReducedMotion()) {
      setShown(target)
      return undefined
    }
    const from = typeof shownRef.current === 'number' ? shownRef.current : 0
    if (from === target) return undefined

    const factor = 10 ** decimalsOf(target)
    const start = performance.now()
    let frame
    const tick = (now) => {
      const t = Math.min((now - start) / DURATION_MS, 1)
      const eased = 1 - (1 - t) ** 3
      setShown(Math.round((from + (target - from) * eased) * factor) / factor)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return shown
}
