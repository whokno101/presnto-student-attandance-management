import { flushSync } from 'react-dom'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/ThemeContext'
import { cn, prefersReducedMotion } from '@/lib/utils'

const REVEAL_MS = 450

/**
 * Flips between light and dark, based on what is on screen (so a 'system'
 * default always switches visibly on the first click). The icon shows the
 * current theme; the accessible name says what a click does.
 *
 * Where the View Transitions API exists, the new theme spreads in a circle
 * from the button; elsewhere (or with reduced motion) it switches instantly.
 */
export default function ThemeToggle({ className }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const Icon = isDark ? Moon : Sun
  const description = `Switch to ${isDark ? 'light' : 'dark'} theme`

  const toggle = (event) => {
    const next = isDark ? 'light' : 'dark'
    if (!document.startViewTransition || prefersReducedMotion()) {
      setTheme(next)
      return
    }

    const { left, top, width, height } = event.currentTarget.getBoundingClientRect()
    const x = left + width / 2
    const y = top + height / 2
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const root = document.documentElement

    // No colour transitions inside the reveal, or the new view would fade too.
    root.classList.add('theme-switching')
    const transition = document.startViewTransition(() => flushSync(() => setTheme(next)))
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' }
      )
    })
    transition.finished.finally(() => root.classList.remove('theme-switching'))
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(className)}
      onClick={toggle}
      aria-label={description}
      title={description}
    >
      <Icon className="h-5 w-5" />
    </Button>
  )
}
