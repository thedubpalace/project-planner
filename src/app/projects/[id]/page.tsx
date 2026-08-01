"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Project, ProjectSchedule, ResourceLoad, ScheduledTask, TaskGroup } from "@/lib/types";
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
  const [groups, setGroups] = useState<TaskGroup[]>([]);
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
      setGroups(proj.groups);
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
  const afterGroupsChanged = (g: TaskGroup[]) => setGroups(g);

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
      <div className="px-4 sm:px-8 py-6">
        <div className="sk h-6 w-64 mb-3" />
        <div className="sk h-4 w-96 mb-8" />
        <div className="sk h-[360px] w-full" />
      </div>
    );

  const over = schedule.risk === "over_deadline";
  const affected = schedule.affectedTaskIds.length;
  const behindTasks = schedule.tasks.filter((t) => t.behindPace);
  // Named by group, not individual task — a bare task suffix like "Dev" or
  // "QA" isn't identifiable on its own, and multiple behind-pace tasks in
  // the same group would otherwise repeat the same context redundantly.
  // Standalone tasks (no group) fall back to their own name.
  const behindGroupLabels = Array.from(
    new Map(behindTasks.map((t) => [t.groupId ?? `t${t.id}`, t.groupName ?? t.name])).values(),
  );

  // Timeline's Gantt wants to fill the viewport (its own panes scroll
  // internally); Tasks/Resources just grow the page naturally — so the
  // fill-to-available-space flex chain below is scoped to this tab only.
  const isTimeline = tab === "timeline";

  return (
    <div
      // `min-height` alone never actually bounds the flex-1/min-h-0 chain
      // below — it's only a floor, so on a project with enough tasks the
      // Gantt panes just grow to their natural content size instead of
      // being clipped to "remaining viewport," meaning nothing overflows
      // internally and the outer page scrolls instead. A real `height` (not
      // min) is required for the internal-scroll pattern to work. Bound
      // unconditionally, not just at the desktop breakpoint: the mobile
      // fallback list now scrolls internally too (Gantt.tsx), so the outer
      // page never scrolls on Timeline at any size — no page-level scroll
      // means the sticky project header has nothing to fight for paint
      // order against, which a scroll-plus-sticky setup kept losing on some
      // mobile browsers no matter how the stacking was tuned.
      className={isTimeline ? "flex flex-col h-[calc(100dvh-var(--nav-h))]" : undefined}
    >
      {/* header + banners + tabs stay pinned below the navbar while the tab
          content scrolls underneath. Unconditional (not just non-Timeline):
          on desktop Timeline the outer page never scrolls (Gantt's own
          panes scroll internally) so this is a no-op there, but on mobile
          Timeline falls back to a plain growing list with no internal
          scroll container of its own, so the outer page DOES scroll —
          without this the header still disappears in exactly that case.
          `isolation: isolate` forces its own compositing layer/stacking
          context — on mobile, plain static content (the fallback list's
          rows) scrolling up from below was intermittently painting ON TOP
          of this sticky block instead of under it; z-index alone wasn't
          reliably enough on the affected mobile browser. */}
      <div
        className="sticky z-20 shrink-0"
        style={{ top: "var(--nav-h)", background: "var(--bg-base)", isolation: "isolate" }}
      >
      {/* header */}
      <div
        className={`px-4 sm:px-8 py-3${isTimeline ? " shrink-0" : ""}`}
        style={{ borderBottom: over || behindTasks.length > 0 ? "none" : "1px solid var(--border-divider)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {project.name}
          </h1>
          <div className="flex items-center gap-2">
            <StatusPill variant={RISK_PILL[schedule.risk]} />
            <Button variant="secondary" size="sm" onClick={() => setProjFormOpen(true)}>
              Edit
            </Button>
          </div>
        </div>
        <div className="mt-1 text-[12px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-secondary)" }}>
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
        <CollapsibleBanner
          tone="danger"
          shrinkOnTimeline={isTimeline}
          summary={
            <>
              Over deadline by{" "}
              <strong style={{ color: "var(--status-danger-text)" }}>
                {schedule.breachDays} day{schedule.breachDays === 1 ? "" : "s"}
              </strong>
              {affected > 0 && ` · ${affected} task${affected === 1 ? "" : "s"} affected`}
            </>
          }
          detail={
            <>
              Projected finish{" "}
              <strong style={{ color: "var(--status-danger-text)" }}>{fmtDate(schedule.projectedFinish)}</strong>{" "}
              exceeds deadline{" "}
              <strong style={{ color: "var(--status-danger-text)" }}>{fmtDate(project.deadline)}</strong> by{" "}
              <strong style={{ color: "var(--status-danger-text)" }}>
                {schedule.breachDays} day{schedule.breachDays === 1 ? "" : "s"}
              </strong>
              .{affected > 0 && ` ${affected} task${affected === 1 ? " is" : "s are"} affected.`}
            </>
          }
          actionLabel="View in Timeline"
          onAction={() => setTab("timeline")}
        />
      )}

      {/* behind-pace rollup — separate from the deadline banner: a task can be
          running behind its own planned pace well before that pushes the
          whole project past its deadline */}
      {behindTasks.length > 0 && (
        <CollapsibleBanner
          tone="warning"
          shrinkOnTimeline={isTimeline}
          summary={
            <>
              <strong style={{ color: "var(--status-warning-text)" }}>{behindTasks.length}</strong> task
              {behindTasks.length === 1 ? "" : "s"} behind pace
            </>
          }
          detail={
            <>
              <strong style={{ color: "var(--status-warning-text)" }}>{behindTasks.length}</strong> task
              {behindTasks.length === 1 ? " is" : "s are"} behind pace:{" "}
              {behindGroupLabels.slice(0, 3).map((label, i) => (
                <span key={label}>
                  {i > 0 && ", "}
                  <strong style={{ color: "var(--status-warning-text)" }}>{label}</strong>
                </span>
              ))}
              {behindGroupLabels.length > 3 && ` +${behindGroupLabels.length - 3} more`}
              {" "}— less progress logged than the time already elapsed against plan.
            </>
          }
          actionLabel="View in Tasks"
          onAction={() => setTab("tasks")}
        />
      )}

      {/* tabs */}
      <div className={`flex items-center gap-4 sm:gap-6 px-4 sm:px-8 overflow-x-auto${isTimeline ? " shrink-0" : ""}`} style={{ borderBottom: "1px solid var(--border-divider)" }}>
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
      </div>

      {/* tab content */}
      <div className={`fade-in${isTimeline ? " flex-1 min-h-0 flex flex-col" : ""}`} key={tab}>
        {tab === "timeline" && (
          <Gantt schedule={schedule} resources={resources} onEditTask={openEditTask} onSchedule={setSchedule} onAddTask={openNewTask} />
        )}
        {tab === "tasks" && (
          <div className="px-4 sm:px-8">
            <TaskTable
              schedule={schedule}
              onEdit={openEditTask}
              onSchedule={setSchedule}
              onGroupsChange={setGroups}
              onAddTask={openNewTask}
            />
          </div>
        )}
        {tab === "resources" && (
          <div className="px-4 sm:px-8 py-4">
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
        groups={groups}
        existing={editingTask}
        onSaved={afterTaskSaved}
        onGroupsChange={afterGroupsChanged}
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

// Compact one-line summary by default (icon + summary + chevron); tapping it
// reveals the full detail sentence and the "jump to tab" action underneath,
// instead of always taking the full-detail height — these sit inside the
// sticky header block now, so a permanently-expanded banner would eat into
// scroll space on every screen, not just the first one.
function CollapsibleBanner({
  tone,
  shrinkOnTimeline,
  summary,
  detail,
  actionLabel,
  onAction,
}: {
  tone: "danger" | "warning";
  shrinkOnTimeline: boolean;
  summary: React.ReactNode;
  detail: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bg = tone === "danger" ? "var(--status-danger-bg)" : "var(--status-warning-bg)";
  const border = tone === "danger" ? "var(--status-danger-border)" : "var(--status-warning-border)";
  const text = tone === "danger" ? "var(--status-danger-text)" : "var(--status-warning-text)";
  return (
    <div
      className={`fade-in px-4 sm:px-8 py-2.5${shrinkOnTimeline ? " shrink-0" : ""}`}
      style={{ background: bg, borderBottom: `1px solid ${border}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left cursor-pointer"
      >
        <span style={{ color: text }}>⚠</span>
        <span className="text-[13px] flex-1 truncate" style={{ color: "var(--text-primary)" }}>
          {summary}
        </span>
        <span className="text-[11px] shrink-0" style={{ color: text }}>
          {open ? "▾ Less" : "▸ Details"}
        </span>
      </button>
      {open && (
        <div className="mt-2 flex items-start gap-3 flex-wrap pl-6">
          <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
            {detail}
          </span>
          <button
            className="ml-auto text-[13px] cursor-pointer hover:underline shrink-0"
            style={{ color: text }}
            onClick={onAction}
          >
            {actionLabel} →
          </button>
        </div>
      )}
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
      {/* mobile cards */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((r) => {
          const count = schedule.tasks.filter((t) => t.resourceId === r.id).length;
          return (
            <div
              key={r.id}
              className="rounded-md border p-3 flex flex-col gap-2.5"
              style={{ borderColor: "var(--border-divider)", background: "var(--bg-surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between gap-2 -mb-0.5">
                <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                  {r.name}
                </span>
                {r.weekHours > r.weekCapacity && <StatusPill variant="overallocated" />}
              </div>
              {r.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {r.skills.map((s) => (
                    <SkillChip key={s} tag={s} />
                  ))}
                </div>
              )}
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {count} task{count === 1 ? "" : "s"} this project
              </span>
              <WorkloadBar hours={r.weekHours} capacity={r.weekCapacity} />
            </div>
          );
        })}
      </div>

      {/* desktop table */}
      <div className="hidden sm:block rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border-default)", boxShadow: "var(--shadow-card)" }}>
        <table className="w-full border-collapse min-w-[560px]">
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
