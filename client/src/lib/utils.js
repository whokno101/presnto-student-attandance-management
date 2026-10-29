import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names and de-duplicate Tailwind utilities. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/** JS animations must check this themselves; the CSS reduced-motion rule only covers CSS. */
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
