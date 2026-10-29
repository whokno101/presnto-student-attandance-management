// Step 7 UI: multi-date scheduling (PB-22) and conflict resolution (PB-23).
import { axeScan, check, launch, login, newPage, open, report, shot } from './lib.mjs'

const browser = await launch()
const { ctx, page } = await newPage(browser)
await login(page, 'admin@university.edu')
await open(page, '/admin/schedule')
check('Schedule is in the admin navigation', await page.locator('nav a[href="/admin/schedule"]').isVisible())
await axeScan(page, 'schedule page')

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}
const room = `Z-${Date.now().toString().slice(-4)}`

const fillSlot = async (classLabel) => {
  await page.click('#schedule-class')
  await page.getByRole('option', { name: classLabel }).click()
  await page.fill('#schedule-room', room)
  await page.fill('#schedule-start', '07:00')
  await page.fill('#schedule-end', '08:00')
}

// validation feedback
await page.getByRole('button', { name: 'Preview dates' }).click()
check('explains what is missing before previewing', (await page.locator('[role=alert]').innerText()).includes('Choose a class'))

// individual dates from the calendar + a weekly pattern
await fillSlot(/^CS-201/)
const enabledDays = page.locator('.rdp button[name="day"]:not([disabled])')
await enabledDays.nth(Math.max(0, (await enabledDays.count()) - 2)).click()
const weekday = plus(3).toLocaleDateString('en-US', { weekday: 'long' })
await page.getByRole('button', { name: weekday, exact: true }).click()
await page.fill('#schedule-from', ymd(plus(1)))
await page.fill('#schedule-to', ymd(plus(22)))
await Promise.all([page.waitForResponse((r) => r.url().includes('/schedule/preview')), page.getByRole('button', { name: 'Preview dates' }).click()])
await page.waitForTimeout(300)
const rows = page.locator('table', { has: page.locator('caption', { hasText: 'Proposed sessions' }) }).locator('tbody tr')
const total = await rows.count()
check('preview lists calendar dates and the weekly occurrences (PB-22)', total >= 4, `${total} occurrences`)
check('every occurrence was checked and is available', (await rows.filter({ hasText: 'Available' }).count()) === total)
await axeScan(page, 'schedule preview')
await shot(page, 'schedule-preview', { fullPage: true })

// remove one date, then save
await rows.first().getByRole('button', { name: /^Remove / }).click()
check('a date can be removed from the proposed set', /\d+ of \d+ dates kept/.test(await page.locator('main').innerText()))
await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/schedule') && r.request().method() === 'POST'), page.getByRole('button', { name: /^Save \d+ session/ }).click()])
await page.waitForTimeout(600)
const upcoming = await page.locator('table').last().innerText()
check('saved sessions appear in the upcoming list with room and teacher', upcoming.includes(room) && upcoming.includes('Elena Marchetti'))

// conflict: another class, same room and slot
await fillSlot(/^IS-410/)
await page.getByRole('button', { name: weekday, exact: true }).click()
await page.fill('#schedule-from', ymd(plus(1)))
await page.fill('#schedule-to', ymd(plus(22)))
await Promise.all([page.waitForResponse((r) => r.url().includes('/schedule/preview')), page.getByRole('button', { name: 'Preview dates' }).click()])
await page.waitForTimeout(300)
const previewText = await page.locator('table', { has: page.locator('caption', { hasText: 'Proposed sessions' }) }).innerText()
check('overlapping room bookings are flagged with the reason (PB-23)', new RegExp(`Room ${room} is already booked for CS-201 07:00–08:00`).test(previewText))
check('save is blocked while conflicts remain', await page.getByRole('button', { name: /^Save \d+ session/ }).isDisabled())
await axeScan(page, 'schedule conflicts')
await shot(page, 'schedule-conflicts', { fullPage: true })

// cancel one session
await page.getByRole('button', { name: 'Clear' }).click()
const cancelBtn = page.locator('table').last().getByRole('button', { name: /^Cancel CS-201/ }).first()
await cancelBtn.click()
await page.waitForSelector('[role=dialog]')
check('cancel dialog names the session and says it is kept as history', /kept as history/.test(await page.locator('[role=dialog]').innerText()))
await Promise.all([page.waitForResponse((r) => r.request().method() === 'DELETE'), page.getByRole('button', { name: 'Cancel session' }).click()])
await page.waitForTimeout(500)
check('no console errors (schedule)', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '))
await ctx.close()

const m = await newPage(browser, { mobile: true })
await login(m.page, 'admin@university.edu')
await open(m.page, '/admin/schedule')
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check('no horizontal page scroll at 390px (/admin/schedule)', overflow <= 0, `overflow ${overflow}px`)
await shot(m.page, 'mobile-schedule', { fullPage: true })
await m.ctx.close()

await browser.close()
report()
