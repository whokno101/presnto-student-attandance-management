# Sprint 02 — Definitions and Product Owner decisions

The Sprint 02 Execution Handbook (PB-12 – PB-23) asks the team to confirm a few
definitions before building analytics, alerts and imports (handbook §2, §16 and
execution step 1). This file records the values the implementation uses. Every
one of them lives in [`server/config/policy.js`](../server/config/policy.js), so
a changed decision is a one-line change that applies to every report and alert.

> **Status:** defaults chosen by the development team, following the handbook's
> stated default interpretations. Pending Product Owner sign-off: edit this
> file and `policy.js` together if a decision changes.

## Attendance vocabulary

| Stored value | Label | Counts as attended | Notes |
| --- | --- | --- | --- |
| `present` | Present | yes | |
| `late` | Late | yes | |
| `absent` | Absent | no | Counts toward the unexcused-absence total |
| `excused` | Excused | — | Set only by an approved excuse (PB-19) or an authorised edit |

A submitted excuse stays **Pending** and leaves the record `absent` until a
faculty member approves it. Pending and approved excuses are never mixed.

## Attendance percentage (handbook §2, §16)

```
rate = (present + late) / (marked sessions − excused sessions)
```

Approved excused sessions are **excluded from the denominator**: an approved
excuse neither raises nor lowers the percentage.
(`EXCLUDE_EXCUSED_FROM_DENOMINATOR = true`)

## Thresholds

| Rule | Value | Used by |
| --- | --- | --- |
| Session warning | rate below **60%** | PB-15 class/session report |
| Student at risk — rate | below **75%** in a class | PB-16 alerts, analytics |
| Student at risk — absences | **4 or more** unexcused absences in a class ("exceeds 3") | PB-16 alerts |
| Overview colour bands | ≥ 90% on track · 75–89% watch · < 75% at risk | Admin overview, student view |

The 60% session warning and the 75% student-risk threshold are separate rules
and are never combined.

## Time and retention

| Setting | Value |
| --- | --- |
| Institution time zone | `INSTITUTION_TIME_ZONE` (default: the server's zone). Defines "today", future-date checks and submission deadlines |
| Submission deadline | Attendance is due when the session ends (`SUBMISSION_DEADLINE_HOURS = 0`) |
| Overdue submission | Still missing **24 hours** after the deadline (PB-13) |
| Soft-delete retention | **90 days** restorable (`RETENTION_DAYS`) (PB-14) |
| QR token rotation | every **15 seconds** (PB-20) |

## Scheduling (PB-22, PB-23)

| Rule | Value |
| --- | --- |
| Multi-date requests | All-or-nothing: if any date conflicts, nothing is saved and every rejected date is reported with its reason |
| Overlap | Same room, or same instructor, with intersecting times on the same day (back-to-back slots are allowed) |
| Past dates | Cannot be scheduled |
| Archiving a class | Cancels its future sessions (kept as history), freeing the room and teacher |
| Restoring a class | Does **not** revive those cancelled sessions, so a restore can never create a conflict; reschedule from the Schedule page |
| Assigning a teacher | Rejected if the class's future sessions overlap that teacher's other sessions |
| CSV session imports | Same rules; conflicting rows (including rows conflicting with each other) are rejected and reported, the rest are booked |

## Permissions that need an explicit switch

| Capability | Default |
| --- | --- |
| Faculty import attendance CSV for their own classes (PB-17) | enabled (`FACULTY_IMPORT_ENABLED=false` turns it off) |
| Faculty import student / class / faculty directories | never |

## Branding (PB-21)

No approved institutional logo was supplied. The app ships a placeholder mark
(`client/src/assets/logo-mark.svg`, `client/public/favicon.svg`); replacing
those two files with the approved artwork updates every location. See
[design-system.md](design-system.md#brand).
