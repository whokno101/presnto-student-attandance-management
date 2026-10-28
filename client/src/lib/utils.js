import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names and de-duplicate Tailwind utilities. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
