# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**PM (project manager)** — the sole user of v1. Runs one or more internal projects,
plans tasks against a deadline, and needs to react fast when reality drifts from plan.
No other roles exist yet: resources (the people doing the work) are data the PM
manages, not accounts that log in.

## Product Purpose

Replace spreadsheet-based project planning. The PM enters tasks with an hour
estimation and a required skill; the app assigns the best-available person
automatically, computes a schedule from estimation ÷ capacity, and — when progress is
logged — recalculates everything downstream instead of leaving the PM to redo the math
by hand. Success is the PM knowing, the moment they open a project, whether it's still
going to land on time and exactly which task is the reason if not.

## Positioning

Ordinary Gantt tools show a plan; they don't maintain one. This app's mechanism is the
loop: auto-match resource by skill + least cross-project workload → compute schedule →
on progress update, cascade-reschedule dependent tasks → surface deadline breach
immediately. A spreadsheet or a static Gantt chart can't do the cascade or the
cross-project workload balancing without the PM doing it by hand.

## Operating Context

Internal tool, single PM, browser-based. Runs as a Next.js app, accessed two ways:
directly on the LAN (`http://<host-ip>:3000/project`) and publicly through an Nginx
Proxy Manager reverse-proxy path (`https://pulsenprompt.duckdns.org/project`) alongside
sibling internal tools (skill-finder, html-hub, matchday, etc.) on the same domain —
hence the app is served under a `/project` basePath, not domain root. No mobile-first
requirement; desktop/laptop browser is the primary context (dense data tool).

## Capabilities and Constraints

- CRUD for project (with deadline), task (estimation in hours, required skill tag(s),
  optional finish-to-start dependency), and resource (name, skill tags, capacity
  hours/day, default 8).
- Auto-match on task create/edit: filter resources by skill tag, pick least
  cross-project workload; falls back to "unassigned" (never guesses) when no skill
  matches. PM can always override.
- Schedule = estimation ÷ assigned resource's capacity, Mon–Fri only (no holiday
  calendar in v1), chained from predecessor finish date when a dependency exists.
- Progress update (%, or status not-started/in-progress/done) triggers automatic
  reschedule of dependent tasks and workload recalculation.
- Deadline breach must be visible immediately on entering a project (persistent
  banner), not buried inside individual tasks.
- Resource pool is shared across all projects — workload calculations for auto-match
  and capacity are cross-project.
- **Non-goals (v1, explicit):** no login/auth (single PM only — resources don't log
  in), no external HR/calendar integration, no holiday/leave calendar, no dependency
  types beyond finish-to-start, no outbound notifications (email/Slack), single-tenant.
- Full detail lives in `.veda/projects/project-planner/requirements.md` (source spec)
  and `.veda/projects/project-planner/design.md` (visual/layout spec) in the Veda
  orchestrator repo — this project was bootstrapped, spec'd, and designed through the
  Veda agent pipeline before this PRODUCT.md was written.

## Brand Commitments

Inherits the Veda ecosystem's warm-dark visual language (already established in
veda-dashboard and html-hub) so it reads as part of the same internal toolbox —
`#0e0d0b`/`#161410` base, amber `#d97706` accent reserved for primary actions, red
reserved exclusively for genuine danger (deadline breach, unassigned task,
overallocated resource) — never decorative. Typography: Inter (UI), Sarabun (Thai
name fallback), JetBrains Mono (numeric/data-dense contexts). Register: **product**
(daily-use internal tool — familiarity and scanability over visual novelty).

## Evidence on Hand

No customer-facing content, testimonials, or marketing claims — this is an internal
tool with one real user (the PM operating it). Seed/demo data (3 resources, 1 sample
project with a dependency chain) exists in the running app for first-run testing only,
not as product evidence to reuse in UI copy.

## Product Principles

1. **The PM should never do arithmetic the app already has the inputs for** — every
   schedule, workload, and breach number is computed, not manually tracked.
2. **Red means something.** Danger color is reserved for deadline breach, unassigned
   work, and overallocation — nothing else borrows it.
3. **Auto-match proposes, the PM decides.** Automation never silently locks the PM out
   of overriding an assignment.
4. **Density where it earns it, calm where it doesn't** — the Gantt is a working
   diagram (dense, grid-aligned); the dashboard and forms stay roomy and scannable.
5. **No guessing on missing data** — an unmatched task shows "unassigned" clearly
   rather than the app picking an imperfect fit silently.

## Accessibility & Inclusion

No formally required standard confirmed. Resource names may be Thai — typography
stack includes a Thai-compatible fallback (Sarabun) for that reason.
