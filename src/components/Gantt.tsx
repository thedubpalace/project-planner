"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO, startOfWeek } from "date-fns";
import type { ProjectSchedule, ScheduledTask } from "@/lib/types";
import { StatusPill, fmtDate, taskPill } from "./ui";

const ROW_H = 36;

function d(iso: string): Date {
  return parseISO(iso + "T00:00:00");
}

export function Gantt({
  schedule,
  onEditTask,
}: {
  schedule: ProjectSchedule;
  onEditTask: (t: ScheduledTask) => void;
}) {
  const tasks = schedule.tasks;
  const leftRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [pulseIds, setPulseIds] = useState<Set<number>>(new Set());
  const prevPos = useRef<Map<number, string>>(new Map());

  // detect shifted bars → pulse
  useEffect(() => {
    const changed = new Set<number>();
    for (const t of tasks) {
      const key = `${t.plannedStart}|${t.plannedEnd}`;
      const prev = prevPos.current.get(t.id);
      if (prev && prev !== key) changed.add(t.id);
      prevPos.current.set(t.id, key);
    }
    if (changed.size > 0) {
      setPulseIds(changed);
      const id = setTimeout(() => setPulseIds(new Set()), 900);
      return () => clearTimeout(id);
    }
  }, [tasks]);

  const model = useMemo(() => buildModel(schedule), [schedule]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <div className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
          No tasks yet
        </div>
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Add a task to see it on the timeline
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
      <div className="sm:hidden px-6 py-4 flex flex-col gap-2">
        <div className="text-[12px] mb-1" style={{ color: "var(--text-muted)" }}>
          View full timeline on a larger screen
        </div>
        {tasks.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
            style={{ borderColor: "var(--border-divider)", background: "var(--bg-surface)" }}
            onClick={() => onEditTask(t)}
          >
            <div className="flex flex-col">
              <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                {t.name}
              </span>
              <span className="text-[11px] mono" style={{ color: "var(--text-muted)" }}>
                {fmtDate(t.plannedStart, false)} – {fmtDate(t.effectiveEnd, false)} ·{" "}
                {t.isUnassigned ? "Unassigned" : t.resourceName}
              </span>
            </div>
            <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline)} />
          </div>
        ))}
      </div>

      {/* desktop gantt */}
      <div className="hidden sm:flex" style={{ height: "calc(100vh - 260px)", minHeight: 360 }}>
        {/* left pane */}
        <div
          ref={leftRef}
          onScroll={() => syncScroll("left")}
          className="shrink-0 overflow-y-auto"
          style={{ width: 260, borderRight: "1px solid var(--border-divider)" }}
        >
          <div className="sticky top-0 z-10 flex items-center px-3 text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ height: 40, background: "var(--bg-surface)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-divider)" }}>
            Task
          </div>
          {tasks.map((t) => (
            <div
              key={t.id}
              onClick={() => onEditTask(t)}
              className="flex items-center gap-2 px-3 cursor-pointer hover:bg-[var(--bg-surface-hi)]"
              style={{ height: ROW_H, borderBottom: "1px solid var(--border-divider)" }}
            >
              <span className="text-[13px] truncate flex-1" style={{ color: "var(--text-primary)" }}>
                {t.name}
              </span>
              {t.isUnassigned ? (
                <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--status-danger-text)" }}>
                  ⚠ Unassigned
                </span>
              ) : (
                <Initials name={t.resourceName ?? ""} />
              )}
            </div>
          ))}
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
            <div style={{ position: "relative", height: tasks.length * ROW_H }}>
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

              {/* today + deadline markers */}
              {model.todayX != null && (
                <Marker x={model.todayX} color="var(--gantt-today-line)" label="Today" labelColor="var(--accent-text)" />
              )}
              {model.deadlineX != null && (
                <Marker x={model.deadlineX} color="var(--gantt-deadline-line)" label="Deadline" labelColor="var(--status-danger-text)" dashed />
              )}

              {/* dependency lines */}
              <svg className="absolute inset-0 pointer-events-none" width={model.gridWidth} height={tasks.length * ROW_H} style={{ zIndex: 5 }}>
                {model.depLines.map((l, i) => (
                  <path key={i} d={l} fill="none" stroke="var(--gantt-dependency-line)" strokeWidth={1.5} />
                ))}
              </svg>

              {/* bars */}
              {tasks.map((t, idx) => {
                const b = model.bars.get(t.id)!;
                return (
                  <div key={t.id} className="absolute" style={{ top: idx * ROW_H, height: ROW_H, left: 0, right: 0 }}>
                    {/* planned ghost */}
                    <div
                      className="absolute rounded"
                      style={{
                        left: b.left,
                        width: b.plannedWidth,
                        top: (ROW_H - 20) / 2,
                        height: 20,
                        background: "var(--gantt-bar-planned-bg)",
                        border: "1px dashed var(--gantt-bar-planned-border)",
                      }}
                    />
                    {/* foreground */}
                    {b.fg && (
                      <div
                        className={`absolute rounded flex items-center px-1.5 bar-shift ${pulseIds.has(t.id) ? "bar-pulse" : ""}`}
                        style={{
                          left: b.fg.left,
                          width: b.fg.width,
                          top: (ROW_H - 20) / 2,
                          height: 20,
                          background: b.fg.color,
                          outline: b.ring ? "2px solid var(--gantt-critical-ring)" : undefined,
                          outlineOffset: b.ring ? 1 : undefined,
                          zIndex: 6,
                        }}
                        title={b.aria}
                        aria-label={b.aria}
                      >
                        {b.fg.width >= 60 && (
                          <span className="mono text-[10px] truncate" style={{ color: "var(--text-on-accent)" }}>
                            {t.estimationHours}h
                          </span>
                        )}
                      </div>
                    )}
                    {/* aria for not-started (planned only) */}
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

function Marker({ x, color, label, labelColor, dashed }: { x: number; color: string; label: string; labelColor: string; dashed?: boolean }) {
  return (
    <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: x, zIndex: 7 }}>
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

function Initials({ name }: { name: string }) {
  const i = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[10px] mono shrink-0"
      style={{ width: 20, height: 20, background: "var(--bg-surface-hi)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
    >
      {i}
    </span>
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
  left: number;
  plannedWidth: number;
  fg: { left: number; width: number; color: string } | null;
  ring: boolean;
  aria: string;
}
interface Model {
  unit: "day" | "week";
  colW: number;
  columns: Column[];
  gridWidth: number;
  bars: Map<number, Bar>;
  depLines: string[];
  todayX: number | null;
  deadlineX: number | null;
}

function buildModel(schedule: ProjectSchedule): Model {
  const tasks = schedule.tasks;
  const dates: Date[] = [];
  for (const t of tasks) {
    dates.push(d(t.plannedStart), d(t.plannedEnd), d(t.effectiveEnd));
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dates.push(today, d(schedule.deadline));

  let min = dates[0];
  let max = dates[0];
  for (const x of dates) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  let rangeStart = addDays(min, -2);
  const rangeEnd = addDays(max, 3);
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const unit: "day" | "week" = totalDays > 90 ? "week" : "day";
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

  const bars = new Map<number, Bar>();
  const rowOf = new Map<number, number>();
  tasks.forEach((t, i) => rowOf.set(t.id, i));

  for (const t of tasks) {
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

    bars.set(t.id, { left, plannedWidth, fg, ring: t.overDeadline, aria });
  }

  // dependency elbow lines
  const depLines: string[] = [];
  for (const t of tasks) {
    const succRow = rowOf.get(t.id);
    if (succRow == null) continue;
    const succBar = bars.get(t.id)!;
    const y2 = succRow * ROW_H + ROW_H / 2;
    for (const depId of t.dependsOn) {
      const predRow = rowOf.get(depId);
      const predBar = bars.get(depId);
      if (predRow == null || !predBar) continue;
      const x1 = predBar.left + predBar.plannedWidth;
      const y1 = predRow * ROW_H + ROW_H / 2;
      const x2 = succBar.left;
      const midX = Math.max(x1 + 8, x2 - 8);
      depLines.push(`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
    }
  }

  const todayX = x(today);
  const deadlineX = x(d(schedule.deadline));

  return {
    unit,
    colW,
    columns,
    gridWidth,
    bars,
    depLines,
    todayX: todayX >= 0 && todayX <= gridWidth ? todayX : null,
    deadlineX: deadlineX >= 0 && deadlineX <= gridWidth ? deadlineX : null,
  };
}
