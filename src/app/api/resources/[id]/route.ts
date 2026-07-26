import { NextResponse } from "next/server";
import {
  countActiveAssignments,
  deleteResource,
  getResource,
  updateResource,
} from "@/lib/db";
import { resourceAssignments } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const resource = getResource(id);
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ resource, assignments: resourceAssignments(id) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const skills = Array.isArray(body?.skills)
    ? body.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
  const capacity = Number(body?.capacityHoursPerDay);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!Number.isFinite(capacity) || capacity <= 0)
    return NextResponse.json({ error: "Capacity must be a positive number" }, { status: 400 });
  const updated = updateResource(id, name, skills, capacity);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const active = countActiveAssignments(id);
  if (active > 0)
    return NextResponse.json(
      { error: `Resource is assigned to ${active} active task(s). Reassign or unassign first.` },
      { status: 409 },
    );
  deleteResource(id);
  return NextResponse.json({ ok: true });
}
