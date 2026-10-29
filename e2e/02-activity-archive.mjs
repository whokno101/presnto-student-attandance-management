// Steps 2-3 UI: Activity Log (PB-13) and archive/restore (PB-14).
import { axeScan, check, launch, login, newPage, open, report, shot, BASE } from './lib.mjs'

const browser = await launch()
const { ctx, page } = await newPage(browser)
await login(page, 'admin@university.edu')

// ---- Activity log
await open(page, '/admin/activity')
check('Activity Log is in the admin navigation', await page.locator('nav a[href="/admin/activity"]').isVisible())
await page.waitForSelector('tbody tr td:nth-child(5)')
const rowCount = await page.locator('tbody tr').count()
check('activity entries are listed', rowCount > 1, `${rowCount} rows`)
await axeScan(page, 'activity log')
await shot(page, 'activity-log')

// filter by action type
await page.click('#activity-category')
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/audit?') && r.url().includes('category=class')),
  page.getByRole('option', { name: 'Classes' }).click(),
])
await page.waitForTimeout(300)
const afterFilter = await page.locator('tbody').innerText()
check('action-type filter narrows the list', /Archived|Restored|Created class|No activity found/.test(afterFilter) && !/Submitted attendance|Marked |Changed /.test(afterFilter), afterFilter.slice(0, 160).replace(/\s+/g, ' '))
await page.getByRole('button', { name: 'Reset filters' }).first().click()
await page.waitForLoadState('networkidle')

// detail dialog
await page.locator('tbody tr').first().getByRole('button').click()
await page.waitForSelector('[role=dialog]')
check('detail dialog opens', await page.locator('[role=dialog] dt', { hasText: 'Who' }).isVisible())
await axeScan(page, 'activity detail dialog')
await page.keyboard.press('Escape')

// submissions tab
await page.getByRole('tab', { name: 'Submission timeliness' }).click()
await page.waitForLoadState('networkidle')
await page.waitForSelector('[aria-label="Submission summary"]')
const summaryText = await page.locator('[aria-label="Submission summary"]').innerText()
check('submission summary shows on-time, late and missing counts', /On time/.test(summaryText) && /Missing/.test(summaryText), summaryText.replace(/\n/g, ' '))
await page.getByRole('button', { name: /Missing/ }).click()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(300)
const missingRows = await page.locator('tbody tr').allInnerTexts()
check('missing submissions are listed and highlighted', missingRows.length >= 1 && missingRows.every((t) => /Missing/.test(t) && /overdue/.test(t)), missingRows.join(' | ').slice(0, 200))
await axeScan(page, 'submission timeliness')
await shot(page, 'submissions')

// ---- Archive / restore
await open(page, '/admin/classes')
await page.waitForSelector('button[aria-label^="Archive "]')
const archiveBtn = page.locator('button[aria-label^="Archive "]').first()
const code = (await archiveBtn.getAttribute('aria-label')).replace('Archive ', '')
await archiveBtn.click()
await page.waitForSelector('[role=dialog]')
const dialogText = await page.locator('[role=dialog]').innerText()
check('archive dialog names the class and says history is retained', dialogText.includes(code) && /retained/.test(dialogText))
const confirmBtn = page.getByRole('button', { name: 'Archive class' })
check('confirm is disabled until the class code is typed', await confirmBtn.isDisabled())
await axeScan(page, 'archive confirmation dialog')
await shot(page, 'archive-dialog')

// AC-2: cancel leaves everything unchanged
await page.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(300)
check('cancel keeps the class active', await page.locator(`button[aria-label="Archive ${code}"]`).isVisible())

await page.locator(`button[aria-label="Archive ${code}"]`).click()
await page.waitForSelector('[role=dialog]')
await page.getByLabel(/Type .* to confirm/).fill(code.toLowerCase())
check('typing the code enables confirm', await confirmBtn.isEnabled())
await confirmBtn.click()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(500)
check('archived class leaves the active list', (await page.locator(`button[aria-label="Archive ${code}"]`).count()) === 0)

await page.getByRole('tab', { name: /Archived/ }).click()
await page.waitForTimeout(400)
const archivedRow = page.locator('tbody tr', { hasText: code })
const archivedText = await archivedRow.innerText()
check('archived tab shows the class with days left to restore', /\d+ days left/.test(archivedText) && /Alice Admin/.test(archivedText), archivedText.replace(/\s+/g, ' '))
await axeScan(page, 'archived classes tab')
await shot(page, 'archived-tab')

await page.getByRole('button', { name: `Restore ${code}` }).click()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(500)
await page.getByRole('tab', { name: /^Active/ }).click()
await page.waitForTimeout(300)
check('restore puts the class back in the active list', await page.locator(`button[aria-label="Archive ${code}"]`).isVisible())

// the archive + restore were audited
await open(page, '/admin/activity')
await page.waitForSelector('tbody tr td:nth-child(5)')
const latest = await page.locator('tbody').innerText()
check('archive and restore appear in the activity log', latest.includes(`Restored ${code}`) && latest.includes(`Archived ${code}`))

check('no console errors (admin)', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '))
await ctx.close()

// ---- non-admin cannot open the log
{
  const { ctx: c2, page: p2 } = await newPage(browser)
  await login(p2, 'faculty1@university.edu')
  await p2.goto(`${BASE}/admin/activity`)
  await p2.waitForLoadState('networkidle')
  check('faculty is blocked from the activity log', new URL(p2.url()).pathname === '/403')
  check('faculty nav has no Activity Log link', (await p2.locator('nav a[href="/admin/activity"]').count()) === 0)
  await c2.close()
}

// ---- mobile layout
{
  const { ctx: c3, page: p3 } = await newPage(browser, { mobile: true })
  await login(p3, 'admin@university.edu')
  for (const path of ['/admin/activity', '/admin/classes']) {
    await open(p3, path)
    const overflow = await p3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`no horizontal page scroll at 390px (${path})`, overflow <= 0, `overflow ${overflow}px`)
  }
  await shot(p3, 'mobile-activity')
  await c3.close()
}

await browser.close()
report()
