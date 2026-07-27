"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO, startOfWeek } from "date-fns";
import { api } from "@/lib/client";
import type { ProjectSchedule, ResourceLoad, ScheduledTask } from "@/lib/types";
import { businessDaysInclusive, toISO } from "@/lib/schedule";
import { buildDependencyPath } from "@/lib/ganttConnector";
import { groupTasks } from "@/lib/taskGroup";
import { Button, StatusPill, fmtDate, taskPill, useToast } from "./ui";

const ROW_H = 36;
const HEADER_H = 24;
const DEFAULT_CAPACITY = 8;

function d(iso: string): Date {
  return parseISO(iso + "T00:00:00");
}

type DragMode = "move" | "resize-start" | "resize-end";
interface DragState {
  taskId: number;
  mode: DragMode;
  startClientX: number;
  deltaDays: number;
}
interface PendingCommit {
  taskId: number;
  taskName: string;
  patch: { startDateOverride?: string; estimationHours?: number };
}

export function Gantt({
  schedule,
  resources,
  onEditTask,
  onSchedule,
}: {
  schedule: ProjectSchedule;
  resources: ResourceLoad[];
  onEditTask: (t: ScheduledTask) => void;
  onSchedule: (s: ProjectSchedule) => void;
}) {
  const toast = useToast();
  const tasks = schedule.tasks;
  const leftRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [pulseIds, setPulseIds] = useState<Set<number>>(new Set());
  const prevPos = useRef<Map<number, string>>(new Map());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingCommit | null>(null);
  const dragRef = useRef<DragState | null>(null);

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
  const mobileOrder = useMemo(() => groupTasks(tasks).map((g) => g.t), [tasks]);
  const unitDays = model.unit === "week" ? 7 : 1;
  const pxPerDay = model.colW / unitDays;

  const capacityFor = (t: ScheduledTask): number =>
    resources.find((r) => r.id === t.resourceId)?.capacityHoursPerDay ?? DEFAULT_CAPACITY;

  const applyPatch = async (taskId: number, patch: PendingCommit["patch"]) => {
    try {
      const res = await api.updateTask(taskId, patch);
      onSchedule(res.schedule);
      toast("Schedule updated", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const buildPatch = (task: ScheduledTask, mode: DragMode, deltaDays: number): PendingCommit["patch"] | null => {
    if (deltaDays === 0) return null;
    const capacity = capacityFor(task);
    const origStart = d(task.plannedStart);
    const origEnd = d(task.plannedEnd);
    if (mode === "move") {
      return { startDateOverride: toISO(addDays(origStart, deltaDays)) };
    }
    if (mode === "resize-start") {
      const newStart = addDays(origStart, deltaDays);
      if (newStart >= origEnd) return null; // can't drag start past the end
      const dur = businessDaysInclusive(newStart, origEnd);
      return { startDateOverride: toISO(newStart), estimationHours: dur * capacity };
    }
    // resize-end
    const newEnd = addDays(origEnd, deltaDays);
    if (newEnd < origStart) return null;
    const dur = Math.max(1, businessDaysInclusive(origStart, newEnd));
    return { estimationHours: dur * capacity };
  };

  const beginDrag = (e: React.MouseEvent<HTMLElement>, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = Number(e.currentTarget.dataset.taskId);
    const state: DragState = { taskId, mode, startClientX: e.clientX, deltaDays: 0 };
    dragRef.current = state;
    setDrag(state);
    // Force the cursor for the whole drag — otherwise it reflects whatever
    // element the pointer happens to be over mid-drag instead of the
    // move/resize affordance, and can look "stuck" once released.
    document.body.style.cursor = mode === "move" ? "move" : "ew-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (!drag) return;
    const resetCursor = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    const onMove = (e: MouseEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const deltaPx = e.clientX - cur.startClientX;
      const deltaDays = Math.round(deltaPx / pxPerDay);
      if (deltaDays !== cur.deltaDays) {
        const next = { ...cur, deltaDays };
        dragRef.current = next;
        setDrag(next);
      }
    };
    const onUp = () => {
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      resetCursor();
      if (!cur) return;
      const task = tasks.find((t) => t.id === cur.taskId);
      if (!task) return;
      const patch = buildPatch(task, cur.mode, cur.deltaDays);
      if (!patch) return;
      if (task.status === "done") {
        setPendingConfirm({ taskId: task.id, taskName: task.name, patch });
      } else {
        applyPatch(task.id, patch);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resetCursor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag != null, pxPerDay]);

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
        {mobileOrder.map((t) => (
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
          {model.rows.map((row) =>
            row.kind === "group" ? (
              <div
                key={`g${row.base}`}
                className="flex items-center px-3 text-[10px] font-semibold uppercase tracking-[0.03em]"
                style={{ height: HEADER_H, background: "var(--bg-surface-hi)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-divider)" }}
              >
                <span className="truncate">{row.base}</span>
              </div>
            ) : (
              <div
                key={row.task!.id}
                onClick={() => onEditTask(row.task!)}
                className="flex items-center gap-2 px-3 cursor-pointer hover:bg-[var(--bg-surface-hi)]"
                style={{ height: ROW_H, borderBottom: "1px solid var(--border-divider)" }}
              >
                <span className="text-[13px] truncate flex-1" style={{ color: "var(--text-primary)" }}>
                  {row.task!.name}
                </span>
                {row.task!.forecastEnd && (
                  <span
                    className="text-[9px] mono whitespace-nowrap"
                    style={{ color: "var(--gantt-forecast-border)" }}
                    title={`Forecast finish at current pace: ${fmtDate(row.task!.forecastEnd)}`}
                  >
                    → {fmtDate(row.task!.forecastEnd, false)}
                  </span>
                )}
                {row.task!.isUnassigned ? (
                  <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--status-danger-text)" }}>
                    ⚠ Unassigned
                  </span>
                ) : (
                  <Initials name={row.task!.resourceName ?? ""} />
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
                    key={`gb${row.base}`}
                    className="absolute left-0 right-0"
                    style={{ top: row.top, height: row.height, background: "var(--bg-surface-hi)", borderBottom: "1px solid var(--border-divider)" }}
                  />
                ) : null,
              )}

              {/* today + deadline markers */}
              {model.todayX != null && (
                <Marker x={model.todayX} height={model.totalHeight} color="var(--gantt-today-line)" label="Today" labelColor="var(--accent-text)" />
              )}
              {model.deadlineX != null && (
                <Marker x={model.deadlineX} height={model.totalHeight} color="var(--gantt-deadline-line)" label="Deadline" labelColor="var(--status-danger-text)" dashed />
              )}

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
                const isDragging = drag?.taskId === t.id;
                const dPx = isDragging ? drag!.deltaDays * pxPerDay : 0;
                let ghostLeft = b.left;
                let ghostWidth = b.plannedWidth;
                if (isDragging) {
                  if (drag!.mode === "move") ghostLeft += dPx;
                  else if (drag!.mode === "resize-start") {
                    ghostLeft += dPx;
                    ghostWidth = Math.max(6, ghostWidth - dPx);
                  } else {
                    ghostWidth = Math.max(6, ghostWidth + dPx);
                  }
                }
                return (
                  <div key={t.id} className="absolute" style={{ top: b.top, height: ROW_H, left: 0, right: 0 }}>
                    {/* planned ghost — draggable to move/resize the plan */}
                    <div
                      data-task-id={t.id}
                      className="absolute rounded"
                      style={{
                        left: ghostLeft,
                        width: ghostWidth,
                        top: (ROW_H - 20) / 2,
                        height: 20,
                        background: "var(--gantt-bar-planned-bg)",
                        border: `1px dashed ${isDragging ? "var(--accent)" : "var(--gantt-bar-planned-border)"}`,
                        cursor: "move",
                        zIndex: isDragging ? 8 : 1,
                      }}
                      onMouseDown={(e) => beginDrag(e, "move")}
                      title="Drag to move — drag the edges to resize"
                    />
                    {/* resize handles */}
                    <div
                      data-task-id={t.id}
                      className="absolute"
                      style={{ left: ghostLeft - 3, width: 8, top: (ROW_H - 20) / 2, height: 20, cursor: "ew-resize", zIndex: 9 }}
                      onMouseDown={(e) => beginDrag(e, "resize-start")}
                    />
                    <div
                      data-task-id={t.id}
                      className="absolute"
                      style={{ left: ghostLeft + ghostWidth - 5, width: 8, top: (ROW_H - 20) / 2, height: 20, cursor: "ew-resize", zIndex: 9 }}
                      onMouseDown={(e) => beginDrag(e, "resize-end")}
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
                          pointerEvents: "none",
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
                    {/* forecast overrun (own delay) — hatched tail past the plan */}
                    {b.forecastOverrun && (
                      <div
                        className="absolute rounded"
                        style={{
                          left: b.forecastOverrun.left,
                          width: b.forecastOverrun.width,
                          top: (ROW_H - 20) / 2,
                          height: 20,
                          background: "var(--gantt-forecast-bg)",
                          backgroundImage:
                            "repeating-linear-gradient(45deg, var(--gantt-forecast-stripe) 0, var(--gantt-forecast-stripe) 1.5px, transparent 1.5px, transparent 9px)",
                          border: "1px solid var(--gantt-forecast-border)",
                          zIndex: 4,
                          pointerEvents: "none",
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
                          top: (ROW_H - 20) / 2,
                          height: 20,
                          background: "var(--gantt-forecast-ghost-bg)",
                          border: "1.5px dashed var(--gantt-forecast-border)",
                          zIndex: 4,
                          pointerEvents: "none",
                        }}
                        title={`Forecast shift: ${fmtDate(t.forecastStart, false)} – ${fmtDate(t.forecastEnd, false)}`}
                      />
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

      {/* confirm dialog — dragging a task that's already marked done */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "oklch(0% 0 0 / 55%)" }}
          onClick={() => setPendingConfirm(null)}
        >
          <div
            className="scale-in rounded-[10px] border p-5 max-w-[420px]"
            style={{ background: "var(--bg-modal)", borderColor: "var(--status-danger-border)", boxShadow: "var(--shadow-modal)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[14px] mb-2" style={{ color: "var(--text-primary)" }}>
              &quot;{pendingConfirm.taskName}&quot; is already marked done.
            </div>
            <div className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
              Adjust its planned dates anyway? This only changes the plan — it won&apos;t reopen the task or affect its actual completion date.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  applyPatch(pendingConfirm.taskId, pendingConfirm.patch);
                  setPendingConfirm(null);
                }}
              >
                Adjust anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Marker({ x, height, color, label, labelColor, dashed }: { x: number; height: number; color: string; label: string; labelColor: string; dashed?: boolean }) {
  return (
    <div className="absolute top-0 pointer-events-none" style={{ left: x, height, zIndex: 7 }}>
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
  top: number;
  left: number;
  plannedWidth: number;
  fg: { left: number; width: number; color: string } | null;
  ring: boolean;
  aria: string;
  forecastOverrun: { left: number; width: number } | null; // hatched tail past the plan, own delay
  forecastGhost: { left: number; width: number } | null; // shifted preview, cascaded from a predecessor
}
interface Row {
  kind: "group" | "task";
  top: number;
  height: number;
  base: string;
  task?: ScheduledTask;
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
  deadlineX: number | null;
  totalHeight: number;
}

function buildModel(schedule: ProjectSchedule): Model {
  const tasks = schedule.tasks;
  const dates: Date[] = [];
  for (const t of tasks) {
    dates.push(d(t.plannedStart), d(t.plannedEnd), d(t.effectiveEnd));
    if (t.forecastEnd) dates.push(d(t.forecastEnd));
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

  // rows: group header + tasks, clustering "Process [Role]"-named tasks
  const rows: Row[] = [];
  const grouped = groupTasks(tasks);
  let y = 0;
  let lastBase = "";
  for (const { t, base, suffix } of grouped) {
    const isNewGroup = !!suffix && base !== lastBase;
    if (isNewGroup) {
      rows.push({ kind: "group", top: y, height: HEADER_H, base });
      y += HEADER_H;
    }
    lastBase = suffix ? base : "";
    rows.push({ kind: "task", top: y, height: ROW_H, base, task: t });
    y += ROW_H;
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
        // own delay: hatched tail continuing on from where the plan ends
        forecastOverrun = { left: plannedRight, width: Math.max(4, forecastRight - plannedRight) };
      } else {
        // cascaded from a delayed predecessor: whole bar previewed elsewhere
        const forecastLeft = x(d(t.forecastStart!));
        forecastGhost = { left: forecastLeft, width: Math.max(6, forecastRight - forecastLeft) };
      }
    }

    bars.set(t.id, { top: row.top, left, plannedWidth, fg, ring: t.overDeadline, aria, forecastOverrun, forecastGhost });
  }

  // dependency elbow lines
  const depLines: string[] = [];
  for (const t of tasks) {
    const succBar = bars.get(t.id);
    if (!succBar) continue;
    const y2 = succBar.top + ROW_H / 2;
    for (const depId of t.dependsOn) {
      const predBar = bars.get(depId);
      if (!predBar) continue;
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
  for (const t of tasks) {
    const succBar = bars.get(t.id);
    if (!succBar) continue;
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
        ? succBar.forecastGhost.left // cascaded: whole bar previewed elsewhere
        : succBar.forecastOverrun
          ? succBar.left + succBar.plannedWidth // own delay: land where its own hatch starts
          : succBar.left; // no forecast at all: land on its planned bar
      const y1 = predBar.top + ROW_H / 2;
      forecastDepLines.push(buildDependencyPath(predForecastRight, y1, succForecastLeft, y2));
    }
  }

  const todayX = x(today);
  const deadlineX = x(d(schedule.deadline));

  return {
    unit,
    colW,
    columns,
    gridWidth,
    rows,
    bars,
    depLines,
    forecastDepLines,
    todayX: todayX >= 0 && todayX <= gridWidth ? todayX : null,
    deadlineX: deadlineX >= 0 && deadlineX <= gridWidth ? deadlineX : null,
    totalHeight,
  };
}
