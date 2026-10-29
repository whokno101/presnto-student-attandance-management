// Runs every end-to-end suite in order against a running app, reseeding the
// database first (and again before the QR suite, which needs untouched
// attendance for today). Exits non-zero if any check fails.
import { execSync, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const ROOT = new URL('../', import.meta.url).pathname
const seed = () => execSync('npm run seed', { cwd: ROOT, stdio: 'ignore' })

const suites = readdirSync(new URL('./', import.meta.url).pathname).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort()
const only = process.argv.slice(2)
let failed = 0

if (!process.env.E2E_SKIP_SEED) seed()
for (const suite of suites.filter((s) => !only.length || only.some((o) => s.includes(o)))) {
  if (suite.startsWith('07') && !process.env.E2E_SKIP_SEED) seed()
  console.log(`\n▶ ${suite}`)
  const { status } = spawnSync(process.execPath, [suite], { cwd: new URL('./', import.meta.url).pathname, stdio: 'inherit' })
  if (status !== 0) failed += 1
}

console.log(failed ? `\n✖ ${failed} suite(s) failed` : '\n✔ all suites passed')
process.exitCode = failed ? 1 : 0
