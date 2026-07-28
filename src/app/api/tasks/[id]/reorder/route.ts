import { NextResponse } from "next/server";
import { getTask, updateTaskSortOrder } from "@/lib/db";
import { projectSchedule } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const existing = getTask(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const sortOrder = Number(body?.sortOrder);
  if (!Number.isFinite(sortOrder))
    return NextResponse.json({ error: "sortOrder must be a number" }, { status: 400 });

  updateTaskSortOrder(id, sortOrder);

  return NextResponse.json({
    task: getTask(id),
    schedule: projectSchedule(existing.projectId),
  });
}
