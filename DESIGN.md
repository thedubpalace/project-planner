---
name: project-planner
description: PM planning tool — task estimation, auto resource matching, deadline-risk timelines
colors:
  page-cream: "#f7f4f0"
  surface-white: "#ffffff"
  surface-tint: "#f0ebe4"
  border-hairline: "#e4ded4"
  border-divider: "#ece7df"
  ink-primary: "#26221d"
  ink-secondary: "#58524a"
  ink-muted: "#7a7369"
  wine-primary: "#7a1f49"
  wine-wash: "#f7e6ee"
  wine-border: "#c98ca9"
  status-good: "oklch(42% 0.13 145)"
  status-warning: "oklch(45% 0.13 85)"
  status-danger: "oklch(45% 0.17 25)"
typography:
  body:
    fontFamily: "Inter, Sarabun, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Inter, Sarabun, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.04em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: "12px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.wine-primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
---

# Design System: project-planner

## Overview

**Creative North Star: "The Reporting Desk"**

project-planner reads like an internal operations report, not a marketing surface: warm-white paper, a single wine-dark ink for anything actionable, and gray/green/amber/red doing the actual communicating. The PM opens this once a day to answer one question — is anything about to slip — so the system optimizes for scanning speed over decoration. Three registers coexist on purpose: the dashboard is calm (cards, generous space, a status pill and nothing else competing for attention); the Gantt views are dense working diagrams (grid-aligned, spreadsheet-adjacent, no wasted pixel); forms are roomy and linear, because task creation triggers an auto-match algorithm the PM needs to watch happen, not just fill in a box.

Red is load-bearing, not decorative: it appears exactly at deadline breach, unassigned work, and overallocation, and nowhere else. If a PM sees red anywhere in this app, something is actually wrong.

**Key Characteristics:**
- Warm-white paper ground (never pure-white-on-pure-white; the base is a tinted cream, surfaces are white cards sitting on it)
- One accent (deep wine), used sparingly — primary actions, active nav, in-progress fills, "today" markers
- Status color is the only other color language: green/amber/red/gray, always meaning the same four things everywhere
- Flat-bordered "working diagram" mood for the Gantt panes; soft-shadowed card mood everywhere else

## Colors

Warm neutrals carry the page; one wine accent carries action; status color carries risk. Nothing else competes.

### Primary
- **Wine** (`#7a1f49`): primary buttons, active nav underline, "today" timeline marker, in-progress Gantt bar fill, focus rings. Used on a small fraction of any screen — its rarity is what makes it read as "this is the actionable one."

### Neutral
- **Page Cream** (`#f7f4f0`): app background — the paper the cards sit on.
- **Surface White** (`#ffffff`): cards, nav bar, table rows, modal/drawer panels.
- **Surface Tint** (`#f0ebe4`): hover states, weekend Gantt columns, skeleton blocks.
- **Border Hairline** (`#e4ded4`): default 1px borders on cards and inputs.
- **Border Divider** (`#ece7df`): quieter 1px separators (tab underlines' rest state, table row dividers).
- **Ink Primary** (`#26221d`): headings, primary data, task/project names.
- **Ink Secondary** (`#58524a`): secondary labels, dates, meta rows.
- **Ink Muted** (`#7a7369`): placeholder text, counts, least-important meta.

### Status (semantic, not decorative)
- **Good / on track** (`oklch(42% 0.13 145)` text on `oklch(95% 0.035 145)` wash): schedule has slack.
- **Warning / at risk** (`oklch(45% 0.13 85)` text on `oklch(95% 0.045 85)` wash): slack under 10% of total span.
- **Danger / breach, unassigned, overallocated** (`oklch(45% 0.17 25)` text on `oklch(95% 0.035 25)` wash): the only color allowed to alarm the PM.

### Named Rules
**The One Fire Alarm Rule.** Red exists in exactly three states — deadline breach, unassigned task, overallocated resource — and never as emphasis, brand color, or decoration. If red appears, it is always actionable.

**The Rarity Rule.** Wine (the accent) covers a small minority of any screen's surface area. A screen that's mostly wine has stopped using it as an accent.

## Typography

**Body Font:** Inter (with Sarabun fallback for Thai resource/task names, system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with Fira Code fallback) — dates, hour counts, durations, anything numeric that benefits from tabular alignment

**Character:** A dense operations tool, not an editorial surface — Inter carries every weight of the hierarchy; mono is reserved for numbers so schedule figures scan like a spreadsheet, not prose.

### Hierarchy
- **Title** (600, 20px): page headings ("Portfolio", "Projects").
- **Headline** (600, 16px): project name in detail header, nav wordmark.
- **Body** (400–500, 13px, 1.4 line-height): default UI text — the whole app runs on this one size, deliberately narrow, since this is a dense data tool rather than a reading surface.
- **Label** (500, 11px, 0.04em tracking, uppercase): table column headers only.
- **Mono/Data** (400–500, 10–12px): dates, hour labels on Gantt bars, mandays, IDs.

### Named Rules
**The One Body Size Rule.** UI copy runs on a single 13px body size almost everywhere; hierarchy comes from weight and color, not a large type scale, because this is an operate-mode tool where scanning density beats display drama.

## Layout

Three-tier density model, chosen per surface rather than globally:
- **Dashboard / Resources:** card grid, `auto-fill, minmax(320px, 1fr)`, 20px gutters, generous 20px card padding.
- **Project detail:** persistent header + always-visible deadline banner (never hidden inside a tab) above a 3-tab body (Timeline / Tasks / Resources).
- **Portfolio:** same banner-then-content pattern, but the body is one continuous grouped Gantt instead of tabs — projects are sections, not separate views.
- **Gantt panes (both single-project and portfolio):** fixed 260–280px frozen left pane (task/project names) + horizontally-scrollable date grid, synced vertical scroll. Row height 32–36px — this is the one place the app trades whitespace for information density on purpose.

## Elevation & Depth

Hybrid: the Gantt panes stay flat (borders only, no shadow — they're working diagrams, meant to feel like a spreadsheet sitting flush on the page). Every other surface — nav bar, cards, modals, drawers, toasts, table wrappers — gets a soft ambient shadow to separate it from the warm-cream page background, since flat white-on-cream reads ambiguous without one.

### Shadow Vocabulary
- **Nav** (`0 1px 3px oklch(25% 0.02 60 / 6%)`): sticky top bar, just enough separation to read as "above" scrolled content.
- **Card** (`0 1px 2px oklch(25% 0.02 60 / 5%), 0 6px 16px oklch(25% 0.02 60 / 6%)`): project cards, table wrappers, toasts — a soft two-layer lift.
- **Modal** (`0 12px 32px oklch(20% 0.02 60 / 16%), 0 2px 8px oklch(20% 0.02 60 / 10%)`): modals, drawers, confirm dialogs — the deepest shadow in the system, reserved for content that overlays everything else.

### Named Rules
**The Working-Diagram Exception Rule.** Gantt panes never get a shadow — the "spreadsheet, not card" register is deliberate and shadows would contradict it.

## Shapes

10px radius on cards and top-level modals/drawers; 6–8px on buttons, inputs, and table wrappers; fully round (`9999px`) on status pills and skill-tag chips. Borders are always 1px hairline in the neutral scale — color never carries a border above 1px (a colored left-border accent on a list item or card is explicitly avoided; status is always carried by a pill or fill, never a stripe).

## Components

### Buttons
- **Shape:** 6–8px radius, 32–36px height depending on size.
- **Primary:** wine fill (`#7a1f49`), white text, no border; hover brightens.
- **Secondary:** transparent, hairline border, ink-primary text; hover shifts border to wine.
- **Danger:** transparent, danger-colored border and text.
- **Ghost:** no border/fill, secondary-ink text, hovers to primary-ink.

### Chips (skill tags, status pills)
- **Style:** fully round, pale tinted background, saturated text in the same hue, hairline border one step darker than the background.
- **State:** status pills add a small leading glyph (● ○ ◐ ✓ ⚠) so meaning survives without color (colorblind-safe redundancy).

### Cards / Containers
- **Corner Style:** 10px (project cards, modals) or 8px (table wrappers).
- **Background:** surface white on page cream.
- **Shadow Strategy:** Card-level shadow (see Elevation & Depth); Gantt panes are the flat exception.
- **Border:** 1px hairline neutral border on every card/table wrapper, always in addition to the shadow, never instead of it.
- **Internal Padding:** 20px (cards), 12–16px (table cells).

### Inputs / Fields
- **Style:** hairline border, 6px radius, white background, 8px/10px padding.
- **Focus:** border shifts to wine (no glow/ring — a solid color-change focus state, consistent with the flat-bordered form language).

### Navigation
- **Style:** white sticky top bar with a soft nav shadow; wordmark left, tab links center-left (2px wine underline on the active tab, transparent at rest), primary CTA right when the current page has one.

### Gantt (signature component)
Frozen left pane of task/project names + horizontally scrollable date grid, synced scroll. Ghost planned-bar (dashed neutral outline) always renders under the live status fill (wine = in progress, green = done, red = done-late/over-deadline), so "what was planned" and "what's actually happening" are both visible at once. Dependency lines are neutral gray elbow connectors, drawn only between visible rows. A solid wine vertical line marks "today"; a dashed danger-colored line marks each deadline, labeled with the project name in portfolio view. Rows that push past deadline get a 2px danger-colored ring on their bar, never a colored border on the row itself.

## Do's and Don'ts

### Do:
- **Do** keep wine as the only accent color — status color (green/amber/red/gray) is a separate, non-overlapping language.
- **Do** put status pills or fills wherever risk needs to be shown; never a colored border-left/border-right on a card or list row.
- **Do** use mono for any number a PM might compare across rows (dates, hours, mandays).
- **Do** apply the Card shadow to any new top-level surface (dashboard cards, table wrappers, toasts); apply the Modal shadow to anything that overlays page content.

### Don't:
- **Don't** add a shadow to Gantt panes — they're the one deliberately flat, working-diagram surface in the system.
- **Don't** introduce a second accent color; wine carries every "this is actionable" signal alone.
- **Don't** use red for anything other than deadline breach, unassigned task, or overallocated resource.
- **Don't** scale body text up for emphasis — this is a 13px-body operate tool; use weight and ink color for hierarchy instead.
