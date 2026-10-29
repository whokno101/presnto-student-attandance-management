// Step 5 UI: admin analytics (PB-12), faculty insights + notifications (PB-16).
import { axeScan, check, launch, login, newPage, open, report, shot, BASE } from './lib.mjs'

const browser = await launch()

// ---------------- admin analytics ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'admin@university.edu')
  await open(page, '/admin/analytics')
  check('Analytics is in the admin navigation (AC-1)', await page.locator('nav a[href="/admin/analytics"]').isVisible())
  await page.waitForSelector('.recharts-line-curve')
  const kpis = await page.locator('main').innerText()
  check('metrics shown: rate, students, absent, sessions, classes below threshold', ['Overall attendance rate', 'Total students', 'Students absent in period', 'Sessions held', 'Classes below 75%'].every((t) => kpis.includes(t)))
  const trend = page.locator('figure').first()
  check('trend line renders with labelled axes (AC-2)', (await trend.locator('.recharts-line-curve').count()) === 1 && (await trend.locator('.recharts-yAxis .recharts-cartesian-axis-tick').count()) === 5)
  check('selected range is stated', /Showing .*20\d\d-\d\d-\d\d to 20\d\d-\d\d-\d\d/.test(kpis))
  await axeScan(page, 'analytics')
  await shot(page, 'analytics', { fullPage: true })

  // hover tooltip on the trend
  await trend.scrollIntoViewIfNeeded()
  const box = await trend.locator('.recharts-surface').boundingBox()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await page.waitForTimeout(300)
  const tip = await page.locator('.recharts-tooltip-wrapper').first().innerText()
  check('crosshair tooltip shows the value first', /%\s*attendance rate/.test(tip), tip.replace(/\s+/g, ' '))
  await shot(page, 'analytics-tooltip', { clip: { x: box.x - 20, y: box.y - 40, width: box.width + 40, height: box.height + 80 } })

  // keyboard: the chart surface is focusable and arrows move the tooltip
  await page.mouse.move(0, 0)
  await page.locator('.recharts-wrapper').first().focus().catch(() => {})
  await page.locator('.recharts-surface[tabindex="0"]').first().focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  const keyTip = await page.locator('.recharts-tooltip-wrapper').first().innerText()
  check('tooltip is reachable from the keyboard', /attendance rate/.test(keyTip))

  // table view
  await page.getByText('Show data table').first().click()
  check('trend data table is available', (await page.locator('details[open] tbody tr').count()) > 0)

  // AC-3: changing the timeframe updates every metric
  await Promise.all([page.waitForResponse((r) => r.url().includes('timeframe=week')), page.selectOption('#analytics-timeframe', 'week')])
  await page.waitForTimeout(400)
  const weekText = await page.locator('main').innerText()
  check('changing the date range refetches and updates the metrics (AC-3)', weekText !== kpis)

  // AC-4: explicit empty state
  await page.selectOption('#analytics-timeframe', 'custom')
  await page.fill('#analytics-from', '2020-01-01')
  await Promise.all([page.waitForResponse((r) => r.url().includes('to=2020-01-31')), page.fill('#analytics-to', '2020-01-31')])
  await page.waitForTimeout(400)
  check('no data shows an explicit empty state, not zeroes (AC-4)', await page.getByText('No attendance recorded for these filters').isVisible())
  await axeScan(page, 'analytics empty state')

  // AC-5: auto-refresh
  await page.selectOption('#analytics-timeframe', 'month')
  await page.waitForResponse((r) => r.url().includes('/analytics/admin'))
  const refreshed = await page.waitForResponse((r) => r.url().includes('/analytics/admin'), { timeout: 40000 }).then(() => true).catch(() => false)
  check('dashboard refreshes on its own within the refresh interval (AC-5)', refreshed)

  check('no console errors (analytics)', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---------------- faculty insights + notifications ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'faculty1@university.edu')
  const bell = page.locator('header a[href="/notifications"]')
  await page.waitForFunction(() => /unread/.test(document.querySelector('header a[href="/notifications"]')?.getAttribute('aria-label') ?? ''), null, { timeout: 10000 }).catch(() => {})
  const bellLabel = await bell.getAttribute('aria-label')
  check('bell shows the unread count in its accessible name', /Notifications, \d+ unread/.test(bellLabel), bellLabel)

  await open(page, '/insights')
  await page.waitForSelector('text=Students at risk')
  await page.waitForTimeout(500)
  const atRiskRows = await page.locator('table').first().locator('tbody tr').count()
  check('Students at risk lists students with reason and next step', atRiskRows > 0 && (await page.locator('table').first().innerText()).includes('View records'))
  await axeScan(page, 'faculty insights')
  await shot(page, 'insights', { fullPage: true })

  await bell.click()
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('li >> text=is at risk in')
  const riskItem = page.locator('ul li', { hasText: 'is at risk in' }).first()
  const firstAlert = await riskItem.innerText()
  check('alert names the student, class, reason and next step', /is at risk in [A-Z]{2}-\d{3}/.test(firstAlert) && /Next step/.test(firstAlert) && /(below 75%|unexcused absences)/.test(firstAlert))
  await axeScan(page, 'notifications')
  await shot(page, 'notifications')

  await riskItem.getByRole('link', { name: 'Open' }).click()
  await page.waitForURL(/\/insights\?classId=/)
  await page.waitForTimeout(800)
  check('opening an alert lands on insights with the student highlighted', (await page.locator('tr.ring-2').count()) === 1)

  await open(page, '/notifications')
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  await page.waitForTimeout(800)
  check('mark all as read clears the bell', (await bell.getAttribute('aria-label')) === 'Notifications')
  check('no console errors (faculty)', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---------------- access + mobile ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'student1@university.edu')
  await page.goto(`${BASE}/admin/analytics`)
  await page.waitForLoadState('networkidle')
  check('students cannot open analytics', new URL(page.url()).pathname === '/403')
  await ctx.close()

  const m = await newPage(browser, { mobile: true })
  await login(m.page, 'admin@university.edu')
  for (const path of ['/admin/analytics', '/notifications']) {
    await open(m.page, path)
    await m.page.waitForTimeout(500)
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`no horizontal page scroll at 390px (${path})`, overflow <= 0, `overflow ${overflow}px`)
  }
  await shot(m.page, 'mobile-analytics', { fullPage: true })
  await m.ctx.close()
}

await browser.close()
report()
