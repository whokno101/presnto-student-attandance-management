# Sprint 02 — test report, Definition of Done and demo script

Evidence for the Sprint 02 Execution Handbook (PB-12 – PB-23), handbook §17
(minimum QA matrix) and §18 (Definition of Done).

## How to reproduce

```bash
npm test --workspace=server              # API: 90 tests, in-memory MongoDB
npm run dev:server & npm run dev:client &
cd e2e && npm install && npm test        # browser: 7 suites, 165 checks (reseeds the DB)
npm run check:contrast --workspace=client   # design tokens vs WCAG 2.1 AA
```

## Results

| Suite | Scope | Result |
| --- | --- | --- |
| `server/test/regressions.test.js` | Validation messages, real dates, institution "today", overview, query-injection hardening, security headers | 12 / 12 pass |
| `server/test/audit-archive.test.js` | PB-13 activity log, PB-14 deletion protection | 14 / 14 pass |
| `server/test/reports.test.js` | PB-15 reports, filters, absence counting, CSV export | 10 / 10 pass |
| `server/test/analytics-risk.test.js` | PB-12 analytics, PB-16 insights and alerts | 16 / 16 pass |
| `server/test/data-excuses.test.js` | PB-17 CSV import/export, PB-19 excuses | 19 / 19 pass |
| `server/test/schedule.test.js` | PB-22 multi-date scheduling, PB-23 conflicts | 11 / 11 pass |
| `server/test/qr.test.js` | PB-20 QR check-in (mocked clock) | 8 / 8 pass |
| `e2e/01-design-system.mjs` | PB-18/PB-21: axe scan of every page for every role, skip link, focus management, 390px layouts, logo fallback | 35 / 35 pass |
| `e2e/02-activity-archive.mjs` | Activity Log UI, timeliness, archive → archived tab → restore | 24 / 24 pass |
| `e2e/03-reports.mjs` | Reports UI, sorting, filters, CSV download, absence counts on the marking sheet | 22 / 22 pass |
| `e2e/04-analytics-alerts.mjs` | Analytics charts, tooltip (hover and keyboard), empty state, auto-refresh, insights, notifications | 24 / 24 pass |
| `e2e/05-data-excuses.mjs` | Import preview/commit, role limits, excuse submit → review → decision | 30 / 30 pass |
| `e2e/06-schedule.mjs` | Calendar + weekly scheduling, conflict flagging, cancellation | 14 / 14 pass |
| `e2e/07-qr-checkin.mjs` | QR screen, link and **real camera** scans (fake video device), expiry, enrolment, idempotence | 16 / 16 pass |
| Contrast check | 34 token pairs, light and dark themes | all ≥ AA |

Browser checks run in headless Google Chrome with axe-core 4.10 (WCAG 2.0/2.1 A
and AA rules). Every page and dialog in the sprint is scanned in at least one
state with zero violations.

## Handbook §17 — minimum QA / regression matrix

| Area | Scenario | Expected | Evidence |
| --- | --- | --- | --- |
| Analytics | Date/class filters vs chart totals | Metrics and charts match the same filtered set | `analytics-risk` "AC-3 … consistently" (also cross-checks the report rate); e2e 04 |
| Audit log | Faculty changes Present → Absent | New immutable entry with change and actor | `audit-archive` "AC-2", "AC-4 cannot be modified" |
| Deletion | Cancel an archive | No state change | e2e 02 "cancel keeps the class active" |
| Deletion | Archive a class with history | Inactive; history available | `audit-archive` "AC-3 … keeps its attendance history"; e2e 02 |
| Attendance | Absent, then corrected to Present | Count recalculated, no double count | `reports` "AC-4"; e2e 03 "1 → 2 → 1" |
| Risk alert | Crosses 4 unexcused / 75% | One actionable alert | `analytics-risk` "AC-2", "both thresholds at once", "AC-5 never repeats" |
| CSV | Invalid dates / unknown ids | Flagged before commit | `data-excuses` "AC-4"; e2e 05 |
| CSV permissions | Faculty imports faculty list | Denied server-side | `data-excuses` "AC-2" (403) |
| Excuse | Submit and leave pending | Attendance not changed | `data-excuses` "AC-4 pending excuse" |
| QR | Expired token, double scan | Rejected; no duplicate | `qr` "two rotations old", "AC-4 … never duplicates"; e2e 07 |
| Schedule | Overlapping room/instructor | Rejected with explanation | `schedule` "overlapping room", "overlapping instructor", "concurrent saves"; e2e 06 |
| Accessibility | Forms and dialogs by keyboard | Visible focus, operable, focus returned | e2e 01 (skip link, drawer trap, Escape, focus return, aria wiring) |

## Acceptance criteria coverage

| Item | Criteria | Covered by |
| --- | --- | --- |
| PB-12 | AC-1 – AC-5 | `analytics-risk` (PB-12 block); e2e 04 |
| PB-13 | AC-1 – AC-5 | `audit-archive` (PB-13 block); e2e 02 |
| PB-14 | AC-1 – AC-6 | `audit-archive` (PB-14 block); e2e 02 |
| PB-15 | AC-1 – AC-6 | `reports`; e2e 03 |
| PB-16 | AC-1 – AC-6 | `analytics-risk` (PB-16 block); e2e 04 |
| PB-17 | AC-1 – AC-6 | `data-excuses` (PB-17 block); e2e 05 |
| PB-18 | AC-1 – AC-5 | contrast check; e2e 01 (axe on every page, keyboard, 390px layouts) |
| PB-19 | AC-1 – AC-5 | `data-excuses` (PB-19 block); e2e 05 |
| PB-20 | AC-1 – AC-6 | `qr`; e2e 07 |
| PB-21 | Logo, favicon, fallback | e2e 01 (favicon served, decorative alt, broken-image fallback) |
| PB-22 | Multi-date, preview, removal, reporting | `schedule`; e2e 06 |
| PB-23 | Room, instructor, adjacency, concurrency, import | `schedule`, `data-excuses` (session import); e2e 06 |

## Definition of Done (handbook §18)

| Item | Status |
| --- | --- |
| MUST stories meet acceptance criteria | Met by the tests above. **Product Owner review pending.** |
| Permissions enforced on the server, including import/export and destructive actions | Done — every new route uses `requireRole` and per-record checks (faculty own classes, students own records); denied destructive attempts are audited |
| Consistent calculations, covered by tests | Done — one metrics module (`server/services/metrics.js`) used by reports, analytics, overview and alerts |
| Soft deletion, restore and immutable audit verified | Done |
| CSV validation blocks invalid/unauthorised data; imports audited | Done |
| QR validated server-side; no duplicate check-ins | Done |
| Schedule conflicts rejected incl. multi-date and import | Done |
| UI follows tokens and accessibility requirements | Done — no hard-coded palette colours remain; axe clean |
| Code review, regression and security checks; limitations documented | Done — see below |
| Ready for a stakeholder demo with a script and evidence | Done — demo script below |

## Security checks performed

- Server-side authorisation tested for every new route (faculty/students outside their scope get 403/404).
- **Fixed:** MongoDB operator injection through query strings (`?department[$ne]=x`). The API now uses the flat query parser, so parameters are always strings; regression-tested.
- **Fixed:** `body-parser` DoS advisory (GHSA-27r3-jxmh-p828), upgraded to 1.20.9.
- Baseline security headers on every API response (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, no `X-Powered-By`).
- Login return path accepts in-app paths only (rejects `//host`, backslash and encoded-backslash forms).
- CSV exports defuse spreadsheet formulas; imports never echo passwords; audit entries hold metadata only.
- Excuse documents: type allow-list, magic-byte check, 5 MB limit, access-controlled download with `nosniff` and `no-store`.
- QR tokens: HMAC with a server-only per-session secret, constant-time comparison, 15-second rotation, student identity from the session only.

## Known limitations and follow-ups

| Limitation | Notes |
| --- | --- |
| Product Owner decisions | "Exceeds 3" = 4+ and excused-out-of-denominator are defaults pending sign-off ([decisions](sprint-02-decisions.md)) |
| `react-router` 6 advisories (moderate) | Open-redirect advisory mitigated in our only user-influenced navigation (login return path); the SSR advisory does not apply (no SSR). Upgrading to v7 is a follow-up |
| Login rate limiting | Not in scope for this sprint; recommended before production |
| "Real-time" updates | Polling: analytics every 30 s, insights and the notification bell every 60 s, QR check-in list every 3 s |
| QR is not proof of presence | A code shared within ~30 s still works; manual marking remains the fallback (as the handbook notes) |
| Phone-camera links | The QR encodes the app's own origin, so phones must be able to reach it (not `localhost`) |
| Notifications | In-app only, as specified; no email |
| Logo | Placeholder mark until approved artwork is supplied |
| Dark theme | Tokens are defined and contrast-checked, but there is no theme switch yet |

## Demo script (≈ 10 minutes, seeded data, password `Password@123`)

1. **Admin** (`admin@university.edu`) — *Analytics*: change the date range, hover the trend, open "Show data table". *Attendance Reports*: Students tab → filter "At risk only" → Export CSV.
2. *Manage Classes*: archive a class (type its code), show it under **Archived** with days left, restore it. *Activity Log*: both actions are listed; open *Submission timeliness* → **Missing** shows CS-305.
3. *Schedule*: pick a class, a weekly pattern for the next three weeks, Preview, remove one date, Save. Repeat with another class in the same room → conflicts are explained and Save is disabled.
4. *Import / Export*: download the Students template, import a file with one bad row → preview shows the error with its line number → confirm the valid rows.
5. **Faculty** (`faculty1@university.edu`) — bell shows unread alerts → open one → *Insights* highlights the student, with the reason and next step. *Excuse Review*: open a pending excuse, approve it with a note.
6. *Mark Attendance* (today) → **QR check-in**: the code rotates every 15 s and the live list fills as students check in.
7. **Student** (`student1@university.edu`) — *Check in*: scan the code (or open the link) → "You are checked in"; scan again → "Already checked in". *Absence Excuses*: submit one with a PDF; see the approved one with the teacher's note.
