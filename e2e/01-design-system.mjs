// Step 1 UI verification: axe-core WCAG scan per page + keyboard behaviours + screenshots.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
import { BASE, SHOTS, launch } from './lib.mjs'

const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)

const axeScan = async (page, label) => {
  await page.addScriptTag({ content: AXE })
  const { violations } = await page.evaluate(() =>
    window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  )
  const summary = violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
  check(`axe WCAG 2.1 AA: ${label}`, violations.length === 0, summary.join(' ;; '))
}

const login = async (page, email) => {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#password', 'Password@123')
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  await page.waitForLoadState('networkidle')
}

const browser = await launch()

// ---------------- desktop ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()))

  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  check('favicon link', (await page.getAttribute('link[rel=icon]', 'href')) === '/favicon.svg')
  const favicon = await page.request.get(`${BASE}/favicon.svg`)
  check('favicon served', favicon.ok() && (await favicon.text()).includes('<svg'))
  const logoImgs = await page.$$eval('img', (imgs) => imgs.map((i) => ({ alt: i.alt, ok: i.complete && i.naturalWidth > 0 })))
  check('login logo images load', logoImgs.length > 0 && logoImgs.every((i) => i.ok), JSON.stringify(logoImgs))
  check('logo beside name is decorative (alt="")', logoImgs.every((i) => i.alt === ''))
  await axeScan(page, 'login')
  await page.screenshot({ path: `${SHOTS}login-desktop.png` })

  await login(page, 'admin@university.edu')
  await page.screenshot({ path: `${SHOTS}admin-dashboard.png` })
  await axeScan(page, 'admin dashboard')

  // Skip link: first Tab stop, visible, moves focus to main
  await page.keyboard.press('Tab')
  const skip = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), width: document.activeElement?.getBoundingClientRect().width }))
  check('skip link is first tab stop and visible', skip.text === 'Skip to main content' && skip.width > 50, JSON.stringify(skip))
  await page.screenshot({ path: `${SHOTS}skip-link.png`, clip: { x: 0, y: 0, width: 500, height: 120 } })
  await page.keyboard.press('Enter')
  check('skip link moves focus to main', (await page.evaluate(() => document.activeElement?.id)) === 'main-content')

  // Focus ring on nav link
  await page.focus('nav a[href="/admin/students"]')
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab')
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow)
  check('nav link shows a focus ring', ring && ring !== 'none', ring)

  for (const [path, label] of [['/admin/students', 'manage students'], ['/admin/faculty', 'manage faculty'], ['/admin/classes', 'manage classes'], ['/admin/attendance', 'attendance overview'], ['/attendance/mark', 'mark attendance (admin)']]) {
    await page.goto(`${BASE}${path}`)
    await page.waitForLoadState('networkidle')
    await axeScan(page, label)
    await page.screenshot({ path: `${SHOTS}${label.replace(/\W+/g, '-')}.png`, fullPage: false })
    if (path === '/admin/attendance') {
      const bg = await page.evaluate(() => {
        const badge = [...document.querySelectorAll('td span')].find((el) => /%$/.test(el.textContent.trim()))
        return badge ? getComputedStyle(badge).backgroundColor : null
      })
      check('rate badges render their status colour', bg && !['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'].includes(bg), String(bg))
      const accent = await page.evaluate(() => getComputedStyle(document.querySelector('.border-t-4')).borderTopColor)
      check('stat card accent renders', accent && accent !== 'rgb(226, 232, 240)', accent)
    }
  }

  // Form field a11y wiring: open Add Student, touch name, check aria
  await page.goto(`${BASE}/admin/students`)
  await page.waitForLoadState('networkidle')
  const addButton = page.getByRole('button', { name: 'Add Student' })
  await addButton.click()
  await page.waitForSelector('#student-name')
  await page.focus('#student-name')
  await page.fill('#student-name', 'x')
  await page.fill('#student-name', '')
  await page.keyboard.press('Tab')
  const aria = await page.evaluate(() => {
    const el = document.getElementById('student-name')
    const described = el.getAttribute('aria-describedby')
    return { invalid: el.getAttribute('aria-invalid'), described, text: described ? document.getElementById(described)?.textContent : null }
  })
  check('field error linked via aria-describedby + aria-invalid', aria.invalid === 'true' && aria.text === 'Full name is required', JSON.stringify(aria))
  const hintAria = await page.evaluate(() => {
    const el = document.getElementById('student-password')
    const d = el.getAttribute('aria-describedby')
    return d ? document.getElementById(d)?.textContent : null
  })
  check('hint linked via aria-describedby', hintAria === 'Minimum 8 characters.', String(hintAria))
  await page.waitForTimeout(400) // let the open animation finish before measuring colours
  await axeScan(page, 'add student dialog')
  await page.screenshot({ path: `${SHOTS}add-student-dialog.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape closes dialog and returns focus to opener', (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Add Student')

  check('no console errors (desktop)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ---------------- faculty + student pages ----------------
for (const [email, pages] of [
  ['faculty1@university.edu', [['/classes', 'faculty my classes'], ['/attendance/mark', 'faculty mark attendance']]],
  ['student1@university.edu', [['/enroll', 'student enroll'], ['/classes', 'student my classes'], ['/my-attendance', 'student my attendance']]],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  await login(page, email)
  for (const [path, label] of pages) {
    await page.goto(`${BASE}${path}`)
    await page.waitForLoadState('networkidle')
    await axeScan(page, label)
    await page.screenshot({ path: `${SHOTS}${label.replace(/\W+/g, '-')}.png` })
  }
  if (email.startsWith('faculty')) {
    // Attendance toggle focus ring
    const toggle = page.locator('[role=group] button').first()
    await toggle.focus()
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow)
    check('attendance toggle shows a focus ring', ring && ring !== 'none', ring)
  }
  await ctx.close()
}

// ---------------- mobile ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${SHOTS}login-mobile.png` })
  await login(page, 'admin@university.edu')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('no horizontal page scroll at 390px (dashboard)', overflow <= 0, `overflow ${overflow}px`)
  await page.screenshot({ path: `${SHOTS}dashboard-mobile.png` })

  const menu = page.getByRole('button', { name: 'Open navigation menu' })
  await menu.click()
  await page.waitForSelector('[role=dialog]')
  await page.waitForTimeout(500) // slide-in animation
  const inDrawer = await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))
  check('drawer moves focus inside', inDrawer)
  await page.screenshot({ path: `${SHOTS}drawer-mobile.png` })
  // focus trap: tab many times, focus stays in drawer
  for (let i = 0; i < 15; i += 1) await page.keyboard.press('Tab')
  check('drawer traps focus', await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]'))))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  check('Escape closes drawer', (await page.$('[role=dialog]')) === null)
  check('focus returns to menu button', (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Open navigation menu')

  for (const path of ['/admin/students', '/admin/attendance']) {
    await page.goto(`${BASE}${path}`)
    await page.waitForLoadState('networkidle')
    const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`no horizontal page scroll at 390px (${path})`, o <= 0, `overflow ${o}px`)
    await page.screenshot({ path: `${SHOTS}mobile${path.replace(/\//g, '-')}.png` })
  }
  await ctx.close()
}

// ---------------- logo fallback ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  // Block only the image fetch — not Vite's JS module import of the asset.
  await page.route(/logo-mark.*\.svg/, (route) => (route.request().resourceType() === 'image' ? route.abort() : route.continue()))
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  const imgs = await page.$$('img')
  const nameVisible = await page.getByText('UniTrack', { exact: true }).filter({ visible: true }).count() > 0
  const fallbackBadge = await page.locator('span[aria-hidden=true]', { hasText: /^U$/ }).filter({ visible: true }).count()
  check('logo fallback replaces a broken image', imgs.length === 0 && nameVisible && fallbackBadge > 0, `imgs=${imgs.length} name=${nameVisible} badge=${fallbackBadge}`)
  await page.screenshot({ path: `${SHOTS}logo-fallback.png`, clip: { x: 0, y: 0, width: 1280, height: 200 } })
  await ctx.close()
}

await browser.close()
console.log(results.join('\n'))
console.log(`\n${results.filter((r) => r.startsWith('FAIL')).length} failing / ${results.length} checks`)
process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0
