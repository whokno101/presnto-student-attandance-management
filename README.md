# University Attendance Management System

Role-based attendance tracking for a university, built as a single repository with two workspaces.

**Stack:** React 18 (Vite) + Tailwind CSS + shadcn/ui · Node.js + Express · MongoDB + Mongoose · JWT auth

**Roles:** `admin` (full control) · `faculty` (assigned classes, mark attendance) · `student` (enroll, view own attendance)

---

## Repository structure

```
university-attendance-system/
├── client/                         # Vite + React SPA
│   ├── vite.config.js              # '@' -> src alias, /api proxy to :5001
│   └── src/
│       ├── App.jsx                 # routes + role guards
│       ├── components/
│       │   ├── ui/                 # shadcn/ui primitives (button, card, table, dialog,
│       │   │                       #   select, calendar, popover, badge, toast …)
│       │   ├── common/             # PageHeader, SearchInput, TablePagination, EmptyState,
│       │   │                       #   StatusBadge, ConfirmDialog, FormDialog, FormField, DatePicker
│       │   ├── admin/              # StudentForm, FacultyForm, ClassForm, AssignFacultyDialog
│       │   ├── classes/            # ClassCard (shared by My Classes / Enroll)
│       │   ├── layout/             # AppLayout, Sidebar, Topbar
│       │   └── auth/               # RequireAuth, RequireRole
│       ├── context/AuthContext.jsx
│       ├── hooks/                  # usePaginatedList, useFormState, use-toast
│       ├── lib/                    # api, constants, attendance, navigation, storage
│       ├── pages/
│       │   ├── admin/              # AdminDashboard, ManageStudents, ManageFaculty, ManageClasses
│       │   ├── faculty/            # MarkAttendance
│       │   ├── student/            # EnrollClasses, MyAttendance
│       │   ├── MyClasses.jsx
│       │   └── Login.jsx
│       └── services/               # thin axios wrappers per resource
├── server/                         # Express API
│   ├── server.js                   # app entry (health route, error handler)
│   ├── config/                     # env.js (parsing + defaults), db.js (Mongoose connection)
│   ├── middleware/                 # auth.js, validate.js (zod), error.js (single handler)
│   ├── models/                     # User, Faculty, Student, Class, Attendance
│   ├── routes/                     # auth, admin, students, faculty, classes, attendance
│   ├── services/                   # student, faculty, class, enrollment, attendance, access
│   ├── utils/                      # apiError, asyncHandler, query
│   ├── validation/schemas.js       # every request body schema
│   └── seed.js
├── docs/design.md                  # UI design doc: layout shell, components, pages
├── .env.example
└── README.md
```

---

## Getting started

### 1. Prerequisites

- Node.js >= 18
- MongoDB running locally **or** a MongoDB Atlas cluster

### 2. Install dependencies

From the repository root (npm workspaces installs both packages at once):

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Express listening port (not 5000: macOS AirPlay owns it) | `5001` |
| `MONGO_URI` | MongoDB connection string, or `memory` for a local dev database | `mongodb://127.0.0.1:27017/university-attendance` |
| `JWT_SECRET` | Secret used to sign JWTs | *(must be overridden in production)* |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `CLIENT_URL` | Origin allowed by CORS | `http://localhost:5173` |
| `VITE_API_URL` | Base API URL used by the client | `/api` (Vite proxies to `:5001`) |

> Set a long random value for `JWT_SECRET` before deploying.
> The server reads the **root** `.env` first, then `server/.env`; every value has a
> development default, so a local setup works without the file at all. The client
> does not need its own `.env` unless the API is not reachable through the proxy.

### 4. Seed the database

```bash
npm run seed
```

Creates: **1 admin, 2 faculty, 5 students, 2 classes** and ~15 weeks of attendance records per class.
All seeded accounts share the password `Password@123`.

| Role | Email |
| --- | --- |
| Admin | `admin@university.edu` |
| Faculty | `faculty1@university.edu`, `faculty2@university.edu` |
| Student | `student1@university.edu` … `student5@university.edu` |

Use `--no-reset` (`node seed.js --no-reset`) to add data without clearing existing collections.

### 5. Run

```bash
npm run dev:server   # http://localhost:5001  (health check: /health)
npm run dev:client   # http://localhost:5173
```

No MongoDB installed? Set `MONGO_URI=memory` in `.env`: the server (and the seed
script) start a local mongod via `mongodb-memory-server`, storing data in
`server/.data/memory-db` so it survives restarts. Run `npm run seed` once first.

Alternatively, run a portable binary against a project-local folder — no
installer or admin rights required:

```bash
mkdir -p .data/mongo
mongod --dbpath .data/mongo --port 27017 --bind_ip 127.0.0.1
```

`.data/` is git-ignored, so the database survives restarts without polluting the repo.

---

## Authentication & route protection

Login is the **only** public endpoint; everything else under `/api` requires
`Authorization: Bearer <token>`.

| Layer | File | Responsibility |
| --- | --- | --- |
| `requireAuth` | `server/middleware/auth.js` | Verifies the JWT, reloads the user from MongoDB (`isActive` re-checked every request), sets `req.user = { id, role, name }`. 401 with `TOKEN_INVALID` / `TOKEN_EXPIRED` / `ACCOUNT_INACTIVE`. |
| `requireRole(...roles)` | `server/middleware/auth.js` | Factory middleware; wrong role → 403 `FORBIDDEN`. |
| Ownership rules | `server/services/access.service.js` | Faculty may only touch classes where `class.faculty === their Faculty._id`; students may only read their own `Student._id` (an id from the request is rejected, never trusted). |
| Guards | `client/src/components/auth/` | `<RequireAuth>` (no token → `/login`), `<RequireRole roles={[...]}>` (wrong role → `/403`). |
| Axios interceptors | `client/src/lib/api.js` | Attaches the token; on 401 clears storage and redirects to `/login?reason=…`, on 403 redirects to `/403`. |

### Permission matrix

| Endpoint | Admin | Faculty | Student |
| --- | :-: | :-: | :-: |
| `GET` / `POST /api/students` | ✔ | ✖ | ✖ |
| `PUT` / `DELETE /api/students/:id` | ✔ | ✖ | ✖ |
| `GET /api/students/:id/attendance` | ✔ | ✔ (own classes) | ✔ (own record) |
| `GET` / `POST /api/faculty` | ✔ | ✖ | ✖ |
| `PUT` / `DELETE /api/faculty/:id` | ✔ | ✖ | ✖ |
| `GET` / `POST /api/classes` | ✔ | ✖ | ✖ |
| `PUT` / `DELETE /api/classes/:id` | ✔ | ✖ | ✖ |
| `PUT /api/classes/:id/assign-faculty` | ✔ | ✖ | ✖ |
| `POST /api/classes/:id/enroll` | ✔ | ✖ | ✔ (self only) |
| `POST /api/classes/:id/unenroll` | ✔ | ✖ | ✔ (self only) |
| `GET /api/classes/mine` | ✔ | ✔ | ✔ |
| `GET /api/classes/available` | ✔ | ✖ | ✔ |
| `GET /api/classes/:id/students` | ✔ | ✔ (own classes) | ✖ |
| `GET /api/admin/stats` | ✔ | ✖ | ✖ |
| `POST /api/attendance/mark` | ✔ | ✔ (own classes) | ✖ |
| `GET /api/attendance/class/:id` | ✔ | ✔ (own classes) | ✖ |
| `GET /api/attendance/my` | ✖ | ✖ | ✔ |

Every endpoint is implemented — there are no `501 NOT_IMPLEMENTED` stubs left.
`GET /api/permissions` returns this matrix as JSON for audits.

### Error contract

Every failure — validation, auth, duplicates, 404 — uses the same envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Enter a valid email address",
    "details": [{ "field": "email", "message": "Enter a valid email address" }]
  }
}
```

`details` is present on `VALIDATION_ERROR` and `DUPLICATE_KEY` so forms can map
server errors onto fields. `code` values: `TOKEN_INVALID`, `TOKEN_EXPIRED`,
`ACCOUNT_INACTIVE`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION_ERROR`, `DUPLICATE_KEY`, `CONFLICT`, `INTERNAL_ERROR`.
`CONFLICT` (409) covers state clashes that are not duplicates: "already
enrolled", "class is full", "not enrolled".

`server/middleware/error.js` is the single place that renders this envelope: it
normalises Mongoose validation/cast errors and E11000 duplicates, hides stack
traces except for genuine 500s in development, and is mounted after every route.

### Admin CRUD endpoints (Session 3)

| Endpoint | Query / body | Notes |
| --- | --- | --- |
| `GET /api/students` | `?search=&page=&limit=` | Search matches name, studentId or department. Returns `{ data, pagination }`. |
| `POST /api/students` | `name, email, studentId, department, password` | Creates the `User` (bcrypt, role `student`) **and** the `Student` profile; rolls the user back if the profile insert fails. |
| `PUT /api/students/:id` | any of the above + `isActive` | `password` optional — omit to keep the current one. |
| `DELETE /api/students/:id` | — | Soft delete: `isActive = false`, data preserved. |
| `GET/POST /api/faculty`, `PUT/DELETE /api/faculty/:id` | `employeeId` instead of `studentId` | Same pattern; `classesAssigned` is returned as a count. |
| `GET /api/classes` | `?search=&page=&limit=` | Search matches name, code or department; joins faculty name and roster size. |
| `POST /api/classes` | `name, code, department, semester, day, startTime, endTime` | `endTime > startTime` enforced on create **and** on partial updates. |
| `PUT /api/classes/:id` | partial body | Merged schedule is re-validated before saving. |
| `DELETE /api/classes/:id` | — | Hard delete; the model hook detaches faculty/students and deletes its attendance. |
| `GET /api/admin/stats` | — | `{ students, faculty, classes, todayAttendance }` — the last is `{ marked, attended, rate }` for today, or `null` when nothing is marked yet (the tile renders an em dash). |

All list endpoints are paginated (`page` ≥ 1, `limit` 1-100, default 10) and use
case-insensitive, regex-escaped search.

### Assignment & enrollment endpoints (Session 4)

| Endpoint | Body | Notes |
| --- | --- | --- |
| `PUT /api/classes/:id/assign-faculty` | `{ facultyId }` or `{ facultyId: null }` | Faculty must exist **and be active**. Idempotent. Writes `Class.faculty` first, then mirrors into both `Faculty.classesAssigned` arrays; the class is rolled back if mirroring fails. |
| `POST /api/classes/:id/enroll` | `{}` (student) / `{ studentId }` (admin) | Seat limit enforced by a single conditional `updateOne` (`$expr: {$lt: [size(students), capacity]}`), which also blocks double enrollment under concurrency. `Student.enrolledClasses` is written next and compensated on failure. |
| `POST /api/classes/:id/unenroll` | same | Mirrors the removal on both sides; attendance history is intentionally kept as an audit trail. |
| `GET /api/classes/mine` | — | `{ role, data }` — faculty: classes where `faculty = me`; student: classes where `students ∋ me` (each annotated with `isEnrolled`); admin: everything. |
| `GET /api/classes/available` | `?search=` | Catalog annotated with `isEnrolled`, `isFull`, `seatsLeft` so one page can render Enroll *and* Unenroll. |
| `GET /api/classes/:id/students` | — | Roster (`id, name, email, studentId, department, isActive`), admin or the assigned faculty only. |

A student can never enroll somebody else: the route resolves the target from
`req.user` and rejects a foreign `studentId` with 403 before touching the DB.

### Attendance endpoints (Session 5)

| Endpoint | Body / query | Notes |
| --- | --- | --- |
| `POST /api/attendance/mark` | `{ classId, date: 'YYYY-MM-DD', records: [{ studentId, status }] }` | `status` is `present` / `late` / `absent`. Ownership is checked **before** any write. Every row is upserted on `(class, student, date)`, so re-saving a day edits instead of duplicating, and `markedBy` is stamped on each record. Future dates, unknown statuses, duplicate students and students outside the roster are all rejected with 400. |
| `GET /api/attendance/class/:id?date=` | `date` defaults to today | The marking sheet: roster + existing status (`null` when unmarked) + a `marked` count. |
| `GET /api/attendance/my` | — | `{ student, summary, classes[] }`, grouped by class and newest-first. Students only. |
| `GET /api/students/:id/attendance` | — | Same shape. Admin: any student. Faculty: only students enrolled in their classes, and the report is filtered to the classes they own. Student: own record only. |

**Percentage rule:** `present` and `late` both count as attended, so
`percentage = (present + late) / marked`, rounded to one decimal. The UI colours
it **≥ 90% green**, **75–89% amber**, **< 75% red**.

### Client routes

| Route | Roles | Purpose |
| --- | --- | --- |
| `/login` | public | Sign in (redirects: admin → `/admin`, faculty → `/classes`, student → `/enroll`) |
| `/admin`, `/admin/students`, `/admin/faculty`, `/admin/classes` | admin | Dashboard, CRUD and faculty assignment |
| `/classes` | faculty, student | My Classes — assigned vs. enrolled, with schedule and seat gauge |
| `/enroll` | student | Class catalog with Enroll / Unenroll |
| `/attendance/mark` | admin, faculty | Pick a class + date, toggle each student present / late / absent, save (idempotent per day) |
| `/my-attendance` | student | Per-class history with a colour-coded attendance percentage |
| `/403` | any | Unauthorized page |
| `*` | any | Not found |

---

## Data model

```
User 1—1 Faculty ─┐                ┌─< Attendance >─┐
User 1—1 Student ─┴─< Class >──────┘                │
     (faculty teaches, students enroll)   markedBy ─┘ User
```

- `Attendance` has a **unique compound index** on `{ class, student, date }`, so re-marking a day updates rather than duplicates.
- `Attendance.date` is normalized to **UTC midnight** before saving, keeping that index reliable.
- A `Class` pre-save hook mirrors itself into the owner's `Faculty.classesAssigned`; deleting a class cleans up faculty, student enrollment and its attendance records.
- `Class.faculty` is **optional** so a class can exist before it is staffed (the admin table renders an `Unassigned` badge), and `Class.capacity` (default 40) backs the `Enrolled` column.

---

## Roadmap

| Session | Scope | Status |
| --- | --- | --- |
| 1 | Repo, design doc, schemas, seed | ✅ Complete |
| 2 | JWT auth, middleware, route protection, layout shell | ✅ Complete |
| 3 | Admin CRUD (students, faculty, classes) + admin pages | ✅ Complete |
| 4 | Assign faculty, enrollment, My Classes / Enroll pages | ✅ Complete |
| 5 | Attendance marking + reports, student attendance, polish | ✅ Complete |

See [`docs/design.md`](docs/design.md) for the UI specification.

---

## Manual QA checklist

Sign in with `Password@123` for every account below.

### Admin — `admin@university.edu`

- [ ] Dashboard tiles match the tables; **Today's Attendance Rate** shows `—` / "Not marked yet today" until attendance is saved, then a percentage and "N records marked".
- [ ] Manage Students / Faculty / Classes: search, pagination, create, edit, deactivate, delete (confirm dialog).
- [ ] Classes → `UserPlus` → Assign Faculty: active staff only, Save disabled until changed, table updates.
- [ ] Mark Attendance (`/attendance/mark`): class dropdown lists every class, saving works for any of them.

### Faculty — `faculty1@university.edu`

- [ ] My Classes lists only assigned classes (schedule, roster size, seat gauge).
- [ ] Mark Attendance: class pre-selected, date defaults to today, future dates greyed out in the calendar.
- [ ] Toggle a row to **Absent** / **Late**; "Mark all present" resets; Save shows a toast with the present/late/absent split.
- [ ] Reload the page: the saved statuses are still selected, and the header shows "N already marked".
- [ ] Re-save the same day with different statuses: no duplicates appear (one record per student per day).

### Student — `student1@university.edu`

- [ ] Enroll in Classes: card grid, Enroll / Unenroll, "full" classes disabled.
- [ ] My Classes lists the enrolled classes.
- [ ] My Attendance: overall percentage + present/late/absent counts, one card per class with a date/status table.
- [ ] Percentage colour follows the rule: ≥ 90% green, 75–89% amber, < 75% red (check both the badge and the progress bar).
- [ ] A class with no marks yet does not appear; with no marks at all the page shows an empty state.

### Cross-role

- [ ] `faculty2` cannot open `faculty1`'s class in Mark Attendance (dropdown only lists their own).
- [ ] Student hitting `/admin` or `/attendance/mark` is redirected to `/403`.
- [ ] Expired/invalid token → redirected to `/login`; wrong password shows an inline error.
- [ ] `GET /api/attendance/my` with an admin token returns 403.
