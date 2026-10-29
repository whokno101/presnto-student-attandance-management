import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
/** App under test; screenshots and temp files go to e2e/.artifacts (git-ignored). */
export const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173'
export const ARTIFACTS = new URL('./.artifacts/', import.meta.url).pathname
export const SHOTS = `${ARTIFACTS}shots/`
mkdirSync(SHOTS, { recursive: true })

/** Installed Google Chrome by default; set E2E_BROWSER_CHANNEL= (empty) for Playwright's Chromium. */
export const CHANNEL = process.env.E2E_BROWSER_CHANNEL ?? 'chrome'

export const results = []
export const check = (name, ok, detail = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)

export const axeScan = async (page, label) => {
  await page.waitForTimeout(350)
  await page.addScriptTag({ content: AXE })
  const { violations } = await page.evaluate(() =>
    window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  )
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`
  )
  check(`axe WCAG 2.1 AA: ${label}`, violations.length === 0, summary.join(' ;; '))
}

export const shot = (page, name, opts = {}) => page.screenshot({ path: `${SHOTS}${name}.png`, ...opts })

export const login = async (page, email) => {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#password', 'Password@123')
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  await page.waitForLoadState('networkidle')
}

export const open = async (page, path) => {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
}

export const launch = (options = {}) => chromium.launch({ channel: CHANNEL || undefined, headless: true, ...options })

export const newPage = async (browser, { mobile = false } = {}) => {
  const ctx = await browser.newContext(
    mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } }
  )
  const page = await ctx.newPage()
  page.consoleErrors = []
  page.on('console', (msg) => msg.type() === 'error' && page.consoleErrors.push(msg.text()))
  page.on('pageerror', (err) => page.consoleErrors.push(String(err)))
  return { ctx, page }
}

export const report = () => {
  console.log(results.join('\n'))
  console.log(`\n${results.filter((r) => r.startsWith('FAIL')).length} failing / ${results.length} checks`)
  process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0
}
