// Step 6 UI: CSV import/export (PB-17) and absence excuses (PB-19).
import { readFileSync, writeFileSync } from 'node:fs'
import { ARTIFACTS, axeScan, check, launch, login, newPage, open, report, shot } from './lib.mjs'

const DIR = ARTIFACTS
const browser = await launch()

// ---------------- admin import / export ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'admin@university.edu')
  await open(page, '/data')
  check('Import / Export in admin nav', await page.locator('nav a[href="/data"]').isVisible())
  await page.click('#data-dataset')
  const options = await page.getByRole('option').allInnerTexts()
  check('admin can choose every dataset', ['Students', 'Faculty', 'Classes', 'Attendance', 'Class sessions (schedule)'].every((o) => options.includes(o)), options.join(','))
  await page.getByRole('option', { name: 'Students' }).click()
  await axeScan(page, 'import/export page')

  const [exp] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
  const exported = readFileSync(await exp.path(), 'utf8')
  check('exports the dataset as CSV (AC-1)', /^﻿?student_id,name,email,department,active/.test(exported) && exported.split('\r\n').length > 100, exp.suggestedFilename())
  const [tpl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download template' }).click()])
  check('template download has headers and examples', /student_id,name,email,department,password/.test(readFileSync(await tpl.path(), 'utf8')))

  // missing headers (AC-3)
  writeFileSync(`${DIR}bad-headers.csv`, 'student_id,name\r\nSTU-9,Jane\r\n')
  await page.setInputFiles('#data-file', `${DIR}bad-headers.csv`)
  await page.getByRole('button', { name: 'Validate & preview' }).click()
  await page.waitForSelector('[role=alert]')
  check('missing headers are explained before anything happens (AC-3)', /Missing required columns: email, department/.test(await page.locator('[role=alert]').first().innerText()))

  // mixed valid / invalid (AC-4, AC-5)
  const stamp = Date.now().toString().slice(-5)
  writeFileSync(
    `${DIR}mixed.csv`,
    `student_id,name,email,department,password\r\nSTU-${stamp},Imported Person,imp${stamp}@uni.edu,Computer Science,Password@123\r\nSTU-${stamp},Duplicate Person,dup${stamp}@uni.edu,Computer Science,Password@123\r\nSTU-X${stamp},Bad Email,not-an-email,Computer Science,Password@123\r\n`
  )
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.setInputFiles('#data-file', `${DIR}mixed.csv`)
  await page.getByRole('button', { name: 'Validate & preview' }).click()
  await page.waitForSelector('[aria-label="Import summary"]')
  const previewText = await page.locator('main').innerText()
  check('preview shows counts and per-row errors with line numbers (AC-4, AC-5)', /1 create/.test(previewText) && /2 rejected/.test(previewText) && /Duplicate student_id — same as line 2/.test(previewText) && /email is not a valid address/.test(previewText))
  check('preview says nothing has changed yet', /Preview — nothing has been changed yet/.test(previewText))
  await axeScan(page, 'import preview')
  await shot(page, 'import-preview', { fullPage: true })

  await page.getByRole('button', { name: /Confirm import of 1 row/ }).click()
  await page.waitForSelector('text=Import applied')
  const resultText = await page.locator('main').innerText()
  check('commit shows the final report (AC-6)', /1 create/.test(resultText) && /2 rejected/.test(resultText))
  await shot(page, 'import-result', { fullPage: true })

  await open(page, '/admin/activity')
  await page.waitForSelector('tbody tr td:nth-child(5)')
  check('import is in the activity log', (await page.locator('tbody').innerText()).includes('Imported students from mixed.csv'))
  // The deliberate bad-headers upload logs its expected 400 response; anything else is a real error.
  const unexpected = page.consoleErrors.filter((e) => !/status of 400/.test(e))
  check('no console errors (admin data)', unexpected.length === 0, unexpected.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---------------- faculty: attendance only ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'faculty1@university.edu')
  await open(page, '/data')
  await page.click('#data-dataset')
  const options = await page.getByRole('option').allInnerTexts()
  check('faculty can only exchange attendance (AC-2)', options.join(',') === 'Choose a dataset,Attendance', options.join(','))
  await page.keyboard.press('Escape')
  await axeScan(page, 'faculty import/export')
  await ctx.close()
}

// ---------------- excuses: student submits ----------------
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
writeFileSync(`${DIR}note.png`, PNG)
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'student1@university.edu')
  await open(page, '/excuses')
  check('Absence Excuses in student nav', await page.locator('nav a[href="/excuses"]').isVisible())
  await page.waitForSelector('text=Absences you can excuse')
  await axeScan(page, 'student excuses')
  const submitButtons = page.getByRole('button', { name: /^Submit excuse for / })
  const count = await submitButtons.count()
  check('eligible absences are listed', count > 0, `${count}`)
  await submitButtons.first().click()
  await page.waitForSelector('[role=dialog]')

  await page.getByRole('button', { name: 'Submit excuse' }).click()
  await page.waitForTimeout(200)
  const dialogErrors = await page.locator('[role=dialog] [role=alert]').allInnerTexts()
  check('form explains what is missing', dialogErrors.includes('Choose the reason for your absence') && dialogErrors.some((e) => /at least a sentence/.test(e)), dialogErrors.join(' | '))
  await axeScan(page, 'excuse form with errors')

  await page.click('#excuse-category')
  await page.getByRole('option', { name: 'Illness or medical' }).click()
  await page.fill('#excuse-explanation', 'I had a high fever and could not attend.')
  await page.setInputFiles('#excuse-document', `${DIR}note.png`)
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/excuses') && r.request().method() === 'POST'), page.getByRole('button', { name: 'Submit excuse' }).click()])
  await page.waitForTimeout(600)
  const mine = await page.locator('main').innerText()
  check('submitted excuse shows as Pending review (AC-1)', /Pending review/.test(mine) && /note\.png/.test(mine))
  await shot(page, 'student-excuses', { fullPage: true })
  await ctx.close()
}

// ---------------- excuses: teacher reviews ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'faculty1@university.edu')
  await open(page, '/excuses/review')
  await page.waitForSelector('tbody tr')
  check('pending excuses are listed for the teacher (AC-2)', (await page.locator('tbody').innerText()).includes('Pending review'))
  await axeScan(page, 'excuse review list')

  const row = page.locator('tbody tr', { hasText: 'I had a high fever' })
  await row.getByRole('button', { name: /^Review excuse/ }).click()
  await page.waitForSelector('[role=dialog]')
  const [doc] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /note\.png/ }).click()])
  check('teacher can open the supporting document', readFileSync(await doc.path()).equals(PNG))
  await axeScan(page, 'excuse review dialog')
  await shot(page, 'excuse-review-dialog')

  await page.fill('#review-note', 'Get well soon.')
  await Promise.all([page.waitForResponse((r) => r.url().includes('/review')), page.getByRole('button', { name: 'Approve' }).click()])
  await page.waitForTimeout(500)
  await page.getByRole('tab', { name: 'Approved' }).click()
  await page.waitForTimeout(500)
  check('approval records the decision (AC-3)', (await page.locator('tbody').innerText()).includes('I had a high fever'))
  check('no console errors (review)', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ---------------- student sees the decision ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'student1@university.edu')
  await open(page, '/excuses')
  await page.waitForSelector('text=My excuses')
  const text = await page.locator('main').innerText()
  check('student sees the approval, reviewer and note', /Approved/.test(text) && /Elena Marchetti/.test(text) && /Get well soon/.test(text))
  const bell = await page.locator('header a[href="/notifications"]').getAttribute('aria-label')
  check('student is notified of the decision', /unread/.test(bell), bell)
  await ctx.close()
}

// ---------------- mobile ----------------
{
  const { ctx, page } = await newPage(browser, { mobile: true })
  await login(page, 'admin@university.edu')
  for (const path of ['/data', '/excuses/review']) {
    await open(page, path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`no horizontal page scroll at 390px (${path})`, overflow <= 0, `overflow ${overflow}px`)
  }
  await ctx.close()
}

await browser.close()
report()
