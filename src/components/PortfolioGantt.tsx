"use client";

import { useMemo, useRef } from "react";
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO, startOfWeek } from "date-fns";
import type { DashboardProject } from "@/lib/client";
import type { ScheduledTask } from "@/lib/types";
import { buildDependencyPath } from "@/lib/ganttConnector";
import { StatusPill, fmtDate, taskPill, type PillVariant } from "./ui";

const ROW_H = 32;
const HEADER_H = 34;

const RISK_PILL: Record<string, PillVariant> = {
  on_track: "on-track",
  at_risk: "at-risk",
  over_deadline: "over-deadline",
};

function d(iso: string): Date {
  return parseISO(iso + "T00:00:00");
}

export function PortfolioGantt({
  projects,
  collapsed,
  onToggleGroup,
  onOpenProject,
  onEditTask,
}: {
  projects: DashboardProject[];
  collapsed: Set<number>;
  onToggleGroup: (projectId: number) => void;
  onOpenProject: (projectId: number) => void;
  onEditTask: (projectId: number, task: ScheduledTask) => void;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildModel(projects, collapsed), [projects, collapsed]);

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <div className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
          No projects yet
        </div>
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Create a project to see it on the portfolio timeline
        </div>
      </div>
    );
  }

  const syncScroll = (src: "left" | "grid") => {
    const from = src === "left" ? leftRef.current : gridRef.current;
    const to = src === "left" ? gridRef.current : leftRef.current;
    if (from && to && to.scrollTop !== from.scrollTop) to.scrollTop = from.scrollTop;
  };

  return (
    <>
      {/* mobile fallback */}
      <div className="sm:hidden px-6 py-4 flex flex-col gap-4">
        <div className="text-[12px] mb-1" style={{ color: "var(--text-muted)" }}>
          View the portfolio timeline on a larger screen
        </div>
        {projects.map((p) => {
          return (
            <div key={p.id} className="flex flex-col gap-2">
              <div onClick={() => onOpenProject(p.id)} className="flex items-center justify-between cursor-pointer">
                <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {p.name}
                </span>
                <StatusPill variant={RISK_PILL[p.schedule.risk]} />
              </div>
              {p.schedule.tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 ml-2"
                  style={{ borderColor: "var(--border-divider)", background: "var(--bg-surface)" }}
                  onClick={() => onEditTask(p.id, t)}
                >
                  <div className="flex flex-col">
                    <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                      {t.name}
                    </span>
                    <span className="text-[11px] mono" style={{ color: "var(--text-muted)" }}>
                      {fmtDate(t.plannedStart, false)} – {fmtDate(t.effectiveEnd, false)}
                    </span>
                  </div>
                  <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline)} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* desktop portfolio gantt */}
      <div className="hidden sm:flex" style={{ height: "calc(100vh - 220px)", minHeight: 420 }}>
        {/* left pane */}
        <div
          ref={leftRef}
          onScroll={() => syncScroll("left")}
          className="shrink-0 overflow-y-auto"
          style={{ width: 280, borderRight: "1px solid var(--border-divider)" }}
        >
          <div
            className="sticky top-0 z-10 flex items-center px-3 text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ height: 40, background: "var(--bg-surface)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-divider)" }}
          >
            Project / Task
          </div>
          {model.rows.map((row) =>
            row.kind === "group" ? (
              <GroupHeaderRow
                key={`g${row.project.id}`}
                project={row.project}
                expanded={!collapsed.has(row.project.id)}
                onToggle={() => onToggleGroup(row.project.id)}
                onOpen={() => onOpenProject(row.project.id)}
              />
            ) : (
              <div
                key={`t${row.task!.id}`}
                onClick={() => onEditTask(row.project.id, row.task!)}
                className="flex items-center gap-2 pl-8 pr-3 cursor-pointer hover:bg-[var(--bg-surface-hi)]"
                style={{ height: ROW_H, borderBottom: "1px solid var(--border-divider)" }}
              >
                <span className="text-[12px] truncate flex-1" style={{ color: "var(--text-primary)" }}>
                  {row.task!.name}
                </span>
                {row.task!.forecastEnd && (
                  <span
                    className="text-[9px] mono whitespace-nowrap shrink-0"
                    style={{ color: "var(--gantt-forecast-border)" }}
                    title={`Forecast finish at current pace: ${fmtDate(row.task!.forecastEnd)}`}
                  >
                    → {fmtDate(row.task!.forecastEnd, false)}
                  </span>
                )}
                {row.task!.isUnassigned && (
                  <span className="text-[10px] shrink-0" style={{ color: "var(--status-danger-text)" }}>
                    ⚠
                  </span>
                )}
              </div>
            ),
          )}
        </div>

        {/* grid */}
        <div ref={gridRef} onScroll={() => syncScroll("grid")} className="flex-1 overflow-auto relative">
          <div style={{ width: model.gridWidth, position: "relative" }}>
            {/* date header */}
            <div
              className="sticky top-0 z-20 flex"
              style={{ height: 40, background: "var(--bg-surface)", borderBottom: "1px solid var(--border-divider)" }}
            >
              {model.columns.map((c, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center justify-center shrink-0"
                  style={{
                    width: model.colW,
                    background: c.weekend ? "var(--gantt-weekend-col)" : "transparent",
                    borderRight: "1px solid var(--gantt-grid-line)",
                  }}
                >
                  <span
                    className="mono text-[10px]"
                    style={{ color: c.emphasize ? "var(--text-secondary)" : "var(--text-muted)", fontWeight: c.emphasize ? 500 : 400 }}
                  >
                    {c.label}
                  </span>
                  {model.unit === "day" && (
                    <span className="mono text-[9px]" style={{ color: "var(--text-muted)" }}>
                      {c.sub}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* body */}
            <div style={{ position: "relative", height: model.totalHeight }}>
              {/* column backgrounds */}
              <div className="absolute inset-0 flex pointer-events-none">
                {model.columns.map((c, i) => (
                  <div
                    key={i}
                    className="shrink-0 h-full"
                    style={{
                      width: model.colW,
                      background: c.weekend ? "var(--gantt-weekend-col)" : "transparent",
                      borderRight: "1px solid var(--gantt-grid-line)",
                    }}
                  />
                ))}
              </div>

              {/* group header bands (align with left pane group rows) */}
              {model.rows.map((row) =>
                row.kind === "group" ? (
                  <div
                    key={`gb${row.project.id}`}
                    className="absolute left-0 right-0"
                    style={{
                      top: row.top,
                      height: row.height,
                      background: "var(--bg-surface)",
                      borderBottom: "1px solid var(--border-divider)",
                      borderTop: row.top === 0 ? undefined : "1px solid var(--border-divider)",
                    }}
                  />
                ) : null,
              )}

              {/* today marker (spans full height) */}
              {model.todayX != null && (
                <Marker x={model.todayX} top={0} height={model.totalHeight} color="var(--gantt-today-line)" label="Today" labelColor="var(--accent-text)" />
              )}

              {/* per-project deadline markers (span only that project's group) */}
              {model.deadlineMarkers.map((m) => (
                <Marker
                  key={`d${m.label}`}
                  x={m.x}
                  top={m.top}
                  height={m.height}
                  color="var(--gantt-deadline-line)"
                  label={`${m.label} deadline`}
                  labelColor="var(--status-danger-text)"
                  dashed
                />
              ))}

              {/* dependency lines */}
              <svg className="absolute inset-0 pointer-events-none" width={model.gridWidth} height={model.totalHeight} style={{ zIndex: 5 }}>
                {model.depLines.map((l, i) => (
                  <path key={i} d={l} fill="none" stroke="var(--gantt-dependency-line)" strokeWidth={1.5} />
                ))}
                {model.forecastDepLines.map((l, i) => (
                  <path key={i} d={l} fill="none" stroke="var(--gantt-forecast-border)" strokeWidth={1.5} strokeDasharray="4 3" />
                ))}
              </svg>

              {/* bars */}
              {model.rows.map((row) => {
                if (row.kind !== "task") return null;
                const t = row.task!;
                const b = model.bars.get(t.id)!;
                return (
                  <div key={t.id} className="absolute" style={{ top: b.top, height: ROW_H, left: 0, right: 0 }}>
                    {/* planned ghost */}
                    <div
                      className="absolute rounded"
                      style={{
                        left: b.left,
                        width: b.plannedWidth,
                        top: (ROW_H - 18) / 2,
                        height: 18,
                        background: "var(--gantt-bar-planned-bg)",
                        border: "1px dashed var(--gantt-bar-planned-border)",
                      }}
                    />
                    {/* foreground */}
                    {b.fg && (
                      <div
                        className="absolute rounded flex items-center px-1.5 bar-shift"
                        style={{
                          left: b.fg.left,
                          width: b.fg.width,
                          top: (ROW_H - 18) / 2,
                          height: 18,
                          background: b.fg.color,
                          outline: b.ring ? "2px solid var(--gantt-critical-ring)" : undefined,
                          outlineOffset: b.ring ? 1 : undefined,
                          zIndex: 6,
                        }}
                        title={b.aria}
                        aria-label={b.aria}
                      />
                    )}
                    {/* forecast overrun (own delay) — hatched tail past the plan */}
                    {b.forecastOverrun && (
                      <div
                        className="absolute rounded"
                        style={{
                          left: b.forecastOverrun.left,
                          width: b.forecastOverrun.width,
                          top: (ROW_H - 18) / 2,
                          height: 18,
                          background: "var(--gantt-forecast-bg)",
                          backgroundImage:
                            "repeating-linear-gradient(45deg, var(--gantt-forecast-border) 0, var(--gantt-forecast-border) 2px, transparent 2px, transparent 6px)",
                          border: "1px solid var(--gantt-forecast-border)",
                          zIndex: 4,
                        }}
                        title={`Forecast: at current pace, finishes ${fmtDate(t.forecastEnd, false)}`}
                      />
                    )}
                    {/* forecast shift (cascaded from a delayed predecessor) — preview ghost */}
                    {b.forecastGhost && (
                      <div
                        className="absolute rounded"
                        style={{
                          left: b.forecastGhost.left,
                          width: b.forecastGhost.width,
                          top: (ROW_H - 18) / 2,
                          height: 18,
                          border: "1.5px dashed var(--gantt-forecast-border)",
                          zIndex: 4,
                        }}
                        title={`Forecast shift: ${fmtDate(t.forecastStart, false)} – ${fmtDate(t.forecastEnd, false)}`}
                      />
                    )}
                    {!b.fg && <span className="sr-only">{b.aria}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function GroupHeaderRow({
  project,
  expanded,
  onToggle,
  onOpen,
}: {
  project: DashboardProject;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-2 pl-3 pr-3 cursor-pointer hover:bg-[var(--bg-surface-hi)]"
      style={{
        height: HEADER_H,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-divider)",
      }}
    >
      <span
        className="text-[9px] shrink-0 inline-block transition-transform duration-150"
        style={{ color: "var(--text-muted)", transform: expanded ? "rotate(90deg)" : "none", width: 10 }}
      >
        ▸
      </span>
      <span className="text-[12px] font-medium truncate flex-1" style={{ color: "var(--text-primary)" }}>
        {project.name}
      </span>
      <StatusPill variant={RISK_PILL[project.schedule.risk]} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="text-[11px] shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
        style={{ color: "var(--text-secondary)" }}
        aria-label={`Open ${project.name}`}
        title="Open project"
      >
        ↗
      </button>
    </div>
  );
}

function Marker({
  x,
  top,
  height,
  color,
  label,
  labelColor,
  dashed,
}: {
  x: number;
  top: number;
  height: number;
  color: string;
  label: string;
  labelColor: string;
  dashed?: boolean;
}) {
  return (
    <div className="absolute pointer-events-none" style={{ left: x, top, height, zIndex: 7 }}>
      <div style={{ width: 0, height: "100%", borderLeft: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      <span
        className="absolute top-0 text-[9px] mono px-1 whitespace-nowrap"
        style={{ color: labelColor, background: "var(--bg-base)", transform: "translateX(2px)" }}
      >
        {label}
      </span>
    </div>
  );
}

// --- model --------------------------------------------------------------------

interface Column {
  label: string;
  sub: string;
  weekend: boolean;
  emphasize: boolean;
}
interface Bar {
  top: number;
  left: number;
  plannedWidth: number;
  fg: { left: number; width: number; color: string } | null;
  ring: boolean;
  aria: string;
  forecastOverrun: { left: number; width: number } | null;
  forecastGhost: { left: number; width: number } | null;
}
interface Row {
  kind: "group" | "task";
  top: number;
  height: number;
  project: DashboardProject;
  task?: ScheduledTask;
}
interface DeadlineMarker {
  x: number;
  top: number;
  height: number;
  label: string;
}
interface Model {
  unit: "day" | "week";
  colW: number;
  columns: Column[];
  gridWidth: number;
  rows: Row[];
  bars: Map<number, Bar>;
  depLines: string[];
  forecastDepLines: string[];
  todayX: number | null;
  deadlineMarkers: DeadlineMarker[];
  totalHeight: number;
}

function buildModel(projects: DashboardProject[], collapsed: Set<number>): Model {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dates.push(today);
  for (const p of projects) {
    dates.push(d(p.deadline));
    for (const t of p.schedule.tasks) {
      dates.push(d(t.plannedStart), d(t.plannedEnd), d(t.effectiveEnd));
      if (t.forecastEnd) dates.push(d(t.forecastEnd));
    }
  }

  let min = dates[0];
  let max = dates[0];
  for (const x of dates) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  let rangeStart = addDays(min, -2);
  const rangeEnd = addDays(max, 3);
  const totalDaysSpan = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const unit: "day" | "week" = totalDaysSpan > 90 ? "week" : "day";
  const unitDays = unit === "week" ? 7 : 1;
  const colW = unit === "week" ? 48 : 32;
  if (unit === "week") rangeStart = startOfWeek(rangeStart, { weekStartsOn: 1 });

  const columnCount = Math.ceil((differenceInCalendarDays(rangeEnd, rangeStart) + 1) / unitDays);
  const gridWidth = columnCount * colW;
  const x = (date: Date) => (differenceInCalendarDays(date, rangeStart) / unitDays) * colW;

  const columns: Column[] = [];
  for (let i = 0; i < columnCount; i++) {
    const colDate = addDays(rangeStart, i * unitDays);
    if (unit === "day") {
      columns.push({
        label: format(colDate, "d"),
        sub: format(colDate, "EEEEE"),
        weekend: isWeekend(colDate),
        emphasize: colDate.getDay() === 1,
      });
    } else {
      columns.push({ label: format(colDate, "MMM d"), sub: "", weekend: false, emphasize: true });
    }
  }

  // rows with layout (group header + tasks when expanded)
  const rows: Row[] = [];
  const groupSpan = new Map<number, { top: number; bottom: number }>();
  let y = 0;
  for (const p of projects) {
    const groupTop = y;
    rows.push({ kind: "group", top: y, height: HEADER_H, project: p });
    y += HEADER_H;
    if (!collapsed.has(p.id)) {
      for (const t of p.schedule.tasks) {
        rows.push({ kind: "task", top: y, height: ROW_H, project: p, task: t });
        y += ROW_H;
      }
    }
    groupSpan.set(p.id, { top: groupTop, bottom: y });
  }
  const totalHeight = y;

  const bars = new Map<number, Bar>();
  for (const row of rows) {
    if (row.kind !== "task") continue;
    const t = row.task!;
    const left = x(d(t.plannedStart));
    const plannedRight = x(addDays(d(t.plannedEnd), 1));
    const plannedWidth = Math.max(6, plannedRight - left);

    let fg: Bar["fg"] = null;
    const lateDone = t.status === "done" && t.actualEnd && d(t.actualEnd) > d(t.plannedEnd);
    if (t.status === "done") {
      const actualRight = x(addDays(d(t.effectiveEnd), 1));
      fg = {
        left,
        width: Math.max(6, actualRight - left),
        color: lateDone || t.overDeadline ? "var(--gantt-bar-late-bg)" : "var(--gantt-bar-done-bg)",
      };
    } else if (t.status === "in_progress") {
      fg = {
        left,
        width: Math.max(6, (plannedWidth * t.progress) / 100),
        color: t.overDeadline ? "var(--gantt-bar-late-bg)" : "var(--gantt-bar-progress-bg)",
      };
    } else if (t.overDeadline) {
      fg = { left, width: plannedWidth, color: "var(--gantt-bar-late-bg)" };
    }

    const aria = `${t.name}: ${fmtDate(t.plannedStart, false)}–${fmtDate(t.effectiveEnd, false)}, ${
      t.isUnassigned ? "unassigned" : "assigned to " + t.resourceName
    }, ${t.progress}% complete`;

    let forecastOverrun: Bar["forecastOverrun"] = null;
    let forecastGhost: Bar["forecastGhost"] = null;
    if (t.forecastEnd) {
      const forecastRight = x(addDays(d(t.forecastEnd), 1));
      if (t.forecastStart === t.plannedStart) {
        forecastOverrun = { left: plannedRight, width: Math.max(4, forecastRight - plannedRight) };
      } else {
        const forecastLeft = x(d(t.forecastStart!));
        forecastGhost = { left: forecastLeft, width: Math.max(6, forecastRight - forecastLeft) };
      }
    }

    bars.set(t.id, { top: row.top, left, plannedWidth, fg, ring: t.overDeadline, aria, forecastOverrun, forecastGhost });
  }

  // dependency elbow lines (predecessor/successor always share a project)
  const depLines: string[] = [];
  for (const row of rows) {
    if (row.kind !== "task") continue;
    const t = row.task!;
    const succBar = bars.get(t.id)!;
    const y2 = succBar.top + ROW_H / 2;
    for (const depId of t.dependsOn) {
      const predBar = bars.get(depId);
      if (!predBar) continue; // predecessor hidden (collapsed group) or not found
      const x1 = predBar.left + predBar.plannedWidth;
      const y1 = predBar.top + ROW_H / 2;
      const x2 = succBar.left;
      depLines.push(buildDependencyPath(x1, y1, x2, y2));
    }
  }

  // forecast dependency lines — same edges, but only where the predecessor
  // has a forecast delay (own or cascaded); skipped entirely otherwise.
  // Lands on the successor's forecast position when it has one too, else
  // its ordinary planned bar (the delay hasn't (yet) pushed it).
  const forecastDepLines: string[] = [];
  for (const row of rows) {
    if (row.kind !== "task") continue;
    const t = row.task!;
    const succBar = bars.get(t.id)!;
    const y2 = succBar.top + ROW_H / 2;
    for (const depId of t.dependsOn) {
      const predBar = bars.get(depId);
      if (!predBar) continue;
      const predForecastRight = predBar.forecastOverrun
        ? predBar.forecastOverrun.left + predBar.forecastOverrun.width
        : predBar.forecastGhost
          ? predBar.forecastGhost.left + predBar.forecastGhost.width
          : null;
      if (predForecastRight == null) continue;
      const succForecastLeft = succBar.forecastGhost
        ? succBar.forecastGhost.left
        : succBar.forecastOverrun
          ? succBar.left + succBar.plannedWidth
          : succBar.left;
      const y1 = predBar.top + ROW_H / 2;
      forecastDepLines.push(buildDependencyPath(predForecastRight, y1, succForecastLeft, y2));
    }
  }

  const todayX0 = x(today);
  const todayX = todayX0 >= 0 && todayX0 <= gridWidth ? todayX0 : null;

  const deadlineMarkers: DeadlineMarker[] = [];
  for (const p of projects) {
    const dx = x(d(p.deadline));
    if (dx < 0 || dx > gridWidth) continue;
    const span = groupSpan.get(p.id)!;
    deadlineMarkers.push({ x: dx, top: span.top, height: span.bottom - span.top, label: p.name });
  }

  return { unit, colW, columns, gridWidth, rows, bars, depLines, forecastDepLines, todayX, deadlineMarkers, totalHeight };
}
