---
name: Presnto
description: Attendance for a university, set as a departures board.
colors:
  background: "hsl(0 0% 100%)"
  foreground: "hsl(216 19% 5%)"
  card: "hsl(0 0% 100%)"
  muted: "hsl(60 5% 95%)"
  muted-foreground: "hsl(60 3% 34%)"
  primary: "hsl(216 19% 5%)"
  primary-foreground: "hsl(0 0% 100%)"
  primary-hover: "hsl(213 16% 18%)"
  secondary: "hsl(60 5% 93%)"
  signal: "hsl(50 100% 50%)"
  signal-foreground: "hsl(216 19% 5%)"
  shell: "hsl(0 0% 100%)"
  shell-foreground: "hsl(216 19% 5%)"
  shell-muted: "hsl(60 3% 34%)"
  shell-border: "hsl(60 5% 87%)"
  shell-accent: "hsl(60 5% 94%)"
  shell-ok: "hsl(145 61% 28%)"
  shell-alert: "hsl(0 66% 45%)"
  scrim: "hsl(216 19% 5%)"
  success: "hsl(145 61% 28%)"
  warning: "hsl(26 90% 34%)"
  destructive: "hsl(0 66% 45%)"
  destructive-hover: "hsl(0 68% 37%)"
  info: "hsl(214 45% 38%)"
  border: "hsl(60 5% 87%)"
  input: "hsl(60 3% 50%)"
  ring: "hsl(216 19% 5%)"
  chart-1: "hsl(213 20% 22%)"
  chart-2: "hsl(42 100% 40%)"
  chart-3: "hsl(145 61% 32%)"
  chart-4: "hsl(214 45% 45%)"
  chart-5: "hsl(0 66% 48%)"
  background-dark: "hsl(216 19% 5%)"
  card-dark: "hsl(213 16% 13%)"
  muted-dark: "hsl(213 15% 17%)"
  secondary-dark: "hsl(213 15% 19%)"
  primary-dark: "hsl(60 9% 95%)"
  primary-foreground-dark: "hsl(216 19% 5%)"
  primary-hover-dark: "hsl(60 5% 80%)"
  shell-dark: "hsl(216 19% 5%)"
  shell-foreground-dark: "hsl(60 9% 95%)"
  shell-muted-dark: "hsl(210 6% 66%)"
  shell-border-dark: "hsl(213 13% 19%)"
  shell-accent-dark: "hsl(213 16% 11%)"
  shell-ok-dark: "hsl(145 55% 55%)"
  shell-alert-dark: "hsl(4 90% 72%)"
  topbar: "hsl(0 0% 100%)"
  topbar-dark: "hsl(216 19% 5%)"
  success-dark: "hsl(145 55% 52%)"
  warning-dark: "hsl(30 95% 60%)"
  destructive-dark: "hsl(0 80% 67%)"
  info-dark: "hsl(214 75% 72%)"
  border-dark: "hsl(213 13% 23%)"
  input-dark: "hsl(212 8% 46%)"
typography:
  display:
    fontFamily: "Barlow Condensed, Noto Kufi Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  stat:
    fontFamily: "Barlow Condensed, Noto Kufi Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1"
  title:
    fontFamily: "Barlow Condensed, Noto Kufi Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.04em"
  control:
    fontFamily: "Barlow Condensed, Noto Kufi Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  label:
    fontFamily: "Barlow Condensed, Noto Kufi Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
  body:
    fontFamily: "Barlow, Noto Kufi Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.95rem"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
  figure:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "\"tnum\" 1"
rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
  pass: "12px"
  full: "9999px"
spacing:
  cell-y: "10px"
  cell-x: "12px"
  row-y: "14px"
  card: "20px"
  pass: "24px"
  page-sm: "16px"
  page-md: "24px"
  page-lg: "32px"
  sidebar: "256px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.primary-foreground-dark}"
  button-outline:
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    height: "40px"
  signal-chip:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-foreground}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  status-badge-present:
    backgroundColor: "{colors.success}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "{spacing.card}"
  nav-item:
    textColor: "{colors.shell-muted}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item-hover:
    backgroundColor: "{colors.shell-accent}"
    textColor: "{colors.shell-foreground}"
  nav-item-active:
    backgroundColor: "{colors.shell-foreground}"
    textColor: "{colors.shell}"
  pass:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pass}"
    padding: "{spacing.pass}"
  sidebar:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.shell-foreground}"
    width: "{spacing.sidebar}"
---

# Design System: Presnto

## Overview

**Creative North Star: "The Departures Board"**

Attendance runs on a timetable, so Presnto is set like a station: one ground per theme (a single white sheet by day, an ink board with slate cards by night), ink actions, and one signal colour that lights only when something is live or has just changed. Sessions are ranked by start time in hairline-ruled rows with a Time, Course, Hall and Status column; figures sit in strips like the GATE / BOARDING / SEAT row of a boarding pass; a student's check-in and the sign-in form are segmented passes torn along dashed perforations.

Density is operational, not decorative. Labels are condensed capitals with wide tracking, every time, code, room and rate is set in tabular monospace, and status is always spelled out as a word. Colour reinforces a status; it never carries it alone. Surfaces are flat and ruled; depth is reserved for things that physically lift off the board (the pass, dialogs, toasts).

The system is built for Arabic from the start: Noto Kufi Arabic follows each Latin face in the stacks, and layout uses logical start/end properties so the whole board mirrors under `dir="rtl"`.

**Key Characteristics:**
- The shell (sidebar, login ground) follows the theme and shares the page ground; only the scrim (dialog backdrop, lift shadows, camera viewport) stays ink in both themes.
- Signal yellow for live or changed state only, held until the data moves on.
- Ruled rows and summary strips instead of card grids.
- Barlow Condensed capitals for labels and controls, Barlow for prose, JetBrains Mono for every number.
- Status as a word, colour as reinforcement.
- Square-ish 4px corners; the pass alone is rounder (12px) with punched notches.
- Logical properties throughout for RTL.

## Colors

A near-black ink and warm-neutral grey system with a single saturated signal yellow and four muted status hues.

### Primary
- **Timetable Ink** (`primary`, ≈ #0A0C0F): the action colour on light. Primary buttons, the focus ring, the user initials block, text selection. In dark theme the primary inverts to **Panel White** (`primary-dark`, ≈ #F3F3F1) with ink text, so the strongest action is always the brightest object on the plane.

### Secondary
- **Signal Yellow** (`signal`, #FFD400): the only yellow in the app, always with ink text (`signal-foreground`). Used for the board's live row chip ("In session", "Check-in · 104/140"), a changed hall chip, the check-in pass's IN SESSION chip, the camera scan line, and the `signal-in` flash when a row or a check-in result lands. Identical in both themes.

### Tertiary
- **Status hues**, light / dark: **Present Green** (`success` / `success-dark`), **Late Amber** (`warning` / `warning-dark`), **Absent Red** (`destructive` / `destructive-dark`), **Excused Blue** (`info` / `info-dark`). Attendance statuses and rate bands map onto these: Present, On track (≥ 90%) green; Late, Watch (75-89%) amber; Absent, At risk (< 75%) red; Excused blue. On the shell the board uses **Shell Ok** and **Shell Alert** (the status hues on light, brighter on dark) for closed and low-attendance rows.

### Neutral
- **Shell** (`shell`, white on light; `shell-dark`, Departure Ink ≈ #0A0C0F): the ground behind the sidebar and the login board. Toasts are cards.
- **Scrim** (`scrim`, Departure Ink in both themes): the dialog and drawer backdrop, the tint of lift shadows, and the camera viewport.
- **Board Slate** (`shell-accent`) and **Shell Rule** (`shell-border`): hovered nav items and hairlines on the shell.
- **Steel** (`shell-muted` on the shell, `muted-foreground` on content): secondary text, column heads, field labels, muted board statuses.
- **Sheet White** (`background`, `card`, `shell`, `topbar`: #FFFFFF): light theme is one white sheet. Sidebar, top bar, page and cards share it and are told apart only by warm-neutral hairlines (`border`, ≈ #DFDFDB) and ink actions, never by a second grey ground. Muted tints (`muted`, `secondary`, `accent`) are faint warm neutrals for hover and table heads, not for surfaces. In dark the ground is ink and cards are **Board Slate Raised** (`card-dark`).
- **Hairline** (`border`) for every rule; **Control Edge** (`input`, darker, ≥ 3:1) for form control borders.
- **Chart series** (`chart-1`..`chart-5`): ink, amber, green, blue, red; sparklines and charts only, never the only signal. In dark theme `chart-2` currently resolves to the signal value; treat that as a data series colour, not as a live marker, and do not reuse it elsewhere.

### Named Rules
**The Signal Rule.** Signal yellow marks live or changed state and nothing else: never decoration, never a brand accent, never a generic highlight or category colour. If nothing on the screen is live or has changed, no yellow appears.

**The Shared Ground Rule.** The shell (sidebar, login ground) takes the page ground in both themes, so light and dark change the whole screen. Only the scrim stays ink.

**The Word-First Rule.** Every status is a word (Present, Late, Absent, Excused; On track, Watch, At risk; In session, Next, Ended, Scheduled). Colour only reinforces it. All token pairs are checked by `npm run check:contrast` against WCAG 2.1 AA.

## Typography

**Display Font:** Barlow Condensed (with Noto Kufi Arabic, then system sans)
**Body Font:** Barlow (with Noto Kufi Arabic, then system sans)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Menlo)

**Character:** A signage pairing: condensed capitals read like gate and status boards, the regular Barlow keeps prose calm, and the monospace makes every time, code, hall and percentage line up in tabular columns. All faces are self-hosted via @fontsource (Barlow 400-700, Barlow Condensed 500-700, JetBrains Mono 400-500, Noto Kufi Arabic 400/600).

### Hierarchy
- **Display** (Barlow Condensed 700, 1.75rem rising to 2rem at sm, line-height 1): page titles in sentence case; the pass headings ("Sign in", the student's name) in capitals at 0.02-0.03em tracking.
- **Stat** (Barlow Condensed 600, 2.75rem, line-height 1, -0.01em, tabular): the single large figure of a dashboard metric.
- **Figure** (JetBrains Mono 500, 1.75rem, line-height 1, tabular): values in summary strips.
- **Title** (Barlow Condensed 600, 1.125rem, uppercase, 0.04em): card titles; dialog titles at 1.25rem; the mobile top-bar title at 1.35rem 700.
- **Control** (Barlow Condensed 600, 0.95rem, uppercase, 0.06em): buttons, tabs, sidebar items (0.98rem, 0.05em), board statuses.
- **Label** (Barlow Condensed 600, 0.75-0.8rem, uppercase, 0.12-0.14em): field labels, column heads, pass field captions, role line in the sidebar. The widest tracking (0.14em) belongs to board column heads and pass fields.
- **Body** (Barlow 400, 0.95rem; secondary text 0.875rem): descriptions and prose, held to `max-w-prose` (65ch).
- **Data** (JetBrains Mono 500, 0.95rem, tabular): codes, halls, slots, seats, emails and passwords in sign-in; board times at 1.125rem (1rem dense); the board clock at 0.75rem.

### Named Rules
**The Tabular Rule.** Every number a user compares (time, code, hall, count, rate) is set in JetBrains Mono or with tabular figures; tables, `<time>` and `.font-mono` get `tabular-nums` globally.

**The Capitals Rule.** Condensed capitals are for labels, controls and short headings only. Prose, descriptions and page titles stay in sentence case Barlow.

## Layout

The app is a fixed shell sidebar (256px) beside a content plane capped at 1600px, padded 16px / 24px / 32px at base / sm / lg. Below lg (1024px) the sidebar becomes a shell drawer over the ink scrim from the start edge and the top bar shows the page title and clock. The 64px top bar is white with a hairline under it on light; on dark it takes the shell tone, so sidebar, top bar and page ground read as one ink plane and only cards lift.

Content is composed as ruled lists, not tiles. The board and class lists are tables with a hairline under every row (row padding 14px, 10px dense; class rows 12px x 16px). Summary figures sit in a single bordered strip divided by hairlines (cells 16px x 20px, auto-fit at 9rem minimum, two columns on phones). Dashboard home pairs a 2:1 board-and-actions grid at xl.

Login at desktop is a 1440px-capped two-column grid: the departures board takes the flexible column, the 420px sign-in pass sits on the right; on phones the pass comes first and the board follows. The Hall column drops below sm, and a changed hall then appears as a signal chip in the Status cell so it is never lost.

All direction-sensitive spacing and positioning uses logical properties (`ps/pe`, `ms/me`, `start/end`, `text-start/end`, `rounded-s/e`, `border-e`), directional arrows flip with `rtl:-scale-x-100`, and divided groups use `rtl:divide-x-reverse`. Dialog centring is deliberately physical (left 50% with a -50% translate), because centring is symmetric under RTL.

## Elevation & Depth

Flat by default. On light, surfaces separate only by 1px hairlines (one white sheet); on dark, by tone (ink ground vs slate card) and hairlines, not shadows. Shadow appears only on objects that lift off the board: the pass, dialogs, toasts, and Radix popovers. Every lift is a long, soft, negatively spread drop tinted with ink.

### Shadow Vocabulary
- **Pass lift** (`box-shadow: 0 32px 80px -32px rgb(0 0 0 / 0.55)`; 0.75 alpha on the ink login ground): the sign-in and check-in pass.
- **Dialog lift** (`box-shadow: 0 24px 64px -24px hsl(var(--shell) / 0.6)`): modal dialogs, over an ink scrim at 70% with a 2px blur.
- **Toast lift** (`box-shadow: 0 12px 32px -12px hsl(var(--shell) / 0.45)`): ink toasts.

### Named Rules
**The Lifts-Off Rule.** Only objects that are handed to the user (a pass, a dialog, a toast, a menu) cast a shadow. Rows, strips, cards and controls are flat.

## Shapes

Square-ish. The base radius is 6px (`lg`); controls, cards, strips and nav items use 4px (`md`); chips and badges use 2px (`sm`). The pass is the one rounder object (12px) and carries punched notches: 24px circles in the ground colour cut into both edges at each perforation, joined by a 2px dashed hairline inset 24px from the sides. The same dashed hairline outlines the QR placeholder on the check-in pass. The logo mark is an ink tile of three board rows with the middle row in signal yellow.

## Components

### Buttons
Condensed capitals on flat fills; they press down 1px when clicked.
- **Shape:** 4px corners; heights 32 / 40 / 48px (sm / default / lg), padding 12 / 20 / 32px.
- **Primary:** ink fill with white text on light; panel-white fill with ink text on dark. Hover steps to `primary-hover`.
- **Outline:** an 80% foreground edge on transparent; hover fills solid with foreground and inverts the text. The board's row action link and the sign-in demo-account segments use the same invert-on-hover.
- **Destructive:** `destructive` fill, hover to `destructive-hover`.
- **Secondary / Ghost:** steel fill or no fill; hover to the accent tone.
- **Link:** sentence-case Barlow with an underline at 30% that strengthens on hover.
- **Focus:** 2px ring in `ring` with a 2px offset in the ground colour; colour transitions 150ms.

### Chips
- **Status badge:** 2px corners, condensed capitals at 0.78rem with 0.08em tracking, solid status fill with its paired foreground (success, warning, destructive, info), or secondary for neutral facts (Archived, "3 enrolled").
- **Signal chip:** signal fill, ink text, 2px corners, condensed bold capitals at 0.9rem. Used only for live and changed state (see The Signal Rule).

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** `card` (white with a hairline on light, raised slate on dark).
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 20px; title row then content, both at 20px.
- Cards frame a board or a list; they are not the unit of a dashboard. Metrics go in a summary strip.

### Inputs / Fields
- **Style:** 40px tall (48px on the pass), white card fill, 1px `input` edge, 4px corners; the edge darkens to 60% foreground on hover.
- **Focus:** 2px ring in `ring`.
- **Error / Disabled:** `aria-invalid` turns the edge destructive, with a destructive message under the field; disabled drops to 50% opacity.
- **Labels:** condensed capitals at 0.8rem with 0.12em tracking (0.14em on the pass), in steel.

### Navigation
- **Sidebar:** shell ground, 256px. The header holds the logo with an "Attendance" subtitle, then the role in condensed capitals over the board clock, each band closed by a shell hairline.
- **Items:** condensed capitals at 0.98rem, steel text, 4px corners, 8px x 12px padding, a 16px lucide icon. Hover: `shell-accent` fill and `shell-foreground` text. **Active:** an inverted block, ink with white text on light and panel-white with ink text on dark, a ticket pulled from the board. Never yellow.
- **Top bar:** 64px bar (white on light, shell ink on dark) with theme toggle, notifications, name and email, an initials block in ink, and an outline Sign out.
- **Tabs:** condensed capitals over a hairline; the active tab takes a 2px foreground underline.

### Departures Board (signature)
A table of sessions ranked by start time: Time (mono, with a small Today / Tomorrow / weekday line above), Course (mono code over a Barlow title and instructor), Hall (mono), Status. It renders on ink (`shell`, login) or inside a card (`card`, in-app, `dense`).
- **Status weighting:** **In session** is the signal chip; **Next** (the first upcoming session when nothing is live) is full-weight foreground; **Scheduled** and **Ended** recede to steel. On the ink board, Closed and Last-rate statuses use shell ok / shell alert.
- **Motion:** rows enter with `row-in` (fade and 6px drop, 320ms, ease `cubic-bezier(0.16, 1, 0.3, 1)`, 45ms stagger). A changed row lands in signal yellow and settles over 1.6s (`signal-in`); a changed hall keeps its signal chip until the data moves on. All motion collapses under `prefers-reduced-motion`.

### Pass (signature)
A white segmented pass with 12px corners and the pass lift: header segment (heading and board clock), dashed perforation with notches, body segment, and a further perforated segment for results or demo accounts. Pass fields are a small condensed caption over a mono value, like GATE / SEAT. A successful check-in result lands with `signal-in`.

The sign-in pass is a full airline boarding pass: an inverted `primary` header band (wordmark, BOARDING PASS), a route row (FROM `LGN` → TO the role code, mono 2.5rem, dotted line with a plane between), a DATE / TIME / PASSENGER strip, the form segment headed "Sign in", and a stub with the demo accounts over a `PassBarcode`. The ticket face mirrors the form and is `aria-hidden`: the passenger and barcode follow the typed email, and choosing a demo account prints its destination (ADM / FAC / STU) with `signal-in`.

### Summary Strip (signature)
One bordered strip of figures: condensed caption over a mono figure at 1.75rem, an optional steel hint, hairlines between every cell. It replaces rows of metric cards.

## Do's and Don'ts

### Do:
- **Do** reserve signal yellow (#FFD400, ink text) for live or changed state: the in-session chip, a changed hall, the IN SESSION chip on the pass, the scan line, and the `signal-in` landing.
- **Do** mark the active nav item as an inverted block (`shell-foreground` ground, `shell` text): ink on light, panel-white on dark.
- **Do** keep the shell ink in both themes, and invert primary to panel white with ink text in dark.
- **Do** spell every status as a word and let colour reinforce it.
- **Do** set times, codes, halls, seats and rates in JetBrains Mono or tabular figures.
- **Do** list sessions and classes as hairline-ruled rows and group figures in a summary strip.
- **Do** use logical start/end properties and flip directional icons under RTL; keep dialog centring physical.
- **Do** run `npm run check:contrast` after changing any token.

### Don't:
- **Don't** use signal yellow for brand accents, active navigation, categories or emphasis.
- **Don't** show a status by colour alone (a dot, a bar or a tint without its word).
- **Don't** build dashboards as grids of shadowed metric cards; use a summary strip and ruled rows.
- **Don't** add shadows to rows, cards or controls; only passes, dialogs, toasts and menus lift.
- **Don't** use physical left/right spacing, borders or radii for direction-sensitive layout.
- **Don't** set prose or page titles in condensed capitals.
- **Don't** round controls or cards past 4px; the 12px pass is the only exception.
