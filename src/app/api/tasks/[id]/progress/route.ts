import { NextResponse } from "next/server";
import { getTask, updateTaskProgress } from "@/lib/db";
import { todayISO } from "@/lib/schedule";
import { projectSchedule } from "@/lib/service";
import type { ScheduledTask, TaskStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function deriveStatus(progress: number): TaskStatus {
  if (progress <= 0) return "not_started";
  if (progress >= 100) return "done";
  return "in_progress";
}

export async function POST(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const existing = getTask(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  let progress = Number(body?.progress);
  if (!Number.isFinite(progress)) progress = existing.progress;
  progress = Math.max(0, Math.min(100, Math.round(progress)));
  const status: TaskStatus =
    typeof body?.status === "string" &&
    ["not_started", "in_progress", "done"].includes(body.status)
      ? (body.status as TaskStatus)
      : deriveStatus(progress);

  // actualEnd = the real completion date; defaults to today the first time a
  // task is marked done, then stays fixed — except an explicit override lets
  // the PM correct it (e.g. "actually finished last Tuesday, not today").
  // Cleared whenever status isn't done. This is what shifts finish-to-start
  // dependents (requirement 9).
  const actualEndOverride =
    typeof body?.actualEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.actualEnd) ? body.actualEnd : null;
  const actualEnd = status === "done" ? actualEndOverride ?? existing.actualEnd ?? todayISO() : null;

  // capture schedule before the change to compute the shift delta for the toast
  const before = projectSchedule(existing.projectId);
  updateTaskProgress(id, progress, status, actualEnd);
  const after = projectSchedule(existing.projectId);

  const beforeMap = new Map<number, ScheduledTask>();
  before?.tasks.forEach((t) => beforeMap.set(t.id, t));

  const shifted: { id: number; name: string; status: TaskStatus }[] = [];
  for (const t of after?.tasks ?? []) {
    if (t.id === id) continue;
    const prev = beforeMap.get(t.id);
    if (prev && (prev.plannedStart !== t.plannedStart || prev.plannedEnd !== t.plannedEnd)) {
      shifted.push({ id: t.id, name: t.name, status: t.status });
    }
  }

  return NextResponse.json({
    task: getTask(id),
    schedule: after,
    shifted,
    breached: after?.risk === "over_deadline",
    atRisk: after?.risk === "at_risk",
  });
}
