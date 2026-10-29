# UI Design Doc — University Attendance Management System

**Stack:** React 18 (Vite) · Tailwind CSS · shadcn/ui · Express + MongoDB · JWT auth
**Roles:** `admin` (full control) · `faculty` (assigned classes + mark attendance) · `student` (enroll + view own attendance)

---

## 1. Design principles

| Principle | Application |
| --- | --- |
| Role-first navigation | Every user lands on a dashboard relevant to their role; the sidebar never shows links they cannot use. |
| Data-dense but calm | Tables carry the bulk of the work, wrapped in `Card`s with generous padding; colour is reserved for status. |
| Predictable feedback | Every mutation shows a `Toast`; every destructive action asks in a `Dialog`. |
| Mobile tolerant | Sidebar collapses to an icon rail under `lg`; tables scroll horizontally inside `Card`s. |
| Accessibility | All interactive controls are shadcn/ui (Radix) primitives with keyboard + focus-ring support. |

---

## 2. Layout shell

```
┌──────────────┬─────────────────────────────────────────────────────┐
│  SIDEBAR     │  NAVBAR   [ page title · search · avatar ▾ logout ] │
│  (role-aware)├─────────────────────────────────────────────────────┤
│              │                                                     │
│  Menu        │              CONTENT AREA                           │
│  items       │        (Card grid / Table / Dialog triggers)        │
│              │                                                     │
│  ─────────   │                                                     │
│  User chip   │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

**Components (`client/src/components/layout/`)**

- `AppLayout.jsx` — `flex` shell; renders `Sidebar`, `Navbar` and `<Outlet />`.
- `Sidebar.jsx` — fixed-width (`w-64`, `lg:w-56`, collapsed rail `w-16`), active item highlighted with `bg-accent`, Lucide icons per item, role menu resolved from a `navConfig.js` map.
- `Navbar.jsx` — page title (derived from route), `Calendar`-less date chip, user avatar initials, `Badge` with the role, and a **Logout** button that clears the JWT.
- `ProtectedRoute.jsx` — redirects unauthenticated users to `/login`; renders `Unauthorized` when the route requires a role the user lacks.

**Role-aware menu**

| Route | Label | admin | faculty | student |
| --- | --- | :-: | :-: | :-: |
| `/dashboard` | Dashboard | ✓ | ✓ | ✓ |
| `/admin/students` | Manage Students | ✓ | — | — |
| `/admin/faculty` | Manage Faculty | ✓ | — | — |
| `/admin/classes` | Manage Classes | ✓ | — | — |
| `/faculty/classes` | My Classes | — | ✓ | — |
| `/faculty/attendance` | Mark Attendance | — | ✓ | — |
| `/student/enroll` | Enroll in Classes | — | — | ✓ |
| `/student/attendance` | My Attendance | — | — | ✓ |

---

## 3. shadcn/ui component usage

| Component | Where it is used |
| --- | --- |
| **Card** | Dashboard stat tiles (`CardHeader` + `CardTitle` + big number), every page's table wrapper, empty states. |
| **Table** | Student list, faculty list, class list, attendance roster (`MarkAttendance`), attendance history (`MyAttendance`). Columns: name/id, department, badges, row actions. |
| **Dialog** | Create/edit Student, Faculty, Class forms; confirm delete; quick "add student to class". Uses `DialogHeader` + `DialogFooter` with Cancel/Submit `Button`s. |
| **Select** | Role picker (admin form), department picker, `status` picker per row in `MarkAttendance` (Present / Absent / Late), semester and schedule-day pickers on the Class form. |
| **Calendar** | Date selection in `MarkAttendance` (inside a `Popover` trigger labelled with the chosen date) and a from/to range in `MyAttendance` filters. |
| **Badge** | Attendance status chips — `success` = Present, `destructive` = Absent, `warning` = Late; role tags (`ADMIN`/`FACULTY`/`STUDENT`); active/inactive account state. |
| **Toast** | All CRUD + login results. `toast({ title, description, variant })` via `useToast()`; `<Toaster />` mounted once in `App.jsx`. |

Supporting primitives already generated in `client/src/components/ui/`: `button`, `input`, `label`, `popover`, plus the above.

---

## 4. Page list

| Page | Route | Role | Content summary |
| --- | --- | --- | --- |
| **Login** | `/login` | public | Centered `Card`: email + password `Input`s, submit `Button`, demo-credential hint. Redirects by role on success. |
| **AdminDashboard** | `/dashboard` | admin | 4 stat tiles (students, faculty, classes, attendance % today) in a responsive `Card` grid + recent-activity `Table`. |
| **ManageStudents** | `/admin/students` | admin | Searchable `Table` of students; Create/Edit via `Dialog` form (name, email, studentId, department) and Delete with confirm `Dialog`. Toggle `isActive` with a `Badge`. |
| **ManageFaculty** | `/admin/faculty` | admin | Same pattern with employeeId + department; a nested `Select` assigns/unassigns `classesAssigned`. |
| **ManageClasses** | `/admin/classes` | admin | Class `Table` with code, department, semester, schedule, faculty, student count. Dialog form uses `Select` for faculty/day and `Input`s for code/times; roster editing via `Dialog`. |
| **MyClasses** | `/faculty/classes` | faculty | `Card` grid of the logged-in faculty's classes; each card shows schedule, roster size and a "Mark Attendance" button. |
| **MarkAttendance** | `/faculty/attendance` | faculty | Select class → pick date with `Calendar` → roster `Table` where every row has a `Select` for status → Save emits a `Toast`. Bulk "Mark all present" action. |
| **EnrollClasses** | `/student/enroll` | student | Available classes for the student's department as `Card`s with an Enroll / Drop `Button`; enrolled ones show a `Badge`. |
| **MyAttendance** | `/student/attendance` | student | Per-class attendance percentage summary cards + a filterable history `Table` with status `Badge`s. |
| **Unauthorized** | `/403` | any | Illustration + message + "Back to dashboard" button. Rendered by `ProtectedRoute` on role mismatch. |
| **NotFound** | `*` | any | Catch-all with a link back to the dashboard. |

---

## 5. Visual language

- **Primary:** blue `221.2 83.2% 53.3%` (shadcn default slate/blue tokens in `client/src/index.css`).
- **Status colours:** Present = emerald, Late = amber, Absent = red — surfaced through custom `Badge` variants (`success`, `warning`, `destructive`).
- **Spacing:** `p-6` cards, `space-y-4` stacks, `gap-4` grids.
- **Typography:** Tailwind defaults; `CardTitle` semibold, `text-muted-foreground` for secondary copy, tabular numbers for percentages.
- **Dark mode:** the `.dark` token set, switched by `ThemeProvider` (`context/ThemeContext.jsx`) and the light/dark toggle in the top bar and on the login page. The choice is saved under `uams.theme` (it survives logout); with no saved choice the OS setting is followed; an inline script in `index.html` applies it before first paint.

---

## 6. Data flow

```
Page component  →  services/api.js (fetch wrapper, attaches JWT)  →  Express route
              ←  JSON shaped by the Mongoose models              ←  controller

Auth state lives in AuthContext (Session 2): { user, role, token, login(), logout() }
Server mutations always answer with a Toast on the client.
```
