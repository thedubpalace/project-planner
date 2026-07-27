"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Field, SkillChip, WorkloadBar, useToast } from "./ui";
import { TagInput } from "./TagInput";
import { api } from "@/lib/client";
import { rankCandidates } from "@/lib/schedule";
import type { ProjectSchedule, Resource, ResourceLoad, ScheduledTask } from "@/lib/types";

export function TaskDrawer({
  open,
  onClose,
  projectId,
  tasks,
  resources,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  tasks: ScheduledTask[];
  resources: ResourceLoad[];
  existing?: ScheduledTask | null;
  onSaved: (schedule: ProjectSchedule) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [estimation, setEstimation] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [deps, setDeps] = useState<number[]>([]);
  const [startOverride, setStartOverride] = useState("");
  const [override, setOverride] = useState<number | null | "auto">("auto");
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setEstimation(existing ? String(existing.estimationHours) : "");
    setSkills(existing?.skills ?? []);
    setDeps(existing?.dependsOn ?? []);
    setStartOverride(existing?.startDateOverride ?? "");
    setOverride(existing ? existing.resourceId : "auto");
    setShowPicker(false);
  }, [open, existing]);

  const skillSuggestions = useMemo(
    () => [...new Set(resources.flatMap((r) => r.skills))],
    [resources],
  );

  const bookedMap = useMemo(() => {
    const m = new Map<number, number>();
    resources.forEach((r) => m.set(r.id, r.bookedHours));
    return m;
  }, [resources]);

  const ranked = useMemo(
    () => rankCandidates(skills, resources as Resource[], bookedMap),
    [skills, resources, bookedMap],
  );
  const suggestion = ranked.find((c) => c.matched) ?? null;
  const hasAnyMatch = !!suggestion;

  // effective assigned resource id
  const effectiveId = override === "auto" ? suggestion?.resource.id ?? null : override;
  const effectiveResource = resources.find((r) => r.id === effectiveId) ?? null;

  const otherTasks = tasks.filter((t) => t.id !== existing?.id);
  const isDone = existing?.status === "done";

  const save = async () => {
    const est = Number(estimation);
    if (!name.trim()) return toast("Task name is required", "error");
    if (!Number.isFinite(est) || est <= 0) return toast("Estimation must be positive", "error");
    setBusy(true);
    try {
      const common = {
        name: name.trim(),
        description: description || null,
        estimationHours: est,
        skills,
        dependsOn: deps,
        startDateOverride: startOverride || null,
      };
      let schedule: ProjectSchedule;
      let assignedName: string | null;
      if (existing) {
        // "auto" re-runs the server-side match; explicit id/null overrides it
        const res = await api.updateTask(existing.id, {
          ...common,
          resourceId: override === "auto" ? "auto" : override,
        });
        schedule = res.schedule;
        assignedName = res.task.resourceId
          ? resources.find((r) => r.id === res.task.resourceId)?.name ?? null
          : null;
      } else {
        const res = await api.createTask({
          projectId,
          ...common,
          resourceId: effectiveId,
        });
        schedule = res.schedule;
        assignedName = res.task.resourceId
          ? resources.find((r) => r.id === res.task.resourceId)?.name ?? null
          : null;
      }
      toast(
        assignedName
          ? `${existing ? "Task updated" : "Task created"} — assigned to ${assignedName}`
          : `${existing ? "Task updated" : "Task created"} — Unassigned`,
        assignedName ? "success" : "info",
      );
      onSaved(schedule);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={existing ? "Edit task" : "New task"}>
      <div className="flex flex-col gap-5 p-6">
        <Field label="Task name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Build components" autoFocus />
        </Field>
        <Field label="Description">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Estimation">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={estimation}
              onChange={(e) => setEstimation(e.target.value)}
              className="!w-32"
            />
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              hours
            </span>
          </div>
        </Field>
        <Field label="Required skill tags" hint="Drives auto-matching. At least one tag to get a suggestion.">
          <TagInput value={skills} onChange={setSkills} suggestions={skillSuggestions} />
        </Field>
        <Field label="Depends on" hint="Finish-to-start: this task starts after the selected tasks finish.">
          <DepSelect tasks={otherTasks.map((t) => ({ id: t.id, name: t.name }))} value={deps} onChange={setDeps} />
        </Field>
        <Field
          label="Start date"
          hint={
            isDone
              ? "Task is done — its schedule (and anything depending on it) is fixed to the actual completion date it was marked done on, not this planned start."
              : undefined
          }
        >
          <input
            type="date"
            value={startOverride}
            onChange={(e) => setStartOverride(e.target.value)}
            placeholder="Auto (from dependency or today)"
            disabled={isDone}
            className={isDone ? "opacity-50 cursor-not-allowed" : undefined}
          />
        </Field>

        {skills.length > 0 && (
          <MatchPreview
            hasAnyMatch={hasAnyMatch}
            effectiveResource={effectiveResource}
            skills={skills}
            ranked={ranked}
            showPicker={showPicker}
            setShowPicker={setShowPicker}
            onPick={(id) => {
              setOverride(id);
              setShowPicker(false);
            }}
            onAuto={() => {
              setOverride("auto");
              setShowPicker(false);
            }}
            isAuto={override === "auto"}
          />
        )}
      </div>

      <div
        className="mt-auto sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t"
        style={{ borderColor: "var(--border-divider)", background: "var(--bg-modal)" }}
      >
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save} loading={busy}>
          Save
        </Button>
      </div>
    </Drawer>
  );
}

function MatchPreview({
  hasAnyMatch,
  effectiveResource,
  skills,
  ranked,
  showPicker,
  setShowPicker,
  onPick,
  onAuto,
  isAuto,
}: {
  hasAnyMatch: boolean;
  effectiveResource: ResourceLoad | null;
  skills: string[];
  ranked: ReturnType<typeof rankCandidates>;
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
  onPick: (id: number | null) => void;
  onAuto: () => void;
  isAuto: boolean;
}) {
  const danger = !hasAnyMatch && !effectiveResource;
  const matched = ranked.filter((c) => c.matched);
  const unmatched = ranked.filter((c) => !c.matched);

  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-3"
      style={{
        background: danger ? "var(--status-danger-bg)" : "var(--bg-surface-hi)",
        borderColor: danger ? "var(--status-danger-border)" : "var(--border-default)",
      }}
    >
      <div className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {isAuto ? "Suggested resource" : "Assigned resource (override)"}
      </div>

      {effectiveResource ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
              ● {effectiveResource.name}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowPicker(!showPicker)}>
              Change ▾
            </Button>
          </div>
          <WorkloadBar hours={effectiveResource.weekHours} capacity={effectiveResource.weekCapacity} width={140} />
          <div className="flex flex-wrap gap-1">
            {effectiveResource.skills
              .filter((s) => skills.includes(s.toLowerCase()))
              .map((s) => (
                <SkillChip key={s} tag={s} />
              ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-[12px]" style={{ color: "var(--status-danger-text)" }}>
            No resource has a matching skill tag. This task will be created as Unassigned.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setShowPicker(!showPicker)}>
            Change ▾
          </Button>
        </div>
      )}

      {showPicker && (
        <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--border-divider)" }}>
          <button
            className="text-left text-[12px] px-2 py-1.5 rounded cursor-pointer hover:bg-[var(--bg-surface)]"
            style={{ color: "var(--accent-text)" }}
            onClick={onAuto}
          >
            ↺ Auto-match (least workload)
          </button>
          {matched.map((c) => (
            <PickRow key={c.resource.id} name={c.resource.name} booked={c.bookedHours} onClick={() => onPick(c.resource.id)} />
          ))}
          {unmatched.length > 0 && (
            <div className="text-[10px] uppercase tracking-wide px-2 pt-2 pb-1" style={{ color: "var(--text-muted)" }}>
              No matching skill
            </div>
          )}
          {unmatched.map((c) => (
            <PickRow
              key={c.resource.id}
              name={c.resource.name}
              booked={c.bookedHours}
              dimmed
              onClick={() => onPick(c.resource.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PickRow({
  name,
  booked,
  dimmed,
  onClick,
}: {
  name: string;
  booked: number;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center justify-between text-left text-[12px] px-2 py-1.5 rounded cursor-pointer hover:bg-[var(--bg-surface)]"
      style={{ color: dimmed ? "var(--text-muted)" : "var(--text-primary)" }}
      onClick={onClick}
    >
      <span>
        {dimmed && <span style={{ color: "var(--status-warning-text)" }}>⚠ </span>}
        {name}
      </span>
      <span className="mono" style={{ color: "var(--text-muted)" }}>
        {Math.round(booked)}h booked
      </span>
    </button>
  );
}

function DepSelect({
  tasks,
  value,
  onChange,
}: {
  tasks: { id: number; name: string }[];
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  if (tasks.length === 0)
    return <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>No other tasks yet</span>;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 rounded-md border text-[13px] cursor-pointer"
        style={{ borderColor: "var(--border-default)", background: "var(--bg-base)", color: "var(--text-secondary)" }}
      >
        {value.length ? `${value.length} predecessor${value.length > 1 ? "s" : ""} selected` : "Select predecessor tasks"}
      </button>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {value.map((id) => {
            const t = tasks.find((x) => x.id === id);
            if (!t) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-[11px] px-2 h-5 rounded border"
                style={{ background: "var(--bg-surface-hi)", borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
              >
                {t.name}
                <button type="button" onClick={() => toggle(id)} className="cursor-pointer opacity-70">
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-20 rounded-md border max-h-52 overflow-auto"
          style={{ background: "var(--bg-surface-hi)", borderColor: "var(--border-default)" }}
        >
          {tasks.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer hover:bg-[var(--bg-surface)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                type="checkbox"
                className="!w-auto"
                checked={value.includes(t.id)}
                onChange={() => toggle(t.id)}
              />
              {t.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
