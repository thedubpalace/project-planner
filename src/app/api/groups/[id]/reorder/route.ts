import { NextResponse } from "next/server";
import { getGroup, listGroupsByProject, updateGroupSortOrder } from "@/lib/db";
import { projectSchedule } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const existing = getGroup(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const sortOrder = Number(body?.sortOrder);
  if (!Number.isFinite(sortOrder))
    return NextResponse.json({ error: "sortOrder must be a number" }, { status: 400 });

  updateGroupSortOrder(id, sortOrder);
  // Every member task denormalizes the group's sort_order — refresh the
  // schedule too so the frontend's task list re-sorts without a full reload.
  return NextResponse.json({
    group: getGroup(id),
    groups: listGroupsByProject(existing.projectId),
    schedule: projectSchedule(existing.projectId),
  });
}
