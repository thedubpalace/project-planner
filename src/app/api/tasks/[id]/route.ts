import { NextResponse } from "next/server";
import {
  deleteTask,
  dependentsOf,
  getTask,
  listResources,
  updateTask,
} from "@/lib/db";
import { autoMatch } from "@/lib/schedule";
import { bookedHoursByResource, projectSchedule } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const existing = getTask(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : existing.name;
  const estimationHours =
    body?.estimationHours != null ? Number(body.estimationHours) : existing.estimationHours;
  if (!name) return NextResponse.json({ error: "Task name is required" }, { status: 400 });
  if (!Number.isFinite(estimationHours) || estimationHours <= 0)
    return NextResponse.json({ error: "Estimation must be a positive number" }, { status: 400 });

  const skills = Array.isArray(body?.skills)
    ? body.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
    : existing.skills;
  const dependsOn = Array.isArray(body?.dependsOn)
    ? body.dependsOn.map((d: unknown) => Number(d)).filter((d: number) => Number.isInteger(d) && d !== id)
    : existing.dependsOn;
  const startDateOverride =
    body?.startDateOverride === null
      ? null
      : typeof body?.startDateOverride === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(body.startDateOverride)
        ? body.startDateOverride
        : existing.startDateOverride;

  // resourceId: number → explicit, null → force unassigned, "auto" → re-run match,
  // undefined → keep existing.
  let resourceId = existing.resourceId;
  if (typeof body?.resourceId === "number") resourceId = body.resourceId;
  else if (body?.resourceId === null) resourceId = null;
  else if (body?.resourceId === "auto") {
    const matched = autoMatch(skills, listResources(), bookedHoursByResource());
    resourceId = matched?.id ?? null;
  }

  updateTask(id, {
    name,
    description: typeof body?.description === "string" ? body.description : existing.description,
    estimationHours,
    skills,
    resourceId,
    startDateOverride,
    dependsOn,
  });

  return NextResponse.json({
    task: getTask(id),
    schedule: projectSchedule(existing.projectId),
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const dependents = dependentsOf(id);
  if (dependents.length > 0 && !force) {
    return NextResponse.json(
      {
        error: "has_dependents",
        dependents: dependents.map((d) => ({ id: d.id, name: d.name })),
      },
      { status: 409 },
    );
  }
  // ON DELETE CASCADE on task_deps clears dependency rows automatically.
  deleteTask(id);
  return NextResponse.json({ ok: true, schedule: projectSchedule(task.projectId) });
}
