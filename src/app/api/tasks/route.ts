import { NextResponse } from "next/server";
import { createTask, listResources } from "@/lib/db";
import { autoMatch } from "@/lib/schedule";
import { bookedHoursByResource, projectSchedule } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const projectId = Number(body?.projectId);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const estimationHours = Number(body?.estimationHours);
  const skills = Array.isArray(body?.skills)
    ? body.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
  if (!Number.isInteger(projectId))
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Task name is required" }, { status: 400 });
  if (!Number.isFinite(estimationHours) || estimationHours <= 0)
    return NextResponse.json({ error: "Estimation (hours) must be a positive number" }, { status: 400 });

  // Auto-match: use explicit resourceId when the client sends a number; otherwise
  // pick the skill-matched resource with the least cross-project workload (or leave
  // unassigned when no skill matches).
  let resourceId: number | null;
  if (typeof body?.resourceId === "number") {
    resourceId = body.resourceId;
  } else {
    const matched = autoMatch(skills, listResources(), bookedHoursByResource());
    resourceId = matched?.id ?? null;
  }

  const dependsOn = Array.isArray(body?.dependsOn)
    ? body.dependsOn.map((d: unknown) => Number(d)).filter(Number.isInteger)
    : [];
  const startDateOverride =
    typeof body?.startDateOverride === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDateOverride)
      ? body.startDateOverride
      : null;

  const task = createTask({
    projectId,
    name,
    description: typeof body?.description === "string" ? body.description : null,
    estimationHours,
    skills,
    resourceId,
    startDateOverride,
    dependsOn,
  });

  return NextResponse.json(
    { task, schedule: projectSchedule(projectId) },
    { status: 201 },
  );
}
