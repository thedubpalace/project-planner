import { NextResponse } from "next/server";
import { deleteGroup, getGroup, listGroupsByProject, renameGroup } from "@/lib/db";
import { projectSchedule } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const existing = getGroup(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Group name is required" }, { status: 400 });

  renameGroup(id, name);
  // Every member task denormalizes the group's name — refresh the schedule
  // too so the frontend doesn't show a stale name until the next full fetch.
  return NextResponse.json({
    group: getGroup(id),
    groups: listGroupsByProject(existing.projectId),
    schedule: projectSchedule(existing.projectId),
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const existing = getGroup(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  deleteGroup(id);
  return NextResponse.json({
    ok: true,
    groups: listGroupsByProject(existing.projectId),
    schedule: projectSchedule(existing.projectId),
  });
}
