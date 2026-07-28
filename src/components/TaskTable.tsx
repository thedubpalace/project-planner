"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { ProjectSchedule, ScheduledTask } from "@/lib/types";
import { groupTasks } from "@/lib/taskGroup";
import {
  Button,
  SkillChip,
  StatusPill,
  taskPill,
  useToast,
} from "./ui";

const STEPS = [0, 25, 50, 75, 100];

export function TaskTable({
  schedule,
  onEdit,
  onSchedule,
  onAddTask,
}: {
  schedule: ProjectSchedule;
  onEdit: (t: ScheduledTask) => void;
  onSchedule: (s: ProjectSchedule) => void;
  onAddTask: () => void;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ task: ScheduledTask; deps: { id: number; name: string }[] } | null>(null);

  const tasks = schedule.tasks;
  const allSkills = [...new Set(tasks.flatMap((t) => t.skills))];
  const shown = filter ? tasks.filter((t) => t.skills.includes(filter)) : tasks;

  // Cluster same-group tasks together; groups themselves stay in roughly
  // chronological order (by their earliest planned start).
  const grouped = useMemo(() => groupTasks(shown), [shown]);

  // Drag-reorder unit = one BA/Dev/QA cluster (dragged as a whole, since role
  // order within a cluster is fixed) or one standalone task. Units are
  // contiguous runs of `grouped` sharing the same base name.
  const units = useMemo(() => {
    const arr: { base: string; items: typeof grouped }[] = [];
    for (const g of grouped) {
      const last = arr[arr.length - 1];
      if (last && last.base === g.base) last.items.push(g);
      else arr.push({ base: g.base, items: [g] });
    }
    return arr;
  }, [grouped]);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ idx: number; edge: "top" | "bottom" } | null>(null);

  const minOrderOf = (items: typeof grouped) =>
    Math.min(...items.map(({ t }) => t.sortOrder ?? t.id));

  const orderBetween = (before: number | null, after: number | null): number => {
    if (before == null && after == null) return 1;
    if (before == null) return after! - 1;
    if (after == null) return before + 1;
    return (before + after) / 2;
  };

  const handleDrop = async (targetIdx: number, edge: "top" | "bottom") => {
    setDropAt(null);
    if (dragIdx === null) return;
    const dropIdx = edge === "top" ? targetIdx : targetIdx + 1;
    if (dropIdx === dragIdx || dropIdx === dragIdx + 1) {
      setDragIdx(null);
      return; // dropped back onto its own slot — no-op
    }
    const orderVals = units.map((u) => minOrderOf(u.items));
    const remaining = orderVals.filter((_, i) => i !== dragIdx);
    const adjDrop = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
    const before = adjDrop > 0 ? remaining[adjDrop - 1] : null;
    const after = adjDrop < remaining.length ? remaining[adjDrop] : null;
    const newOrder = orderBetween(before, after);

    const dragged = units[dragIdx];
    setDragIdx(null);
    try {
      let res;
      for (const { t } of dragged.items) {
        res = await api.reorderTask(t.id, newOrder);
      }
      if (res) onSchedule(res.schedule);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const setProgress = async (t: ScheduledTask, pct: number) => {
    try {
      const res = await api.updateProgress(t.id, pct);
      onSchedule(res.schedule);
      if (res.shifted.length > 0) {
        const tail = res.breached
          ? " — deadline exceeded"
          : res.atRisk
            ? " — 1 now at risk"
            : "";
        toast(`${res.shifted.length} task${res.shifted.length > 1 ? "s" : ""} shifted${tail}`, res.breached ? "error" : "info");
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
          ? `Completion date updated — ${res.shifted.length} task${res.shifted.length > 1 ? "s" : ""} shifted`
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
        <Toolbar onAddTask={onAddTask} skills={[]} filter={null} setFilter={setFilter} />
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
      <Toolbar onAddTask={onAddTask} skills={allSkills} filter={filter} setFilter={setFilter} />
      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border-default)", boxShadow: "var(--shadow-card)" }}>
        <table className="w-full border-collapse min-w-[820px]">
          <thead>
            <tr style={{ background: "var(--bg-surface)" }}>
              {["Task", "Skills", "Est.", "Resource", "Progress", "Status", "Deps", ""].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.04em]"
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
              const rowDragProps = {
                onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
                  if (dragIdx === null) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const edge: "top" | "bottom" = e.clientY - rect.top < rect.height / 2 ? "top" : "bottom";
                  setDropAt({ idx: uIdx, edge });
                },
                onDragLeave: () => setDropAt((d) => (d?.idx === uIdx ? null : d)),
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const edge: "top" | "bottom" = e.clientY - rect.top < rect.height / 2 ? "top" : "bottom";
                  handleDrop(uIdx, edge);
                },
              };
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
                  {unit.items[0].suffix && (
                    <tr {...rowDragProps} style={{ opacity: isDragging ? 0.4 : 1, ...dropBorderStyle }}>
                      <td
                        colSpan={8}
                        className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
                        style={{ color: "var(--text-muted)", background: "var(--bg-surface-hi)" }}
                      >
                        {handle}
                        {unit.base}
                      </td>
                    </tr>
                  )}
                  {unit.items.map(({ t, suffix }) => {
                    const standalone = unit.items.length === 1 && !suffix;
                    return (
                  <tr
                    key={t.id}
                    className="border-t group hover:bg-[var(--bg-surface-hi)]"
                    style={{
                      borderColor: "var(--border-divider)",
                      opacity: standalone && isDragging ? 0.4 : 1,
                      ...(standalone ? dropBorderStyle : {}),
                    }}
                    {...(standalone ? rowDragProps : {})}
                  >
                <td
                  className={`py-2.5 text-[13px] cursor-pointer ${suffix ? "pl-6 pr-3" : "px-3"}`}
                  style={{ color: "var(--text-primary)" }}
                  onClick={() => onEdit(t)}
                >
                  {standalone && handle}
                  {suffix ? suffix : t.name}
                </td>
                <td className="px-3 py-2.5">
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
                <td className="px-3 py-2.5 text-[12px] mono" style={{ color: "var(--text-secondary)" }}>
                  {t.estimationHours}h
                </td>
                <td className="px-3 py-2.5 text-[12px]">
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
                <td className="px-3 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <ProgressSlider value={t.progress} onCommit={(p) => setProgress(t, p)} width={90} />
                    <Segmented value={t.progress} onChange={(p) => setProgress(t, p)} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col items-start gap-1">
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
                <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {t.dependsOn.length
                    ? t.dependsOn
                        .map((id) => tasks.find((x) => x.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "oklch(0% 0 0 / 55%)" }} onClick={() => setConfirm(null)}>
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
}: {
  onAddTask: () => void;
  skills: string[];
  filter: string | null;
  setFilter: (s: string | null) => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
      <Button variant="primary" size="sm" onClick={onAddTask}>
        + Add Task
      </Button>
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
function ProgressSlider({ value, onCommit, width = 90 }: { value: number; onCommit: (p: number) => void; width?: number }) {
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

function Segmented({ value, onChange }: { value: number; onChange: (p: number) => void }) {
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
