"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type DashboardProject } from "@/lib/client";
import { Button, ProgressBar, StatusPill, fmtDate, type PillVariant } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";

const RISK_PILL: Record<string, PillVariant> = {
  on_track: "on-track",
  at_risk: "at-risk",
  over_deadline: "over-deadline",
};

export default function Dashboard() {
  const [projects, setProjects] = useState<DashboardProject[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    api.dashboard().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    load();
    const open = () => setFormOpen(true);
    window.addEventListener("planner:new-project", open);
    return () => window.removeEventListener("planner:new-project", open);
  }, [load]);

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[24px] font-semibold">Projects</h1>
      </div>

      {projects === null ? (
        <CardGrid>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-[10px] border p-5 h-[132px]"
              style={{ borderColor: "var(--border-default)", background: "var(--bg-surface)" }}
            >
              <div className="sk h-4 w-1/2 mb-4" />
              <div className="sk h-1.5 w-full mb-4" />
              <div className="sk h-3 w-2/3" />
            </div>
          ))}
        </CardGrid>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <div className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            No projects yet
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Create your first project to start planning
          </div>
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
            + New Project
          </Button>
        </div>
      ) : (
        <CardGrid>
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </CardGrid>
      )}

      <ProjectForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
    >
      {children}
    </div>
  );
}

function ProjectCard({ p }: { p: DashboardProject }) {
  const over = p.schedule.risk === "over_deadline";
  return (
    <Link
      href={`/projects/${p.id}`}
      className="block rounded-[10px] border p-5 transition-[transform,background,border-color] duration-150 hover:-translate-y-px"
      style={{ borderColor: "var(--border-default)", background: "var(--bg-surface)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="text-[14px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {p.name}
        </div>
        <StatusPill variant={RISK_PILL[p.schedule.risk]} />
      </div>
      <div className="mb-4">
        <ProgressBar pct={p.schedule.progressPct} width={200} />
      </div>
      <div className="flex items-center justify-between text-[12px]">
        <span
          className="mono"
          style={{ color: over ? "var(--status-danger-text)" : "var(--text-secondary)" }}
        >
          Deadline {fmtDate(p.deadline)}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {p.taskCount} task{p.taskCount === 1 ? "" : "s"}
          {p.unassignedCount > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--status-danger-text)" }}>
                {p.unassignedCount} unassigned
              </span>
            </>
          )}
        </span>
      </div>
    </Link>
  );
}
