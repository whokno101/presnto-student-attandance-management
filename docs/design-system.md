# UniTrack design system (PB-18, PB-21)

The rules every screen follows so admin, faculty and student workflows look and
behave the same way, and meet WCAG 2.1 AA. Components live in
`client/src/components/ui` (shadcn/ui primitives) and
`client/src/components/common` (app patterns built on them).

## Tokens

All colours are CSS custom properties in [`client/src/index.css`](../client/src/index.css),
exposed to Tailwind by semantic name in `tailwind.config.js`. **Use the token,
never a palette shade** (`bg-success`, not `bg-emerald-600`).

| Token | Use | Tailwind |
| --- | --- | --- |
| `background` / `foreground` | Page surface and body text | `bg-background`, `text-foreground` |
| `card`, `popover` (+ `-foreground`) | Raised surfaces | `bg-card` |
| `muted` / `muted-foreground` | Subtle surfaces, secondary text, hints | `bg-muted`, `text-muted-foreground` |
| `primary` (+ `-foreground`) | Brand, primary buttons, links, active nav | `bg-primary`, `text-primary` |
| `secondary`, `accent` (+ `-foreground`) | Secondary buttons, hover states | `bg-secondary`, `hover:bg-accent` |
| `success` (+ `-foreground`) | Present, on track (≥ 90%), success toasts | `bg-success`, `text-success` |
| `warning` (+ `-foreground`) | Late, watch (75–89%), full classes | `bg-warning`, `text-warning` |
| `destructive` (+ `-foreground`) | Absent, at risk (< 75%), errors, destructive actions | `bg-destructive`, `text-destructive` |
| `info` (+ `-foreground`) | Excused | `bg-info` |
| `border`, `input`, `ring` | Dividers, form control borders, focus ring | `border-input`, `ring-ring` |
| `chart-1` … `chart-5` | Decorative accents (stat cards, chart series) | `border-t-chart-1`, `text-chart-2` |

Every status token works both as a solid fill with its `-foreground` text and
as text on the page background.

**Contrast is checked automatically.** `npm run check:contrast --workspace=client`
measures every text pairing (≥ 4.5:1) and the focus ring and input borders
(≥ 3:1) in both the light and dark themes, and fails if any pair drops below
AA. Run it after touching a token.

### Typography

System font stack (`font-sans`: `ui-sans-serif`, `system-ui`, Segoe UI, Roboto …),
so there is no font download.

| Role | Classes |
| --- | --- |
| Page title (`PageHeader`, h2) | `text-xl sm:text-2xl font-semibold tracking-tight` |
| Card title | `text-base font-semibold` |
| Body / table text | `text-sm` |
| Hints, captions | `text-xs text-muted-foreground` |
| Metrics | `text-3xl font-semibold tabular-nums` |

### Spacing, radii, shadows

Tailwind's 4px scale. Pages stack sections with `space-y-5`, cards pad
`p-4 sm:p-6`, grids use `gap-4`. Radius comes from `--radius` (`rounded-lg`,
`rounded-md`, `rounded-sm`). Shadows are limited to `shadow-sm` (controls),
`shadow` (badges) and `hover:shadow-md` (interactive cards).

## Component patterns

| Need | Use |
| --- | --- |
| Page heading + primary action | `PageHeader` |
| Metric tile | `StatCard` (`tone` 1–5 picks a chart accent) |
| Data table | `Table` inside a `Card`; it scrolls horizontally on small screens |
| Pagination | `TablePagination` + `usePaginatedList` |
| Search | `SearchInput` (300 ms debounce, Enter submits) |
| Create/edit form | `FormDialog` + `FormField` + `useFormState` |
| Destructive confirmation | `ConfirmDialog` naming the item and the effect |
| Nothing to show / load failure | `EmptyState` (with a retry action on errors) |
| Loading | Skeleton blocks (`animate-pulse bg-muted`) in place of content; `FullPageLoader` for the app shell |
| Feedback after an action | `toast({ title, description, variant })` with `success` / `destructive` / `default` |
| Attendance rate | `RateCell` ("No data" when nothing is marked) |
| Brand | `Logo` |

## Accessibility rules

- **Colour is never the only signal.** Statuses always carry a text label
  (Present, Late, Absent, Excused, On track / Watch / At risk), and rates show
  the number.
- **Visible focus everywhere.** Components use `focus-visible:ring-2 ring-ring`;
  anything without its own ring falls back to a global `:focus-visible` outline.
- **Keyboard.** A "Skip to main content" link is the first tab stop. Dialogs
  and the mobile navigation drawer (Radix) trap focus, close on Escape and
  return focus to the control that opened them.
- **Forms.** Every control has a `<Label>`. `FormField` links its error (or
  hint) to the control with `aria-describedby` and sets `aria-invalid`; required
  fields are announced as "(required)". Error messages say how to fix the
  problem ("Use 24-hour HH:mm format").
- **Tables.** Header cells are `scope="col"`; wide tables scroll inside their
  card instead of the page.
- **Motion.** `prefers-reduced-motion` disables animations and transitions.
- **Responsive.** Layouts are mobile-first; the sidebar becomes a drawer under
  `lg` (1024px) and grids collapse to one column.

## Wording

| Context | Use |
| --- | --- |
| Attendance statuses | Present · Late · Absent · Excused |
| Rate bands | On track (≥ 90%) · Watch (75–89%) · At risk (< 75%) · No data |
| Removing a student/faculty account | **Deactivate** (reversible; history kept) |
| Removing a class | **Archive** (reversible within the retention window; history kept) |
| Toast titles | Past tense for success ("Class created"), "Could not …" for failures |

## Brand

`Logo` renders the SVG mark (`client/src/assets/logo-mark.svg`, white variant
`logo-mark-inverse.svg`) beside the product name. When the name is visible the
mark is decorative (`alt=""`); used alone it is labelled "UniTrack". If the
image fails to load, a text badge with the initial is shown instead.

The favicon is `client/public/favicon.svg`. The current mark is a placeholder
until the institution supplies approved artwork: replace those three SVG files
and every location updates.
