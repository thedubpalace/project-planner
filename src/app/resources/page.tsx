"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Resource, ResourceAssignmentDetail, ResourceLoad } from "@/lib/types";
import { Button, SkillChip, StatusPill, WorkloadBar, fmtDate, useToast } from "@/components/ui";
import { ResourceForm } from "@/components/ResourceForm";

export default function ResourcesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ResourceLoad[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, ResourceAssignmentDetail[]>>({});

  const load = useCallback(() => {
    api.resources().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    const open = () => {
      setEditing(null);
      setFormOpen(true);
    };
    window.addEventListener("planner:new-resource", open);
    return () => window.removeEventListener("planner:new-resource", open);
  }, [load]);

  const toggle = async (id: number) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    if (!assignments[id]) {
      const { assignments: a } = await api.getResource(id);
      setAssignments((m) => ({ ...m, [id]: a }));
    }
  };

  const del = async (r: ResourceLoad) => {
    try {
      await api.deleteResource(r.id);
      toast("Resource deleted", "success");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const allSkills = [...new Set((rows ?? []).flatMap((r) => r.skills))];

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[24px] font-semibold">Resources</h1>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Add Resource
        </Button>
      </div>

      {rows === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="sk h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <div className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            No resources yet
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Add people to your resource pool so tasks can auto-assign
          </div>
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
            + Add Resource
          </Button>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: "var(--border-default)" }}
        >
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: "var(--bg-surface)" }}>
                <Th>Resource</Th>
                <Th>Skills</Th>
                <Th>Capacity</Th>
                <Th>Current load (this week, all projects)</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    className="border-t"
                    style={{ borderColor: "var(--border-divider)" }}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <button
                        onClick={() => toggle(r.id)}
                        className="inline-flex items-center gap-2 cursor-pointer"
                      >
                        <span
                          className="text-[10px] transition-transform"
                          style={{
                            color: "var(--text-muted)",
                            transform: expanded === r.id ? "rotate(90deg)" : "none",
                          }}
                        >
                          ▶
                        </span>
                        <Avatar name={r.name} />
                        <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                          {r.name}
                        </span>
                        {r.weekHours > r.weekCapacity && <StatusPill variant="overallocated" />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {r.skills.length ? (
                          r.skills.map((s) => <SkillChip key={s} tag={s} />)
                        ) : (
                          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] mono" style={{ color: "var(--text-secondary)" }}>
                      {r.capacityHoursPerDay}h/day
                    </td>
                    <td className="px-3 py-2.5">
                      <WorkloadBar hours={r.weekHours} capacity={r.weekCapacity} />
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(r);
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => del(r)}>
                        <span style={{ color: "var(--status-danger-text)" }}>Delete</span>
                      </Button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr style={{ background: "var(--bg-base)" }}>
                      <td colSpan={5} className="px-6 py-3">
                        <AssignmentList list={assignments[r.id]} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResourceForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          load();
          setAssignments({});
        }}
        existing={editing}
        suggestions={allSkills}
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.04em]"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </th>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[10px] mono shrink-0"
      style={{
        width: 20,
        height: 20,
        background: "var(--bg-surface-hi)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-default)",
      }}
    >
      {initials}
    </span>
  );
}

function AssignmentList({ list }: { list?: ResourceAssignmentDetail[] }) {
  if (!list) return <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</div>;
  if (list.length === 0)
    return (
      <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        No active assignments.
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      {list.map((a) => (
        <div key={a.taskId} className="flex items-center gap-3 text-[12px]">
          <span style={{ color: "var(--text-secondary)" }}>{a.projectName}</span>
          <span style={{ color: "var(--text-muted)" }}>›</span>
          <span style={{ color: "var(--text-primary)" }}>{a.taskName}</span>
          <span className="mono ml-auto" style={{ color: "var(--text-muted)" }}>
            {fmtDate(a.plannedStart, false)} – {fmtDate(a.plannedEnd, false)}
          </span>
        </div>
      ))}
    </div>
  );
}
