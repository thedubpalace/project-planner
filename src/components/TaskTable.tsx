"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { ProjectSchedule, ScheduledTask } from "@/lib/types";
import {
  Button,
  ProgressBar,
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
      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border-default)" }}>
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
            {shown.map((t) => (
              <tr
                key={t.id}
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
                  <div className="flex flex-col gap-1">
                    <ProgressBar pct={t.progress} width={90} />
                    <Segmented value={t.progress} onChange={(p) => setProgress(t, p)} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill variant={taskPill(t.status, t.isUnassigned, t.overDeadline)} />
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
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "oklch(0% 0 0 / 55%)" }} onClick={() => setConfirm(null)}>
          <div
            className="scale-in rounded-[10px] border p-5 max-w-[420px]"
            style={{ background: "var(--bg-modal)", borderColor: "var(--status-danger-border)" }}
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

function Segmented({ value, onChange }: { value: number; onChange: (p: number) => void }) {
  return (
    <div className="inline-flex rounded overflow-hidden border" style={{ borderColor: "var(--border-default)" }}>
      {STEPS.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className="text-[10px] px-1.5 h-5 cursor-pointer transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--text-on-accent)" : "var(--text-muted)",
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
