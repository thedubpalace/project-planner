"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { ProjectSchedule, ScheduledTask } from "@/lib/types";
import {
  Button,
  SkillChip,
  StatusPill,
  taskPill,
  useToast,
} from "./ui";

const STEPS = [0, 25, 50, 75, 100];

// Tasks named "Process name [Role]" (e.g. a BA/Dev/QA split of one row from
// an import) are clustered together under a shared group header instead of
// scattering across the table by planned date. Plain task names (no bracket
// suffix) are untouched — they render exactly as before, no header row.
const ROLE_ORDER: Record<string, number> = { BA: 0, Dev: 1, QA: 2 };
function taskGroupKey(name: string): { base: string; suffix: string | null } {
  const m = name.match(/^(.*) \[([^[\]]+)\]$/);
  return m ? { base: m[1], suffix: m[2] } : { base: name, suffix: null };
}

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
  const grouped = useMemo(() => {
    const withKeys = shown.map((t) => ({ t, ...taskGroupKey(t.name) }));
    const groupStart = new Map<string, number>();
    for (const { t, base } of withKeys) {
      const ts = new Date(t.plannedStart).getTime();
      if (!groupStart.has(base) || ts < groupStart.get(base)!) groupStart.set(base, ts);
    }
    return withKeys.sort((a, b) => {
      const byGroup = groupStart.get(a.base)! - groupStart.get(b.base)!;
      if (byGroup !== 0) return byGroup;
      if (a.base !== b.base) return a.base.localeCompare(b.base);
      const ra = a.suffix ? ROLE_ORDER[a.suffix] ?? 99 : 99;
      const rb = b.suffix ? ROLE_ORDER[b.suffix] ?? 99 : 99;
      return ra !== rb ? ra - rb : a.t.id - b.t.id;
    });
  }, [shown]);

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
            {grouped.map(({ t, base, suffix }, idx) => {
              const prev = grouped[idx - 1];
              const isNewGroup = !!suffix && (idx === 0 || prev.base !== base || !prev.suffix);
              return (
                <Fragment key={t.id}>
                  {isNewGroup && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
                        style={{ color: "var(--text-muted)", background: "var(--bg-surface-hi)" }}
                      >
                        {base}
                      </td>
                    </tr>
                  )}
                  <tr
                    className="border-t group hover:bg-[var(--bg-surface-hi)]"
                    style={{ borderColor: "var(--border-divider)" }}
                  >
                <td
                  className="px-3 py-2.5 text-[13px] cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                  onClick={() => onEdit(t)}
                >
                  {t.name}
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
                  <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline, t.behindPace)} />
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
