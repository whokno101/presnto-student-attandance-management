# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One real university deploys Presnto. Three roles, each landing on its own home:

- **Faculty** take attendance during class, often from a laptop or phone at the lectern, under time pressure, with a room full of students waiting. They also review excuses, read class insights, and see students at risk.
- **Students** check in on their phones by scanning a rotating QR code, enroll in classes, track their own attendance rate per class, and submit excuses with evidence.
- **Admins** run the institution's records: students, faculty, classes, scheduling (multi-date, room/instructor conflict checks), analytics, reports, CSV import/export, and the audit log.

## Product Purpose

Presnto replaces paper and spreadsheet roll-calls with a single record of who attended which session. Success means faculty finish taking attendance in seconds, students always know where they stand before it becomes a problem, and admins can trust and audit every number.

## Positioning

Attendance is treated as an auditable record, not a checkbox: rotating 15-second QR codes with manual fallback, an append-only activity log, excuses that recalculate counts only once approved, archive-never-delete with 90-day restore, and explicit risk rules that flag students before they fail a class.

## Operating Context

- Classroom: faculty open a session, project or show the QR, and watch check-ins arrive; manual marking (Present / Late / Absent) for anyone who can't scan.
- Student phone: camera scan, or a code entered in the app; idempotent check-in.
- Office: admins work at desktop widths with dense tables, filters, CSV templates and previews.
- Policy values live in `server/config/policy.js` and `docs/sprint-02-decisions.md` (pending Product Owner sign-off).

## Capabilities and Constraints

- Statuses: Present, Late, Absent, Excused (Excused only via an approved excuse or an authorised edit). Excuses: Pending, Approved, Rejected.
- Rate = (present + late) / (marked − excused). Bands: ≥ 90% on track · 75–89% watch · < 75% at risk · no data.
- Session warning below 60%; a student is at risk below 75% or at 4+ unexcused absences. These rules are never combined.
- Stack is fixed: React 18 + Vite, Tailwind CSS, shadcn/ui on Radix primitives, Recharts, lucide-react. The redesign restyles this stack; no component-library swap.
- Light and dark themes are required (existing `ThemeContext`, key `uams.theme`, applied before first paint).
- **Arabic / RTL is required but not built yet:** no i18n layer or `dir="rtl"` support exists today. Layouts must use logical properties and mirror cleanly; the Arabic copy itself does not exist yet.
- Removal vocabulary: students/faculty are **Deactivated**, classes are **Archived**, never deleted.

## Brand Commitments

- Product name: **Presnto** (replaces the earlier working name "UniTrack" in code).
- The current logo mark (`client/src/assets/logo-mark*.svg`, `client/public/favicon.svg`) is a placeholder and may be replaced.
- Copy conventions: success toasts in the past tense ("Class created"), failures as "Could not …".

## Evidence on Hand

- Seeded demo data from `server/seed.js`; no real institution data, testimonials, or metrics. Do not invent the university's name or claims.
- `manual.pdf` at the repo root (user manual).

## Product Principles

1. Speed in the room: the classroom flows (QR, marking) must work one-handed in seconds.
2. Numbers you can audit: every rate and count traces back to sessions, rules, and log entries.
3. Warn early and calmly: risk is surfaced before it is a failure, without alarming tone.
4. Each role sees only its own work, on a home built for it.
5. Reversible by default: deactivate and archive, never destroy.

## Accessibility & Inclusion

- WCAG 2.1 AA: semantic tokens are checked by `npm run check:contrast`; keep accessible dialogs, forms, and keyboard navigation from the Radix primitives.
- Status is never conveyed by colour alone (labels always accompany status colour).
- Bidirectional support (Arabic RTL) as above.
