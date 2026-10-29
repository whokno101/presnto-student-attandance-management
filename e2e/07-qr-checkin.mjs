// Step 8 UI: QR check-in (PB-20), including a real camera scan via a fake video device.
import { ARTIFACTS, axeScan, check, launch, login, newPage, open, report, shot, BASE } from './lib.mjs'

const DIR = ARTIFACTS
const browser = await launch()

// ---------------- teacher opens a check-in ----------------
const teacher = await newPage(browser)
const t = teacher.page
await login(t, 'faculty1@university.edu')
await open(t, '/attendance/mark')
await t.waitForSelector('[role=group]')
const tokens = []
t.on('response', async (r) => {
  if (r.url().includes('/token')) tokens.push((await r.json()).data.token)
})
await t.getByRole('button', { name: 'QR check-in' }).click()
await t.waitForURL(/\/attendance\/qr\//)
await t.waitForSelector('[role=img][aria-label^="QR code"] svg')
check('teacher sees a QR code for the session (AC-1)', (await t.locator('main h2').innerText()) === 'QR check-in')
check('top bar names the page', (await t.locator('header h1').innerText()) === 'QR check-in')
check('rotation countdown is shown', await t.getByText('New code in').isVisible())
await axeScan(t, 'QR check-in screen')
await shot(t, 'qr-teacher')
const firstToken = tokens[0]

// ---------------- student checks in from the link ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'student1@university.edu')
  await page.goto(`${BASE}/check-in?token=${encodeURIComponent(tokens.at(-1))}`)
  await page.waitForSelector('text=You are checked in')
  check('a valid scan checks the student in (AC-2)', /Checked in to CS-201/.test(await page.locator('main').innerText()))
  check('the used token is removed from the address bar', !page.url().includes('token='))
  await axeScan(page, 'check-in success')
  await shot(page, 'qr-student-success')

  await page.goto(`${BASE}/check-in?token=${encodeURIComponent(tokens.at(-1))}`)
  await page.waitForSelector('text=Already checked in')
  check('scanning again is harmless (AC-4)', true)
  check('no console errors (student)', page.consoleErrors.filter((e) => !/status of 4\d\d/.test(e)).length === 0)
  await ctx.close()
}

// ---------------- teacher sees the result ----------------
await t.waitForTimeout(3500)
check('teacher sees the check-in in the session view (AC-6)', (await t.locator('main').innerText()).includes('STU-2001'))

// ---------------- not enrolled ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'student2@university.edu')
  await page.goto(`${BASE}/check-in?token=${encodeURIComponent(tokens.at(-1))}`)
  await page.waitForSelector('text=Check-in failed')
  check('a student not enrolled is refused with a reason, on the same page (AC-5)', /not enrolled in CS-201/.test(await page.locator('main').innerText()) && new URL(page.url()).pathname === '/check-in')
  await axeScan(page, 'check-in refused')
  await ctx.close()
}

// ---------------- real camera scan (fake video device) ----------------
{
  // A single JPEG frame works as Chrome's fake camera feed (MJPEG).
  await t.locator('[role=img][aria-label^="QR code"]').screenshot({ path: `${DIR}qr.mjpeg`, type: 'jpeg', quality: 95 })
  const camBrowser = await launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${DIR}qr.mjpeg`],
  })
  const ctx = await camBrowser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] })
  const page = await ctx.newPage()
  await login(page, 'student4@university.edu')
  await open(page, '/check-in')
  await page.getByRole('button', { name: 'Start scanning' }).click()
  const scanned = await page.waitForSelector('text=You are checked in', { timeout: 20000 }).then(() => true).catch(() => false)
  const outcome = await page.locator('main').innerText()
  check('the in-app camera scanner decodes the code and checks in', scanned, outcome.replace(/\s+/g, ' ').slice(0, 160))
  await shot(page, 'qr-camera-scan')
  await camBrowser.close()
}

// ---------------- expired code ----------------
{
  const { ctx, page } = await newPage(browser)
  await login(page, 'student5@university.edu')
  // Wait until the first token is two rotations old.
  await page.waitForTimeout(31000)
  await page.goto(`${BASE}/check-in?token=${encodeURIComponent(firstToken)}`)
  await page.waitForSelector('text=Check-in failed')
  check('an expired code is rejected with a clear message (AC-3)', /expired/.test(await page.locator('main').innerText()))
  await ctx.close()
}

// ---------------- teacher ends the check-in ----------------
await t.getByRole('button', { name: 'End check-in' }).click()
await t.waitForURL(/\/attendance\/mark/)
check('ending the check-in returns to manual marking', true)
check('no console errors (teacher)', t.consoleErrors.length === 0, t.consoleErrors.slice(0, 2).join(' | '))
await teacher.ctx.close()

await browser.close()
report()
