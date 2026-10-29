// Step 4 UI: reports (PB-15), excused status, derived absence counts.
import { readFileSync } from 'node:fs'
import { axeScan, check, launch, login, newPage, open, report, shot } from './lib.mjs'

const browser = await launch()

// ---------------- admin reports ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'admin@university.edu')
  await open(page, '/reports')
  check('Attendance Reports in admin nav', await page.locator('nav a[href="/reports"]', { hasText: 'Attendance Reports' }).isVisible())
  await page.waitForSelector('tbody tr td:nth-child(6)')
  const sessionRows = await page.locator('tbody tr').count()
  check('sessions view lists sessions', sessionRows > 1, `${sessionRows}`)
  const first = await page.locator('tbody tr').first().innerText()
  check('session row shows status counts and a rate', /\d+P · \d+L · \d+A · \d+E/.test(first) && /%/.test(first), first.replace(/\s+/g, ' '))
  await axeScan(page, 'reports: sessions')
  await shot(page, 'reports-sessions')

  // sort by rate ascending
  await Promise.all([page.waitForResponse((r) => r.url().includes('sort=rate')), page.getByRole('button', { name: /^Rate/ }).click()])
  await page.waitForTimeout(300)
  const rates = (await page.locator('tbody tr td:nth-child(6)').allInnerTexts()).map((t) => parseFloat(t))
  check('sorting by rate orders rows', rates.every((r, i) => i === 0 || r >= rates[i - 1]), rates.slice(0, 6).join(','))

  // status filter updates rows and cards together
  const cardsBefore = await page.locator('[aria-live=polite]').first().innerText()
  await page.click('#report-status')
  await Promise.all([page.waitForResponse((r) => r.url().includes('status=excused')), page.getByRole('option', { name: 'Excused' }).click()])
  await page.waitForTimeout(400)
  const body = await page.locator('tbody').innerText()
  const cardsAfter = await page.locator('[aria-live=polite]').first().innerText()
  check('status filter updates the table and the summary cards', cardsBefore !== cardsAfter && /No attendance matches|E/.test(body))
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.waitForLoadState('networkidle')

  // students tab
  await Promise.all([page.waitForResponse((r) => r.url().includes('/reports/students')), page.getByRole('tab', { name: 'Students' }).click()])
  await page.waitForTimeout(400)
  const studentsText = await page.locator('tbody').innerText()
  check('students view shows absence counts and risk', /unexcused/.test(studentsText) && /At risk/.test(studentsText))
  await axeScan(page, 'reports: students')
  await shot(page, 'reports-students')

  // records tab
  await Promise.all([page.waitForResponse((r) => r.url().includes('/reports/records')), page.getByRole('tab', { name: 'Records' }).click()])
  await page.waitForTimeout(400)
  check('records view lists individual records', (await page.locator('tbody tr').count()) > 5)
  await axeScan(page, 'reports: records')

  // export
  await page.getByRole('tab', { name: 'Students' }).click()
  await page.waitForTimeout(500)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
  const path = await download.path()
  const csv = readFileSync(path, 'utf8')
  check('export downloads a CSV of the filtered view', /^﻿?Student ID,Student name,Class code/.test(csv) && csv.split('\r\n').length > 10, download.suggestedFilename())

  check('no console errors (admin reports)', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---------------- faculty: reports + absence counts on the marking sheet ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'faculty1@university.edu')
  await open(page, '/reports')
  check('faculty sees "Class Reports"', (await page.locator('header h1').innerText()) === 'Class Reports')
  await page.waitForSelector('tbody tr td:nth-child(6)')
  const codes = new Set((await page.locator('tbody tr td:nth-child(2) span.font-mono').allInnerTexts()).map((t) => t.trim()))
  check('faculty report only contains their classes', codes.size === 1, [...codes].join(','))
  await axeScan(page, 'faculty class reports')

  await open(page, '/attendance/mark')
  await page.waitForSelector('[role=group]')
  const firstRow = page.locator('tbody tr').first()
  check('Excused is a marking option', await firstRow.getByRole('button', { name: /^Excused for/ }).isVisible())
  const totalsCell = firstRow.locator('td:nth-child(3)')
  const before = parseInt(await totalsCell.innerText(), 10)

  await firstRow.getByRole('button', { name: /^Absent for/ }).click()
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/attendance/mark')),
    page.waitForResponse((r) => r.url().includes('/attendance/class/')),
    page.getByRole('button', { name: 'Save attendance' }).click(),
  ])
  await page.waitForTimeout(300)
  const afterAbsent = parseInt(await page.locator('tbody tr').first().locator('td:nth-child(3)').innerText(), 10)

  await page.locator('tbody tr').first().getByRole('button', { name: /^Present for/ }).click()
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/attendance/mark')),
    page.waitForResponse((r) => r.url().includes('/attendance/class/')),
    page.getByRole('button', { name: 'Save attendance' }).click(),
  ])
  await page.waitForTimeout(300)
  const afterPresent = parseInt(await page.locator('tbody tr').first().locator('td:nth-child(3)').innerText(), 10)
  check('marking Absent then correcting to Present updates the count without a duplicate', afterAbsent === before + 1 && afterPresent === before, `${before} -> ${afterAbsent} -> ${afterPresent}`)
  await axeScan(page, 'mark attendance with totals')
  await shot(page, 'mark-attendance-totals')
  check('no console errors (faculty)', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---------------- student sees excused counts ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'student1@university.edu')
  await open(page, '/my-attendance')
  check('student summary shows an Excused count', await page.locator('dt', { hasText: 'Excused' }).isVisible())
  await axeScan(page, 'student my attendance (excused)')
  await ctx.close()
}

// ---------------- mobile ----------------
{
  const { ctx, page } = await newPage(browser, { mobile: true })
  await login(page, 'admin@university.edu')
  await open(page, '/reports')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('no horizontal page scroll at 390px (/reports)', overflow <= 0, `overflow ${overflow}px`)
  await shot(page, 'mobile-reports')
  await ctx.close()
}

await browser.close()
report()
