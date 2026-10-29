/**
 * WCAG 2.1 contrast check for the design tokens in src/index.css (PB-18 AC-3).
 *
 * Reads the HSL custom properties for the light (:root) and dark (.dark)
 * themes and verifies every foreground/background pairing the components use.
 *   Text            >= 4.5:1  (AA, normal text)
 *   UI boundaries   >= 3:1    (AA, non-text: focus ring, input borders)
 *
 * Usage: npm run check:contrast --workspace=client
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8')

const readTheme = (selector) => {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`No ${selector} block in index.css`)
  const block = css.slice(start, css.indexOf('}', start))
  const vars = {}
  for (const [, name, h, s, l] of block.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    vars[name] = [Number(h), Number(s) / 100, Number(l) / 100]
  }
  return vars
}

const hslToRgb = ([h, s, l]) => {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

const luminance = (hsl) =>
  hslToRgb(hsl)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = 4.5
const UI = 3

/** [foreground token, background token, minimum, where it is used] */
const PAIRS = [
  ['foreground', 'background', TEXT, 'body text'],
  ['card-foreground', 'card', TEXT, 'card text'],
  ['muted-foreground', 'background', TEXT, 'secondary text'],
  ['muted-foreground', 'muted', TEXT, 'secondary text on muted surfaces'],
  ['primary-foreground', 'primary', TEXT, 'primary buttons'],
  ['primary', 'background', TEXT, 'links, active nav'],
  ['secondary-foreground', 'secondary', TEXT, 'secondary buttons/badges'],
  ['accent-foreground', 'accent', TEXT, 'hovered nav/menu items'],
  ['destructive-foreground', 'destructive', TEXT, 'Absent badge, error toast'],
  ['destructive', 'background', TEXT, 'error messages, low-rate text'],
  ['success-foreground', 'success', TEXT, 'Present badge, success toast'],
  ['success', 'background', TEXT, 'on-track rate text'],
  ['warning-foreground', 'warning', TEXT, 'Late badge'],
  ['warning', 'background', TEXT, 'watch-rate text'],
  ['info-foreground', 'info', TEXT, 'Excused badge'],
  ['ring', 'background', UI, 'focus ring'],
  ['input', 'background', UI, 'form control borders'],
]

let failures = 0
for (const [theme, selector] of [['light', ':root'], ['dark', '.dark']]) {
  const vars = readTheme(selector)
  console.log(`\n${theme} theme`)
  for (const [fg, bg, min, use] of PAIRS) {
    if (!vars[fg] || !vars[bg]) {
      console.log(`  MISSING  --${fg} / --${bg}`)
      failures += 1
      continue
    }
    const value = ratio(vars[fg], vars[bg])
    const ok = value >= min
    if (!ok) failures += 1
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${value.toFixed(2).padStart(5)}:1 (min ${min})  ${fg} on ${bg}  — ${use}`)
  }
}

if (failures) {
  console.error(`\n${failures} contrast check(s) failed`)
  process.exit(1)
}
console.log('\nAll token pairs meet WCAG 2.1 AA')
