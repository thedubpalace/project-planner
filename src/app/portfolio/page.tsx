"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type DashboardProject } from "@/lib/client";
import type { ResourceLoad, ScheduledTask, TaskGroup } from "@/lib/types";
import { PortfolioGantt } from "@/components/PortfolioGantt";
import { TaskDrawer } from "@/components/TaskDrawer";

export default function Portfolio() {
  const router = useRouter();
  const [projects, setProjects] = useState<DashboardProject[] | null>(null);
  const [resources, setResources] = useState<ResourceLoad[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProjectId, setDrawerProjectId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [drawerGroups, setDrawerGroups] = useState<TaskGroup[]>([]);

  useEffect(() => {
    if (drawerProjectId == null) return;
    api
      .getProject(drawerProjectId)
      .then((p) => setDrawerGroups(p.groups))
      .catch(() => setDrawerGroups([]));
  }, [drawerProjectId]);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([api.dashboard(), api.resources()]);
    setProjects(p);
    setResources(r);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleGroup = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandGroup = (id: number) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const openTask = (projectId: number, task: ScheduledTask) => {
    setDrawerProjectId(projectId);
    setEditingTask(task);
    setDrawerOpen(true);
  };

  if (!projects) {
    return (
      <div className="px-8 py-6">
        <div className="sk h-6 w-64 mb-3" />
        <div className="sk h-4 w-96 mb-8" />
        <div className="sk h-[420px] w-full" />
      </div>
    );
  }

  const breached = projects.filter((p) => p.schedule.risk === "over_deadline");
  const activeProject = projects.find((p) => p.id === drawerProjectId) ?? null;

  return (
    <div>
      {/* header */}
      <div className="px-8 py-6" style={{ borderBottom: breached.length > 0 ? "none" : "1px solid var(--border-divider)" }}>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Portfolio
        </h1>
        <div className="mt-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {projects.length} project{projects.length === 1 ? "" : "s"} · every timeline in one view
        </div>
      </div>

      {/* deadline breach banner — summary across projects */}
      {breached.length > 0 && (
        <div
          className="fade-in flex items-start gap-3 px-8 py-3"
          style={{ background: "var(--status-danger-bg)", borderBottom: "1px solid var(--status-danger-border)" }}
        >
          <span style={{ color: "var(--status-danger-text)" }}>⚠</span>
          <div className="text-[13px] flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-1" style={{ color: "var(--text-primary)" }}>
            <strong style={{ color: "var(--status-danger-text)" }}>{breached.length}</strong>
            <span>project{breached.length === 1 ? "" : "s"} past deadline:</span>
            {breached.map((p, i) => (
              <span key={p.id}>
                <button
                  className="cursor-pointer hover:underline"
                  style={{ color: "var(--status-danger-text)" }}
                  onClick={() => expandGroup(p.id)}
                >
                  {p.name}
                </button>
                <span className="mono text-[11px] ml-1" style={{ color: "var(--text-secondary)" }}>
                  (+{p.schedule.breachDays}d)
                </span>
                {i < breached.length - 1 && <span style={{ color: "var(--text-muted)" }}>,</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <PortfolioGantt
        projects={projects}
        collapsed={collapsed}
        onToggleGroup={toggleGroup}
        onOpenProject={(id) => router.push(`/projects/${id}`)}
        onEditTask={openTask}
      />

      {activeProject && (
        <TaskDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          projectId={activeProject.id}
          tasks={activeProject.schedule.tasks}
          resources={resources}
          groups={drawerGroups}
          existing={editingTask}
          onSaved={load}
          onGroupsChange={setDrawerGroups}
        />
      )}
    </div>
  );
}
