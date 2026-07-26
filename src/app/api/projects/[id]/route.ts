import { NextResponse } from "next/server";
import { deleteProject, getProject, listResources, updateProject } from "@/lib/db";
import { projectSchedule } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    project,
    schedule: projectSchedule(id),
    resources: listResources(),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const deadline = typeof body?.deadline === "string" ? body.deadline : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline))
    return NextResponse.json({ error: "Valid deadline is required" }, { status: 400 });
  const updated = updateProject(id, name, deadline);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  deleteProject(id);
  return NextResponse.json({ ok: true });
}
