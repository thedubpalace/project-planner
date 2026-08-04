"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { ProjectSchedule, ScheduledTask, TaskGroup } from "@/lib/types";
import { groupTasks } from "@/lib/taskGroup";
import {
  Button,
  SkillChip,
  StatusPill,
  fmtShifted,
  taskPill,
  useToast,
} from "./ui";

const STEPS = [0, 25, 50, 75, 100];

export function TaskTable({
  schedule,
  onEdit,
  onSchedule,
  onGroupsChange,
  onAddTask,
}: {
  schedule: ProjectSchedule;
  onEdit: (t: ScheduledTask) => void;
  onSchedule: (s: ProjectSchedule) => void;
  onGroupsChange: (groups: TaskGroup[]) => void;
  onAddTask: () => void;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<string | null>(null);
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [confirm, setConfirm] = useState<{ task: ScheduledTask; deps: { id: number; name: string }[] } | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const tasks = schedule.tasks;
  const allSkills = [...new Set(tasks.flatMap((t) => t.skills))];
  const isAtRisk = (t: ScheduledTask) => t.overDeadline || t.behindPace || t.isUnassigned;
  const atRiskCount = tasks.filter(isAtRisk).length;
  const shown = tasks
    .filter((t) => !filter || t.skills.includes(filter))
    .filter((t) => !atRiskOnly || isAtRisk(t));

  // Cluster same-group tasks together; groups themselves stay in the manual
  // order set by drag/reorder-buttons.
  const grouped = useMemo(() => groupTasks(shown), [shown]);

  // Drag/reorder-button unit = one whole group cluster (moved by its own
  // task_groups.sort_order, independent of member tasks) or one standalone
  // task (moved by its own sort_order). Units are contiguous runs of
  // `grouped` sharing the same non-null groupId; every groupId-null item is
  // always its own unit (never merged with an adjacent standalone task).
  const units = useMemo(() => {
    const arr: { groupId: number | null; base: string; order: number; items: typeof grouped }[] = [];
    for (const g of grouped) {
      const last = arr[arr.length - 1];
      if (g.groupId != null && last && last.groupId === g.groupId) {
        last.items.push(g);
      } else {
        const order = g.groupId != null ? g.t.groupSortOrder ?? g.groupId : g.t.sortOrder ?? g.t.id;
        arr.push({ groupId: g.groupId, base: g.base, order, items: [g] });
      }
    }
    return arr;
  }, [grouped]);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ idx: number; edge: "top" | "bottom" } | null>(null);
  // Separate drag channel for moving one task at a time — within its group,
  // across into a different group, onto a group header (append), or out to
  // standalone (drop near any standalone row).
  const [taskDragId, setTaskDragId] = useState<number | null>(null);
  const [taskDropAt, setTaskDropAt] = useState<{ taskId: number; edge: "top" | "bottom" } | { groupId: number } | null>(null);

  const orderBetween = (before: number | null, after: number | null): number => {
    if (before == null && after == null) return 1;
    if (before == null) return after! - 1;
    if (after == null) return before + 1;
    return (before + after) / 2;
  };

  // Whole-unit move: groups reorder via their own task_groups.sort_order
  // (never touching member tasks' sort_order, which only matters for order
  // *within* that group); standalone tasks reorder via their own sort_order,
  // same as before groups existed.
  const moveUnit = async (fromIdx: number, targetIdx: number, edge: "top" | "bottom") => {
    const dropIdx = edge === "top" ? targetIdx : targetIdx + 1;
    if (dropIdx === fromIdx || dropIdx === fromIdx + 1) return; // dropped back onto its own slot — no-op
    const orderVals = units.map((u) => u.order);
    const remaining = orderVals.filter((_, i) => i !== fromIdx);
    const adjDrop = dropIdx > fromIdx ? dropIdx - 1 : dropIdx;
    const before = adjDrop > 0 ? remaining[adjDrop - 1] : null;
    const after = adjDrop < remaining.length ? remaining[adjDrop] : null;
    const newOrder = orderBetween(before, after);

    const dragged = units[fromIdx];
    try {
      if (dragged.groupId != null) {
        const res = await api.reorderGroup(dragged.groupId, newOrder);
        onSchedule(res.schedule);
        onGroupsChange(res.groups);
      } else {
        const res = await api.reorderTask(dragged.items[0].t.id, newOrder, null);
        onSchedule(res.schedule);
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const handleDrop = (targetIdx: number, edge: "top" | "bottom") => {
    setDropAt(null);
    if (dragIdx === null) return;
    const from = dragIdx;
    setDragIdx(null);
    moveUnit(from, targetIdx, edge);
  };

  // Single-task move: joins whichever group the drop target belongs to (or
  // stays/becomes standalone if the target has no group), positioned right
  // at that target's edge among its siblings.
  const moveTaskTo = async (taskId: number, targetGroupId: number | null, targetTaskId: number | null, edge: "top" | "bottom") => {
    const siblings = tasks
      .filter((x) => x.groupId === targetGroupId && x.id !== taskId)
      .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    let before: number | null = null;
    let after: number | null = null;
    if (targetTaskId == null) {
      // dropped on the group header — append to the end of that group
      const last = siblings[siblings.length - 1];
      before = last ? last.sortOrder ?? last.id : null;
    } else {
      const idx = siblings.findIndex((x) => x.id === targetTaskId);
      const insertAt = edge === "top" ? idx : idx + 1;
      before = insertAt > 0 ? siblings[insertAt - 1].sortOrder ?? siblings[insertAt - 1].id : null;
      after = insertAt < siblings.length ? siblings[insertAt].sortOrder ?? siblings[insertAt].id : null;
    }
    const newOrder = orderBetween(before, after);
    try {
      const res = await api.reorderTask(taskId, newOrder, targetGroupId);
      onSchedule(res.schedule);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const handleTaskDrop = () => {
    const drop = taskDropAt;
    setTaskDropAt(null);
    if (taskDragId == null || !drop) return;
    const id = taskDragId;
    setTaskDragId(null);
    if ("groupId" in drop) moveTaskTo(id, drop.groupId, null, "top");
    else {
      const target = tasks.find((x) => x.id === drop.taskId);
      if (target && target.id !== id) moveTaskTo(id, target.groupId, target.id, drop.edge);
    }
  };

  const startRenameGroup = (g: { id: number; base: string }) => {
    setRenamingGroupId(g.id);
    setRenameValue(g.base);
  };
  const commitRenameGroup = async () => {
    const id = renamingGroupId;
    const name = renameValue.trim();
    setRenamingGroupId(null);
    if (id == null || !name) return;
    try {
      const res = await api.renameGroup(id, name);
      onSchedule(res.schedule);
      onGroupsChange(res.groups);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const setProgress = async (t: ScheduledTask, pct: number) => {
    try {
      const res = await api.updateProgress(t.id, pct);
      onSchedule(res.schedule);
      if (res.shifted.length > 0) {
        const tail = res.breached ? " — deadline exceeded" : res.atRisk ? " — 1 now at risk" : "";
        toast(`Shifted: ${fmtShifted(res.shifted.map((s) => s.name))}${tail}`, res.breached ? "error" : "info");
      } else {
        toast("Progress updated", "success");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const setActualEnd = async (t: ScheduledTask, actualEnd: string) => {
    try {
      const res = await api.updateProgress(t.id, t.progress, t.status, actualEnd);
      onSchedule(res.schedule);
      toast(
        res.shifted.length > 0
          ? `Completion date updated — shifted: ${fmtShifted(res.shifted.map((s) => s.name))}`
          : "Completion date updated",
        "success",
      );
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const del = async (t: ScheduledTask, force = false) => {
    try {
      const res = await api.deleteTask(t.id, force);
      onSchedule(res.schedule);
      setConfirm(null);
      toast("Task deleted", "success");
    } catch (e) {
      const err = e as Error & { status?: number; data?: { dependents?: { id: number; name: string }[] } };
      if (err.status === 409 && err.data?.dependents) {
        setConfirm({ task: t, deps: err.data.dependents });
      } else {
        toast(err.message, "error");
      }
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="py-4">
        <Toolbar onAddTask={onAddTask} skills={[]} filter={null} setFilter={setFilter} atRiskOnly={atRiskOnly} setAtRiskOnly={setAtRiskOnly} atRiskCount={0} />
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            No tasks yet
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Add a task to start building the plan
          </div>
          <Button variant="primary" size="sm" onClick={onAddTask}>
            + Add Task
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4">
      <Toolbar
        onAddTask={onAddTask}
        skills={allSkills}
        filter={filter}
        setFilter={setFilter}
        atRiskOnly={atRiskOnly}
        setAtRiskOnly={setAtRiskOnly}
        atRiskCount={atRiskCount}
      />
      {/* mobile cards — the desktop table needs more width than a phone has
          to stay legible even scrolled; drag-reorder and deps are desktop
          table only (drag needs HTML5 dnd, deps aren't the mobile priority) */}
      <div className="flex flex-col gap-3 md:hidden">
        {units.map((unit) => (
          <Fragment key={`m${unit.items[0].t.id}`}>
            {unit.items[0].suffix && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] px-1 pt-2" style={{ color: "var(--text-muted)" }}>
                {unit.base}
              </div>
            )}
            {unit.items.map(({ t, suffix }) => (
              <div
                key={t.id}
                className="rounded-md border p-3 flex flex-col gap-2.5"
                style={{ borderColor: "var(--border-divider)", background: "var(--bg-surface)", boxShadow: "var(--shadow-card)", marginLeft: suffix ? 12 : 0 }}
              >
                <div className="flex items-start justify-between gap-2 -mb-0.5">
                  <button
                    className="text-left text-[13px] cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => onEdit(t)}
                  >
                    {suffix ? suffix : t.name}
                  </button>
                  <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline, t.behindPace)} />
                </div>
                {t.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.skills.slice(0, 3).map((s) => (
                      <SkillChip key={s} tag={s} />
                    ))}
                    {t.skills.length > 3 && (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        +{t.skills.length - 3}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {t.isUnassigned ? (
                    <button className="cursor-pointer" style={{ color: "var(--status-danger-text)" }} onClick={() => onEdit(t)}>
                      ⚠ Assign
                    </button>
                  ) : (
                    <span>{t.resourceName}</span>
                  )}
                  <span className="mono">{t.estimationHours}h</span>
                </div>
                <ProgressSlider value={t.progress} onCommit={(p) => setProgress(t, p)} width={140} />
                {t.status === "done" && (
                  <input
                    type="date"
                    value={t.actualEnd ?? ""}
                    onChange={(e) => e.target.value && setActualEnd(t, e.target.value)}
                    style={{ height: 28 }}
                    title="Actual completion date — editable, since this is what shifts dependent tasks"
                  />
                )}
                <div className="flex justify-end gap-2 mt-1 -mb-1 -mr-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(t)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => del(t)}>
                    <span style={{ color: "var(--status-danger-text)" }}>Delete</span>
                  </Button>
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>

      <div className="hidden md:block rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border-default)", boxShadow: "var(--shadow-card)" }}>
        <table className="w-full border-collapse min-w-[820px]">
          <thead>
            <tr style={{ background: "var(--bg-surface)" }}>
              {["Task", "Skills", "Est.", "Resource", "Progress", "Status", "Deps", ""].map((h) => (
                <th
                  key={h}
                  className="px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-[0.04em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map((unit, uIdx) => {
              const isDragging = dragIdx === uIdx;
              const dropTop = dropAt?.idx === uIdx && dropAt.edge === "top";
              const dropBottom = dropAt?.idx === uIdx && dropAt.edge === "bottom";
              const dropBorderStyle: React.CSSProperties = {
                ...(dropTop ? { boxShadow: "inset 0 2px 0 var(--accent)" } : {}),
                ...(dropBottom ? { boxShadow: "inset 0 -2px 0 var(--accent)" } : {}),
              };
              // Group header: draggable as a whole unit, AND a drop target
              // for an individual task being dragged in from elsewhere.
              const headerDragProps = {
                onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
                  if (taskDragId != null) {
                    if (unit.groupId != null) setTaskDropAt({ groupId: unit.groupId });
                    return;
                  }
                  if (dragIdx === null) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const edge: "top" | "bottom" = e.clientY - rect.top < rect.height / 2 ? "top" : "bottom";
                  setDropAt({ idx: uIdx, edge });
                },
                onDragLeave: () => {
                  setDropAt((d) => (d?.idx === uIdx ? null : d));
                  setTaskDropAt((d) => (d && "groupId" in d && d.groupId === unit.groupId ? null : d));
                },
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  if (taskDragId != null) {
                    handleTaskDrop();
                    return;
                  }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const edge: "top" | "bottom" = e.clientY - rect.top < rect.height / 2 ? "top" : "bottom";
                  handleDrop(uIdx, edge);
                },
              };
              const groupDropActive = taskDropAt != null && "groupId" in taskDropAt && taskDropAt.groupId === unit.groupId;
              const handle = (
                <span
                  draggable
                  onDragStart={() => setDragIdx(uIdx)}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDropAt(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block mr-2 cursor-grab active:cursor-grabbing select-none"
                  style={{ color: "var(--text-muted)" }}
                  title="Drag to reorder"
                >
                  ⠿
                </span>
              );
              return (
                <Fragment key={unit.items[0].t.id}>
                  {unit.groupId != null && (
                    <tr
                      {...headerDragProps}
                      style={{ opacity: isDragging ? 0.4 : 1, ...dropBorderStyle, ...(groupDropActive ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : {}) }}
                    >
                      <td
                        colSpan={8}
                        className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.03em]"
                        style={{ color: "var(--text-muted)", background: "var(--bg-surface-hi)" }}
                      >
                        <span className="inline-flex items-center gap-1">
                          {handle}
                          {renamingGroupId === unit.groupId ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={commitRenameGroup}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRenameGroup();
                                if (e.key === "Escape") setRenamingGroupId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="!h-5 !py-0 !text-[10px] !w-40"
                            />
                          ) : (
                            <button
                              className="cursor-pointer hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                startRenameGroup({ id: unit.groupId!, base: unit.base });
                              }}
                              title="Rename group"
                            >
                              {unit.base}
                            </button>
                          )}
                          <span className="inline-flex items-center ml-1">
                            <button
                              className="cursor-pointer px-1 disabled:opacity-30 disabled:cursor-not-allowed"
                              disabled={uIdx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveUnit(uIdx, uIdx - 1, "top");
                              }}
                              title="Move group up"
                            >
                              ▲
                            </button>
                            <button
                              className="cursor-pointer px-1 disabled:opacity-30 disabled:cursor-not-allowed"
                              disabled={uIdx === units.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveUnit(uIdx, uIdx + 1, "bottom");
                              }}
                              title="Move group down"
                            >
                              ▼
                            </button>
                          </span>
                        </span>
                      </td>
                    </tr>
                  )}
                  {unit.items.map(({ t, suffix }) => {
                    const taskDropTop = taskDropAt != null && "taskId" in taskDropAt && taskDropAt.taskId === t.id && taskDropAt.edge === "top";
                    const taskDropBottom = taskDropAt != null && "taskId" in taskDropAt && taskDropAt.taskId === t.id && taskDropAt.edge === "bottom";
                    const taskRowDragProps = {
                      onDragOver: (e: React.DragEvent) => {
                        e.preventDefault();
                        if (taskDragId == null || taskDragId === t.id) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const edge: "top" | "bottom" = e.clientY - rect.top < rect.height / 2 ? "top" : "bottom";
                        setTaskDropAt({ taskId: t.id, edge });
                      },
                      onDragLeave: () =>
                        setTaskDropAt((d) => (d && "taskId" in d && d.taskId === t.id ? null : d)),
                      onDrop: (e: React.DragEvent) => {
                        e.preventDefault();
                        handleTaskDrop();
                      },
                    };
                    return (
                  <tr
                    key={t.id}
                    className="border-t group hover:bg-[var(--bg-surface-hi)]"
                    style={{
                      borderColor: "var(--border-divider)",
                      opacity: taskDragId === t.id ? 0.4 : 1,
                      ...(taskDropTop ? { boxShadow: "inset 0 2px 0 var(--accent)" } : {}),
                      ...(taskDropBottom ? { boxShadow: "inset 0 -2px 0 var(--accent)" } : {}),
                    }}
                    {...taskRowDragProps}
                  >
                <td
                  className={`py-1.5 text-[13px] cursor-pointer ${suffix ? "pl-6 pr-3" : "px-3"}`}
                  style={{ color: "var(--text-primary)" }}
                  onClick={() => onEdit(t)}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setTaskDragId(t.id);
                    }}
                    onDragEnd={() => {
                      setTaskDragId(null);
                      setTaskDropAt(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-block mr-2 cursor-grab active:cursor-grabbing select-none opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-muted)" }}
                    title="Drag to reorder — drop on another task to join its group, or on a group header to append"
                  >
                    ⠿
                  </span>
                  {suffix ? suffix : t.name}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {t.skills.slice(0, 2).map((s) => (
                      <SkillChip key={s} tag={s} />
                    ))}
                    {t.skills.length > 2 && (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        +{t.skills.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-[12px] mono" style={{ color: "var(--text-secondary)" }}>
                  {t.estimationHours}h
                </td>
                <td className="px-3 py-1.5 text-[12px]">
                  {t.isUnassigned ? (
                    <button
                      className="cursor-pointer"
                      style={{ color: "var(--status-danger-text)" }}
                      onClick={() => onEdit(t)}
                    >
                      ⚠ Assign
                    </button>
                  ) : (
                    <span style={{ color: "var(--text-secondary)" }}>{t.resourceName}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-col items-start gap-1">
                    <ProgressSlider value={t.progress} onCommit={(p) => setProgress(t, p)} width={90} />
                    <Segmented value={t.progress} onChange={(p) => setProgress(t, p)} />
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline, t.behindPace)} />
                    {t.status === "done" && (
                      <input
                        type="date"
                        value={t.actualEnd ?? ""}
                        onChange={(e) => e.target.value && setActualEnd(t, e.target.value)}
                        className="!w-auto"
                        style={{ height: 20, padding: "0 4px", fontSize: 10 }}
                        title="Actual completion date — editable, since this is what shifts dependent tasks"
                      />
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {t.dependsOn.length
                    ? t.dependsOn
                        .map((id) => tasks.find((x) => x.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")
                    : "—"}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(t)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => del(t)}>
                    <span style={{ color: "var(--status-danger-text)" }}>Delete</span>
                  </Button>
                </td>
                  </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--scrim-modal)" }} onClick={() => setConfirm(null)}>
          <div
            className="scale-in rounded-[10px] border p-5 max-w-[420px]"
            style={{ background: "var(--bg-modal)", borderColor: "var(--status-danger-border)", boxShadow: "var(--shadow-modal)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[14px] mb-2" style={{ color: "var(--text-primary)" }}>
              {confirm.deps.length} task{confirm.deps.length > 1 ? "s" : ""} depend on this task&apos;s finish date.
            </div>
            <div className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
              {confirm.deps.map((d) => d.name).join(", ")}. Delete anyway and clear those dependencies?
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => del(confirm.task, true)}>
                Delete anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({
  onAddTask,
  skills,
  filter,
  setFilter,
  atRiskOnly,
  setAtRiskOnly,
  atRiskCount,
}: {
  onAddTask: () => void;
  skills: string[];
  filter: string | null;
  setFilter: (s: string | null) => void;
  atRiskOnly: boolean;
  setAtRiskOnly: (v: boolean) => void;
  atRiskCount: number;
}) {
  return (
    <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onAddTask}>
          + Add Task
        </Button>
        <button
          onClick={() => setAtRiskOnly(!atRiskOnly)}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md border text-[12px] cursor-pointer transition-colors"
          style={{
            borderColor: atRiskOnly ? "var(--status-danger-border)" : "var(--border-default)",
            background: atRiskOnly ? "var(--status-danger-bg)" : "transparent",
            color: atRiskOnly ? "var(--status-danger-text)" : "var(--text-secondary)",
          }}
          title="Show only over-deadline, behind-pace, or unassigned tasks"
        >
          ⚠ At risk{atRiskCount > 0 ? ` (${atRiskCount})` : ""}
        </button>
      </div>
      {skills.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {skills.map((s) => (
            <SkillChip
              key={s}
              tag={s}
              interactive
              active={filter === s}
              onClick={() => setFilter(filter === s ? null : s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Draggable 1% slider — replaces the old static ProgressBar. Live value
// updates on every drag tick for instant visual feedback; the API call
// (onCommit) only fires on release, so dragging doesn't spam PATCH requests.
export function ProgressSlider({ value, onCommit, width = 90 }: { value: number; onCommit: (p: number) => void; width?: number }) {
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);

  const commit = (e: React.SyntheticEvent<HTMLInputElement>) => onCommit(Number(e.currentTarget.value));

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={live}
        onChange={(e) => setLive(Number(e.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        className="progress-slider"
        style={{
          width,
          background: `linear-gradient(to right, var(--accent) ${live}%, var(--bg-surface-hi) ${live}%)`,
        }}
        aria-label="Progress"
      />
      <span className="text-[11px] mono shrink-0" style={{ color: "var(--text-secondary)", minWidth: 26 }}>
        {live}%
      </span>
    </div>
  );
}

export function Segmented({ value, onChange }: { value: number; onChange: (p: number) => void }) {
  return (
    <div className="inline-flex rounded overflow-hidden border" style={{ borderColor: "var(--border-default)" }}>
      {STEPS.map((s, i) => {
        // Each box only darkens across its own segment (previous step, this
        // step] — box 75 goes from empty at 50% to full at 75%, and box 100
        // stays untouched until value passes 75. Box 0 is trivially full.
        const prev = STEPS[i - 1] ?? 0;
        const intensity = s === 0 ? 1 : Math.max(0, Math.min(1, (value - prev) / (s - prev)));
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className="text-[10px] w-6 min-w-0 h-5 flex items-center justify-center cursor-pointer transition-colors"
            style={{
              background: `color-mix(in oklch, var(--accent) ${Math.round(intensity * 100)}%, transparent)`,
              color: intensity >= 0.5 ? "var(--text-on-accent)" : "var(--text-muted)",
              borderLeft: s !== 0 ? "1px solid var(--border-default)" : "none",
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
