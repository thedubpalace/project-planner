"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO, startOfWeek } from "date-fns";
import { api } from "@/lib/client";
import type { ProjectSchedule, ResourceLoad, ScheduledTask } from "@/lib/types";
import { businessDaysInclusive, toISO } from "@/lib/schedule";
import { buildDependencyPath } from "@/lib/ganttConnector";
import { groupTasks } from "@/lib/taskGroup";
import { Button, ProgressBar, SkillChip, StatusPill, fmtDate, taskPill, useToast } from "./ui";

const ROW_H = 32;
const HEADER_H = 20;
// Shared by the left pane's sticky "Task" header and the date-header row
// above the grid — they're two independently-scrolled panes with scrollTop
// copied 1:1 (see syncScroll), so their header heights must stay identical
// or rows visibly drift from their bars as soon as the user scrolls.
const PANE_HEADER_H = 32;
const DEFAULT_CAPACITY = 8;
// Press-vs-drag disambiguation: movement past this radius promotes a
// press into a drag; anything less resolves as a tap (open edit) on
// release, no matter how long the press was held.
const PRESS_MOVE_PX = 6;

function d(iso: string): Date {
  return parseISO(iso + "T00:00:00");
}

type DragMode = "move" | "resize-start" | "resize-end" | "actual-end";
interface DragState {
  taskId: number;
  mode: DragMode;
  startClientX: number;
  deltaDays: number;
  pointerId: number;
}
type Patch = { startDateOverride?: string; estimationHours?: number } | { actualEnd: string };
interface PendingCommit {
  taskId: number;
  taskName: string;
  patch: Patch;
}

export function Gantt({
  schedule,
  resources,
  onEditTask,
  onSchedule,
  onAddTask,
}: {
  schedule: ProjectSchedule;
  resources: ResourceLoad[];
  onEditTask: (t: ScheduledTask) => void;
  onSchedule: (s: ProjectSchedule) => void;
  onAddTask: () => void;
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ taskId: number; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressRef = useRef<{ taskId: number; mode: DragMode; startClientX: number; startClientY: number; pointerId: number } | null>(null);

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

  const mobileOrder = useMemo(() => groupTasks(tasks), [tasks]);
  const model = useMemo(() => buildModel(schedule), [schedule]);
  const unitDays = model.unit === "week" ? 7 : 1;
  const pxPerDay = model.colW / unitDays;

  const capacityFor = (t: ScheduledTask): number =>
    resources.find((r) => r.id === t.resourceId)?.capacityHoursPerDay ?? DEFAULT_CAPACITY;

  const applyPatch = async (task: ScheduledTask, patch: Patch) => {
    try {
      const res =
        "actualEnd" in patch
          ? await api.updateProgress(task.id, task.progress, task.status, patch.actualEnd)
          : await api.updateTask(task.id, patch);
      onSchedule(res.schedule);
      toast("Schedule updated", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const buildPatch = (task: ScheduledTask, mode: DragMode, deltaDays: number): Patch | null => {
    if (deltaDays === 0) return null;
    const capacity = capacityFor(task);
    const origStart = d(task.plannedStart);
    const origEnd = d(task.plannedEnd);
    if (mode === "actual-end") {
      const origActualEnd = task.actualEnd ? d(task.actualEnd) : origEnd;
      const newActualEnd = addDays(origActualEnd, deltaDays);
      if (newActualEnd < origStart) return null; // can't finish before it started
      return { actualEnd: toISO(newActualEnd) };
    }
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

  // Shared by both the pointer-drag release (onUp) and the keyboard nudge
  // path, so a committed edit behaves identically regardless of input method.
  const commitDrag = (taskId: number, mode: DragMode, deltaDays: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const patch = buildPatch(task, mode, deltaDays);
    if (!patch) return;
    if (task.status === "done" && mode !== "actual-end") {
      setPendingConfirm({ taskId: task.id, taskName: task.name, patch });
    } else {
      applyPatch(task, patch);
    }
  };

  // Arrow-key equivalent of a drag release, for handles with no pointer.
  // Left/Right = 1 day, Shift+Left/Right = 5 days.
  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLElement>, taskId: number, mode: DragMode) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    const deltaDays = e.key === "ArrowLeft" ? -step : step;
    commitDrag(taskId, mode, deltaDays);
  };

  // Pointer Events (not mouse-only) so the same handlers drive touch drags
  // on mobile too — touch-action: none on the handle elements themselves
  // stops the browser's pan/scroll gesture from hijacking the drag, while
  // the rest of the grid still scrolls normally by touch.
  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  // Hover is resolved from pointer coordinates against the same bar geometry
  // the bars are drawn from, rather than a DOM overlay — an overlay sitting
  // above the resize/move handles to catch hover would also steal their
  // pointerdown, breaking drag. Mouse-only: touch has no real "hover", and
  // the state churn (timers, setHover re-renders) during a touch's own
  // press-vs-drag window was interfering with tap-to-edit / drag on mobile.
  const onGridPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (drag) return;
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    const row = model.rows.find((r) => r.kind === "task" && ly >= r.top && ly < r.top + r.height);
    const b = row?.task ? model.bars.get(row.task.id) : undefined;
    const ext = b ? barExtent(b) : null;
    const targetId = ext && lx >= ext.left && lx <= ext.right ? row!.task!.id : null;
    if (targetId == null) {
      clearHoverTimer();
      setHover(null);
      return;
    }
    if (hover?.taskId === targetId) {
      setHover({ taskId: targetId, x: e.clientX, y: e.clientY });
      return;
    }
    clearHoverTimer();
    const clientX = e.clientX;
    const clientY = e.clientY;
    hoverTimerRef.current = setTimeout(() => setHover({ taskId: targetId, x: clientX, y: clientY }), 200);
  };

  const onGridPointerLeave = () => {
    clearHoverTimer();
    setHover(null);
  };

  const startActualDrag = (taskId: number, mode: DragMode, startClientX: number, pointerId: number) => {
    const state: DragState = { taskId, mode, startClientX, deltaDays: 0, pointerId };
    dragRef.current = state;
    setDrag(state);
    // Force the cursor for the whole drag — otherwise it reflects whatever
    // element the pointer happens to be over mid-drag instead of the
    // move/resize affordance, and can look "stuck" once released.
    document.body.style.cursor = mode === "move" ? "move" : "ew-resize";
    document.body.style.userSelect = "none";
  };

  const beginDrag = (e: React.PointerEvent<HTMLElement>, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    clearHoverTimer();
    setHover(null);
    const taskId = Number(e.currentTarget.dataset.taskId);
    // Every handle (move, both resize edges, actual-end) goes through the
    // same press-vs-drag disambiguation — on a short/narrow bar the resize
    // handles' 20px hit areas cover most of the visible width, so a plain
    // tap anywhere on a short task easily lands on one of them rather than
    // the move handle; without this they'd silently no-op instead of
    // opening the drawer.
    //
    // Promotion to an actual drag is movement-only, not time-based: an
    // earlier hold-timer version promoted to drag after a fixed delay even
    // with zero movement, and a normal human tap's finger-contact time
    // routinely exceeds that delay — every ordinary tap was silently
    // getting swallowed into a "drag that never moved" no-op instead of
    // opening the drawer. Holding still, for any length of time, must
    // always resolve as a tap on release.
    pressRef.current = { taskId, mode, startClientX: e.clientX, startClientY: e.clientY, pointerId: e.pointerId };
  };

  // Always-on (not gated by drag state, since the press phase precedes any
  // drag state existing) — resolves a pending press into either a tap
  // (open edit, on release with no promotion) or a promoted drag
  // (deliberate movement past the threshold), independent of the drag
  // effect below.
  useEffect(() => {
    const clearPress = () => {
      pressRef.current = null;
    };
    const onMove = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const dx = e.clientX - p.startClientX;
      const dy = e.clientY - p.startClientY;
      if (Math.hypot(dx, dy) > PRESS_MOVE_PX) {
        clearPress();
        startActualDrag(p.taskId, p.mode, e.clientX, e.pointerId);
      }
    };
    const onUp = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      clearPress();
      const task = tasks.find((t) => t.id === p.taskId);
      if (!task) return;
      // Defer past this tap's own event sequence — mobile browsers fire a
      // trailing synthetic "click" after pointerup, and if the drawer's
      // scrim already exists by then (opened synchronously here), that
      // trailing click lands right on it and immediately closes the drawer
      // via its click-outside-to-dismiss handler (looks like "flashes open
      // then vanishes"). Opening on the next tick lets that click resolve
      // against the old DOM (nothing there) before the drawer ever mounts.
      setTimeout(() => onEditTask(task), 0);
    };
    const onCancel = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      clearPress();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  useEffect(() => {
    if (!drag) return;
    const resetCursor = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    const onMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      // Ignore any pointer that isn't the one that started this drag — a
      // second simultaneous pointer (two-finger touch, stylus+finger) must
      // not hijack an in-flight drag's task/delta.
      if (!cur || e.pointerId !== cur.pointerId) return;
      const deltaPx = e.clientX - cur.startClientX;
      const deltaDays = Math.round(deltaPx / pxPerDay);
      if (deltaDays !== cur.deltaDays) {
        const next = { ...cur, deltaDays };
        dragRef.current = next;
        setDrag(next);
      }
    };
    const onUp = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      dragRef.current = null;
      setDrag(null);
      resetCursor();
      // The done-task confirm gate (inside commitDrag) is for retroactively
      // editing the PLAN of a finished task (surprising); dragging the
      // actual-completion handle is the direct, expected way to correct that
      // date, same as the Tasks tab's date input for it — no extra gate there.
      commitDrag(cur.taskId, cur.mode, cur.deltaDays);
    };
    // A touch drag can be interrupted by the OS/browser (e.g. an incoming
    // gesture) — pointercancel just abandons the drag without committing.
    const onCancel = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || e.pointerId !== cur.pointerId) return;
      dragRef.current = null;
      setDrag(null);
      resetCursor();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
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
        <div className="text-[12px] mb-1" style={{ color: "var(--text-muted)" }}>
          Add a task to see it on the timeline
        </div>
        <Button variant="primary" size="sm" onClick={onAddTask}>
          + Add Task
        </Button>
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
      {/* mobile fallback — the drag-to-edit Gantt needs more width than a
          phone screen has to stay usable, so small screens get a plain
          read/tap list instead (tap a row to open the edit drawer).
          Scrolls internally now (flex-1 min-h-0 overflow-y-auto) instead of
          growing the whole page — the outer page-level scroll + sticky
          project header was intermittently letting this list's own rows
          paint above the sticky header on some mobile browsers. */}
      <div className="sm:hidden flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-2">
        <div className="text-[12px] mb-1" style={{ color: "var(--text-muted)" }}>
          View full timeline on a larger screen
        </div>
        {mobileOrder.map(({ t, base, suffix }, idx) => {
          const prev = mobileOrder[idx - 1];
          const isNewGroup = !!suffix && (idx === 0 || prev.base !== base || !prev.suffix);
          return (
            <Fragment key={t.id}>
              {isNewGroup && (
                <div className="text-[10px] font-semibold uppercase tracking-[0.04em] px-1 pt-2" style={{ color: "var(--text-muted)" }}>
                  {base}
                </div>
              )}
              <div
                className="flex items-center justify-between rounded-md border px-3 py-2"
                style={{ borderColor: "var(--border-divider)", background: "var(--bg-surface)", marginLeft: suffix ? 12 : 0 }}
                onClick={() => onEditTask(t)}
              >
                <div className="flex flex-col">
                  <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                    {suffix ? suffix : t.name}
                  </span>
                  <span className="text-[11px] mono" style={{ color: "var(--text-muted)" }}>
                    {fmtDate(t.plannedStart, false)} – {fmtDate(t.effectiveEnd, false)} ·{" "}
                    {t.isUnassigned ? "Unassigned" : t.resourceName}
                  </span>
                </div>
                <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline)} />
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* desktop/tablet gantt — still Pointer Events underneath, so a touch
          screen wide enough to show it (tablet landscape, etc.) can still
          drag the bars, not just mouse users */}
      <Legend />
      <div className="hidden sm:flex flex-1 min-h-0" style={{ minHeight: 360 }}>
        {/* left pane */}
        <div
          ref={leftRef}
          onScroll={() => syncScroll("left")}
          className="shrink-0 overflow-y-auto"
          style={{ width: 260, borderRight: "1px solid var(--border-divider)" }}
        >
          <div className="sticky top-0 z-10 flex items-center px-3 text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ height: PANE_HEADER_H, background: "var(--bg-surface)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-divider)" }}>
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
                className={`flex items-center gap-2 cursor-pointer hover:bg-[var(--bg-surface-hi)] ${row.suffix ? "pl-6 pr-3" : "px-3"}`}
                style={{ height: ROW_H, borderBottom: "1px solid var(--border-divider)" }}
              >
                <span className="text-[13px] truncate flex-1" style={{ color: "var(--text-primary)" }}>
                  {row.suffix ? row.suffix : row.task!.name}
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
              style={{ height: PANE_HEADER_H, background: "var(--bg-surface)", borderBottom: "1px solid var(--border-divider)" }}
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
            <div
              ref={bodyRef}
              style={{ position: "relative", height: model.totalHeight }}
              onPointerMove={onGridPointerMove}
              onPointerLeave={onGridPointerLeave}
            >
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
                  } else if (drag!.mode === "resize-end") {
                    ghostWidth = Math.max(6, ghostWidth + dPx);
                  }
                }
                const isDraggingActualEnd = isDragging && drag!.mode === "actual-end";
                // While dragging the actual-completion handle, re-split live at the
                // plan boundary: shrinks the green (on-plan) segment if dragged
                // earlier than plannedEnd, grows the red overrun if dragged later.
                const planRight = b.left + b.plannedWidth;
                let fgWidth = b.fg?.width ?? 0;
                let overrunLeft = b.overrun?.left ?? planRight;
                let overrunWidth = b.overrun?.width ?? 0;
                if (isDraggingActualEnd && b.fg) {
                  const priorRight = b.fg.left + b.fg.width + overrunWidth;
                  const previewRight = priorRight + dPx;
                  fgWidth = Math.max(6, Math.min(previewRight, planRight) - b.fg.left);
                  overrunLeft = planRight;
                  overrunWidth = Math.max(0, previewRight - planRight);
                }
                return (
                  <div key={t.id} className="absolute" style={{ top: b.top, height: ROW_H, left: 0, right: 0 }}>
                    {/* planned ghost — draggable to move/resize the plan.
                        Also keyboard-focusable: arrow keys nudge the whole
                        plan a day at a time (Shift = 5 days) for anyone who
                        can't drag. */}
                    <div
                      data-task-id={t.id}
                      className="absolute rounded gantt-handle"
                      style={{
                        left: ghostLeft,
                        width: ghostWidth,
                        top: (ROW_H - 20) / 2,
                        height: 20,
                        background: "var(--gantt-bar-planned-bg)",
                        border: `1px dashed ${isDragging ? "var(--accent)" : "var(--gantt-bar-planned-border)"}`,
                        cursor: "move",
                        touchAction: "none",
                        zIndex: isDragging ? 8 : 1,
                      }}
                      onPointerDown={(e) => beginDrag(e, "move")}
                      tabIndex={0}
                      role="button"
                      aria-label={`Move ${t.name} — use arrow keys to shift by day`}
                      onKeyDown={(e) => onHandleKeyDown(e, t.id, "move")}
                    />
                    {/* resize handles — hit area wider than the visible edge
                        (touch targets need more than a few px to be reliable) */}
                    <div
                      data-task-id={t.id}
                      className="absolute"
                      style={{ left: ghostLeft - 9, width: 20, top: (ROW_H - 20) / 2, height: 20, cursor: "ew-resize", touchAction: "none", zIndex: 9 }}
                      onPointerDown={(e) => beginDrag(e, "resize-start")}
                    />
                    <div
                      data-task-id={t.id}
                      className="absolute"
                      style={{ left: ghostLeft + ghostWidth - 11, width: 20, top: (ROW_H - 20) / 2, height: 20, cursor: "ew-resize", touchAction: "none", zIndex: 9 }}
                      onPointerDown={(e) => beginDrag(e, "resize-end")}
                    />
                    {/* foreground */}
                    {b.fg && (
                      <div
                        className={`absolute rounded flex items-center px-1.5 bar-shift ${pulseIds.has(t.id) ? "bar-pulse" : ""}`}
                        style={{
                          left: b.fg.left,
                          width: fgWidth,
                          top: (ROW_H - 20) / 2,
                          height: 20,
                          background: b.fg.color,
                          outline: isDraggingActualEnd ? "2px solid var(--accent)" : b.ring ? "2px solid var(--gantt-critical-ring)" : undefined,
                          outlineOffset: b.ring || isDraggingActualEnd ? 1 : undefined,
                          zIndex: 6,
                          pointerEvents: "none",
                        }}
                        aria-label={b.aria}
                      >
                        {fgWidth >= 60 && (
                          <span className="mono text-[10px] truncate" style={{ color: "var(--text-on-accent)" }}>
                            {t.estimationHours}h
                          </span>
                        )}
                      </div>
                    )}
                    {/* overrun — the portion of a done task that ran past its own
                        original plannedEnd, split out in the late color instead of
                        tinting the whole bar red on any lateness */}
                    {overrunWidth > 0 && (
                      <div
                        className="absolute rounded"
                        style={{
                          left: overrunLeft,
                          width: overrunWidth,
                          top: (ROW_H - 20) / 2,
                          height: 20,
                          background: "var(--gantt-bar-late-bg)",
                          outline: isDraggingActualEnd ? "2px solid var(--accent)" : undefined,
                          outlineOffset: isDraggingActualEnd ? 1 : undefined,
                          zIndex: 6,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    {/* actual-completion handle — done tasks only; drags actualEnd
                        directly (the date that actually shifts dependents), not the plan.
                        When there's no overrun this lands on the exact same pixels as the
                        resize-end handle above (both sit at the plan's right edge) — nudge
                        it clear so both stay reachable instead of one silently winning. */}
                    {t.status === "done" && b.fg && (
                      <div
                        data-task-id={t.id}
                        className="absolute gantt-handle"
                        style={{
                          left: b.fg.left + fgWidth + overrunWidth - 11 + (overrunWidth === 0 ? 20 : 0),
                          width: 20,
                          top: (ROW_H - 20) / 2,
                          height: 20,
                          cursor: "ew-resize",
                          touchAction: "none",
                          zIndex: 9,
                        }}
                        onPointerDown={(e) => beginDrag(e, "actual-end")}
                        tabIndex={0}
                        role="button"
                        aria-label={`Change actual completion date of ${t.name} — use arrow keys`}
                        onKeyDown={(e) => onHandleKeyDown(e, t.id, "actual-end")}
                        title="Drag (or focus + arrow keys) to change the actual completion date"
                      />
                    )}
                    {/* forecast — own delay (tail past the plan) and cascaded shift now
                        share one visual: light amber wash + dashed border. One pattern
                        to learn instead of two (was hatch vs. outline). */}
                    {b.forecastOverrun && (
                      <div
                        className="absolute rounded"
                        style={{
                          left: b.forecastOverrun.left,
                          width: b.forecastOverrun.width,
                          top: (ROW_H - 20) / 2,
                          height: 20,
                          background: "var(--gantt-forecast-ghost-bg)",
                          border: "1.5px dashed var(--gantt-forecast-border)",
                          zIndex: 4,
                          pointerEvents: "none",
                        }}
                      />
                    )}
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
                      />
                    )}
                    {/* task name — the left pane's name column is always
                        visible too, but labeling the bar itself keeps the
                        name in view without eye travel back to the frozen
                        column when scanning a dense chart row by row.
                        Sits flush right after the bar normally; only steps
                        out past connectorClearX when this task's outgoing
                        connector jog genuinely reaches beyond the bar's own
                        edge (a wide overrun/forecast tail already clears the
                        jog on its own — a real connector's stub covered by
                        the bar itself shouldn't push the label out too). */}
                    <span
                      className="absolute text-[11px] truncate pointer-events-none"
                      style={{
                        left: Math.max(
                          ghostLeft + ghostWidth,
                          overrunLeft + overrunWidth,
                          b.forecastOverrun ? b.forecastOverrun.left + b.forecastOverrun.width : 0,
                          b.forecastGhost ? b.forecastGhost.left + b.forecastGhost.width : 0,
                          (model.connectorClearX.get(t.id) ?? 0) + 4,
                        ),
                        top: 0,
                        height: ROW_H,
                        lineHeight: `${ROW_H}px`,
                        maxWidth: 200,
                        padding: "0 3px 0 6px",
                        color: "var(--text-secondary)",
                        zIndex: 8,
                      }}
                    >
                      {row.suffix ?? t.name}
                    </span>
                    {/* aria for not-started (planned only) */}
                    {!b.fg && <span className="sr-only">{b.aria}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* hover tooltip — quick-glance task detail without opening the drawer */}
      {hover &&
        (() => {
          const t = tasks.find((x) => x.id === hover.taskId);
          return t ? <GanttTooltip task={t} x={hover.x} y={hover.y} /> : null;
        })()}

      {/* confirm dialog — dragging a task that's already marked done */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--scrim-modal)" }}
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
                  const task = tasks.find((t) => t.id === pendingConfirm.taskId);
                  if (task) applyPatch(task, pendingConfirm.patch);
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

function Swatch({ style }: { style: React.CSSProperties }) {
  return <span className="inline-block shrink-0 rounded-[2px]" style={{ width: 14, height: 10, ...style }} />;
}

function Legend() {
  return (
    <div
      // mt-2: the sticky header's composited/stuck box and its flex-flow
      // height (h-[calc(100dvh-var(--nav-h))] on the root — dvh doesn't
      // always resolve to a whole pixel) can drift a few px apart, leaving
      // this row's top edge painted under the sticky block and clipping
      // letter ascenders — a buffer clears it regardless of the exact drift.
      className="hidden sm:flex shrink-0 items-center flex-wrap gap-x-4 gap-y-1 px-3 py-1.5 mt-2 text-[10px]"
      style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-divider)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ border: "1px dashed var(--gantt-bar-planned-border)", background: "var(--gantt-bar-planned-bg)" }} />
        Planned
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ background: "var(--accent)" }} />
        In progress
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ background: "var(--gantt-bar-done-bg)" }} />
        Done
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ background: "var(--gantt-bar-late-bg)" }} />
        Over deadline
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch style={{ border: "1.5px dashed var(--gantt-forecast-border)", background: "var(--gantt-forecast-ghost-bg)" }} />
        Forecast
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block" style={{ width: 2, height: 12, background: "var(--gantt-today-line)" }} />
        Today
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block" style={{ width: 0, height: 12, borderLeft: "2px dashed var(--gantt-deadline-line)" }} />
        Deadline
      </span>
    </div>
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

function GanttTooltip({ task: t, x, y }: { task: ScheduledTask; x: number; y: number }) {
  const above = y > 240;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const left = Math.min(Math.max(x, 132), vw - 132);
  return (
    <div
      className="fixed fade-in"
      style={{
        left,
        top: above ? y - 16 : y + 20,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        // Below the navbar (z-30) and the project-header sticky block
        // (z-20) — this is `position: fixed`, so it competes in the root
        // stacking context same as those, not scoped to the Gantt pane; at
        // z-40 it would paint over the topbar if hover ever engages.
        zIndex: 15,
        pointerEvents: "none",
        width: 248,
      }}
    >
      <div
        className="rounded-lg border p-3 flex flex-col gap-2"
        style={{ background: "var(--bg-modal)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-card)" }}
      >
        {t.groupName && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.03em]" style={{ color: "var(--text-muted)" }}>
            {t.groupName}
          </span>
        )}
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
            {t.name}
          </span>
          <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline, t.behindPace)} />
        </div>
        <div className="text-[11px] mono" style={{ color: "var(--text-secondary)" }}>
          {fmtDate(t.plannedStart, false)} – {fmtDate(t.effectiveEnd, false)} · {t.durationDays}d
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {t.isUnassigned ? (
            <span className="text-[11px]" style={{ color: "var(--status-danger-text)" }}>
              ⚠ Unassigned
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {t.resourceName}
            </span>
          )}
          {t.skills.map((s) => (
            <SkillChip key={s} tag={s} />
          ))}
        </div>
        <ProgressBar pct={t.progress} width={140} />
        {t.forecastEnd && (
          <div className="text-[11px] mono" style={{ color: "var(--gantt-forecast-border)" }}>
            Forecast: {fmtDate(t.forecastStart, false)} – {fmtDate(t.forecastEnd, false)}
          </div>
        )}
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {t.status === "done" ? "Drag handle to adjust actual completion" : "Drag to move · drag edges to resize"}
        </div>
      </div>
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
  overrun: { left: number; width: number } | null; // done tasks only: ran past the original plannedEnd
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
  suffix: string | null;
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
  connectorClearX: Map<number, number>; // task id -> rightmost x its outgoing connector's jog reaches
  todayX: number | null;
  deadlineX: number | null;
  totalHeight: number;
}

// Full pixel span a bar visually occupies, including any overrun/forecast
// tails that extend past the planned width — used for hover hit-testing.
function barExtent(b: Bar): { left: number; right: number } {
  let left = b.left;
  let right = b.left + b.plannedWidth;
  if (b.overrun) right = Math.max(right, b.overrun.left + b.overrun.width);
  if (b.forecastOverrun) right = Math.max(right, b.forecastOverrun.left + b.forecastOverrun.width);
  if (b.forecastGhost) {
    left = Math.min(left, b.forecastGhost.left);
    right = Math.max(right, b.forecastGhost.left + b.forecastGhost.width);
  }
  return { left, right };
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
      rows.push({ kind: "group", top: y, height: HEADER_H, base, suffix: null });
      y += HEADER_H;
    }
    lastBase = suffix ? base : "";
    rows.push({ kind: "task", top: y, height: ROW_H, base, suffix, task: t });
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
    let overrun: Bar["overrun"] = null;
    if (t.status === "done") {
      // Split the done bar at the task's own plannedEnd instead of coloring
      // the whole thing red on any lateness: green up to the original plan,
      // red only for the portion that actually ran past it.
      const actualRight = x(addDays(d(t.effectiveEnd), 1));
      const onPlanRight = Math.min(actualRight, plannedRight);
      fg = {
        left,
        width: Math.max(6, onPlanRight - left),
        color: "var(--gantt-bar-done-bg)",
      };
      if (actualRight > plannedRight) {
        overrun = { left: plannedRight, width: Math.max(4, actualRight - plannedRight) };
      }
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

    bars.set(t.id, { top: row.top, left, plannedWidth, fg, overrun, ring: t.overDeadline, aria, forecastOverrun, forecastGhost });
  }

  // How far right each predecessor's outgoing connector actually reaches
  // before it turns (buildDependencyPath's 8px jog) — the name label only
  // needs to step around it when that reach extends past the label's own
  // anchor; a predecessor with a wide overrun/forecast tail already clears
  // the jog on its own; a short/on-time bar doesn't.
  const connectorClearX = new Map<number, number>();
  const noteConnectorClear = (id: number, x1: number) => {
    const clear = x1 + 8;
    if ((connectorClearX.get(id) ?? -Infinity) < clear) connectorClearX.set(id, clear);
  };

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
      noteConnectorClear(depId, x1);
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
      noteConnectorClear(depId, predForecastRight);
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
    connectorClearX,
    todayX: todayX >= 0 && todayX <= gridWidth ? todayX : null,
    deadlineX: deadlineX >= 0 && deadlineX <= gridWidth ? deadlineX : null,
    totalHeight,
  };
}
