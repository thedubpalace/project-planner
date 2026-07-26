"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Project, ProjectSchedule, ResourceLoad, ScheduledTask } from "@/lib/types";
import {
  Button,
  SkillChip,
  StatusPill,
  WorkloadBar,
  fmtDate,
  type PillVariant,
} from "@/components/ui";
import { Gantt } from "@/components/Gantt";
import { TaskTable } from "@/components/TaskTable";
import { TaskDrawer } from "@/components/TaskDrawer";
import { ProjectForm } from "@/components/ProjectForm";

const RISK_PILL: Record<string, PillVariant> = {
  on_track: "on-track",
  at_risk: "at-risk",
  over_deadline: "over-deadline",
};

type Tab = "timeline" | "tasks" | "resources";

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [schedule, setSchedule] = useState<ProjectSchedule | null>(null);
  const [resources, setResources] = useState<ResourceLoad[]>([]);
  const [tab, setTab] = useState<Tab>("timeline");
  const [notFound, setNotFound] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [projFormOpen, setProjFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [proj, res] = await Promise.all([api.getProject(projectId), api.resources()]);
      setProject(proj.project);
      setSchedule(proj.schedule);
      setResources(res);
    } catch {
      setNotFound(true);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const openNewTask = () => {
    setEditingTask(null);
    setDrawerOpen(true);
  };
  const openEditTask = (t: ScheduledTask) => {
    setEditingTask(t);
    setDrawerOpen(true);
  };
  const afterTaskSaved = (s: ProjectSchedule) => {
    setSchedule(s);
    api.resources().then(setResources).catch(() => {});
  };

  if (notFound)
    return (
      <div className="mx-auto max-w-[600px] px-6 py-24 text-center">
        <div className="text-[14px] mb-3" style={{ color: "var(--text-secondary)" }}>
          Project not found
        </div>
        <Link href="/">
          <Button variant="secondary" size="sm">
            ← Back to projects
          </Button>
        </Link>
      </div>
    );

  if (!project || !schedule)
    return (
      <div className="px-8 py-6">
        <div className="sk h-6 w-64 mb-3" />
        <div className="sk h-4 w-96 mb-8" />
        <div className="sk h-[360px] w-full" />
      </div>
    );

  const over = schedule.risk === "over_deadline";
  const affected = schedule.affectedTaskIds.length;

  return (
    <div>
      {/* header */}
      <div className="px-8 py-6" style={{ borderBottom: over ? "none" : "1px solid var(--border-divider)" }}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {project.name}
          </h1>
          <div className="flex items-center gap-2">
            <StatusPill variant={RISK_PILL[schedule.risk]} />
            <Button variant="secondary" size="sm" onClick={() => setProjFormOpen(true)}>
              Edit
            </Button>
          </div>
        </div>
        <div className="mt-1.5 text-[12px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-secondary)" }}>
          <span className="mono">Deadline {fmtDate(project.deadline)}</span>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span className="mono" style={{ color: over ? "var(--status-danger-text)" : "var(--text-secondary)" }}>
            Projected finish {fmtDate(schedule.projectedFinish)}
          </span>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span>{schedule.tasks.length} tasks</span>
        </div>
      </div>

      {/* deadline breach banner */}
      {over && (
        <div
          className="fade-in flex items-center gap-3 px-8 py-3"
          style={{ background: "var(--status-danger-bg)", borderBottom: "1px solid var(--status-danger-border)" }}
        >
          <span style={{ color: "var(--status-danger-text)" }}>⚠</span>
          <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
            Projected finish{" "}
            <strong style={{ color: "var(--status-danger-text)" }}>{fmtDate(schedule.projectedFinish)}</strong> exceeds
            deadline <strong style={{ color: "var(--status-danger-text)" }}>{fmtDate(project.deadline)}</strong> by{" "}
            <strong style={{ color: "var(--status-danger-text)" }}>{schedule.breachDays} day{schedule.breachDays === 1 ? "" : "s"}</strong>.
            {affected > 0 && ` ${affected} task${affected === 1 ? " is" : "s are"} affected.`}
          </span>
          <button
            className="ml-auto text-[13px] cursor-pointer hover:underline"
            style={{ color: "var(--status-danger-text)" }}
            onClick={() => setTab("timeline")}
          >
            View in Timeline →
          </button>
        </div>
      )}

      {/* tabs */}
      <div className="flex items-center gap-6 px-8" style={{ borderBottom: "1px solid var(--border-divider)" }}>
        {(["timeline", "tasks", "resources"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="h-10 text-[13px] font-medium border-b-2 capitalize cursor-pointer transition-colors"
            style={{
              color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
              borderColor: tab === t ? "var(--accent)" : "transparent",
            }}
          >
            {t === "timeline" ? "Timeline" : t === "tasks" ? "Tasks" : "Resources"}
          </button>
        ))}
      </div>

      {/* tab content */}
      <div className="fade-in" key={tab}>
        {tab === "timeline" && <Gantt schedule={schedule} onEditTask={openEditTask} />}
        {tab === "tasks" && (
          <div className="px-8">
            <TaskTable schedule={schedule} onEdit={openEditTask} onSchedule={setSchedule} onAddTask={openNewTask} />
          </div>
        )}
        {tab === "resources" && (
          <div className="px-8 py-4">
            <ProjectResources schedule={schedule} resources={resources} />
          </div>
        )}
      </div>

      <TaskDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={projectId}
        tasks={schedule.tasks}
        resources={resources}
        existing={editingTask}
        onSaved={afterTaskSaved}
      />
      <ProjectForm
        open={projFormOpen}
        onClose={() => setProjFormOpen(false)}
        existing={project}
        onSaved={(p) => {
          setProject(p);
          load();
        }}
      />
    </div>
  );
}

function ProjectResources({
  schedule,
  resources,
}: {
  schedule: ProjectSchedule;
  resources: ResourceLoad[];
}) {
  const assignedIds = new Set(schedule.tasks.map((t) => t.resourceId).filter((x): x is number => x != null));
  const rows = resources.filter((r) => assignedIds.has(r.id));
  const unassignedCount = schedule.tasks.filter((t) => t.isUnassigned).length;

  if (rows.length === 0 && unassignedCount === 0)
    return (
      <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
        No resources assigned to this project yet.
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {unassignedCount > 0 && (
        <div
          className="rounded-md border px-4 py-2.5 text-[12px] flex items-center gap-2"
          style={{ background: "var(--status-danger-bg)", borderColor: "var(--status-danger-border)", color: "var(--text-primary)" }}
        >
          <span style={{ color: "var(--status-danger-text)" }}>⚠</span>
          {unassignedCount} task{unassignedCount === 1 ? "" : "s"} in this project {unassignedCount === 1 ? "is" : "are"} unassigned.
        </div>
      )}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "var(--bg-surface)" }}>
              {["Resource", "Skills", "This project", "Load (this week, all projects)"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const count = schedule.tasks.filter((t) => t.resourceId === r.id).length;
              return (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-divider)" }}>
                  <td className="px-3 py-2.5 text-[13px]" style={{ color: "var(--text-primary)" }}>
                    {r.name}
                    {r.weekHours > r.weekCapacity && <span className="ml-2"><StatusPill variant="overallocated" /></span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.skills.map((s) => (
                        <SkillChip key={s} tag={s} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {count} task{count === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-2.5">
                    <WorkloadBar hours={r.weekHours} capacity={r.weekCapacity} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
