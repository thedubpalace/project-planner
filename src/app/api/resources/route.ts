import { NextResponse } from "next/server";
import { createResource } from "@/lib/db";
import { resourceLoads } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(resourceLoads());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const skills = Array.isArray(body?.skills)
    ? body.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
  const capacity = Number(body?.capacityHoursPerDay);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!Number.isFinite(capacity) || capacity <= 0)
    return NextResponse.json({ error: "Capacity must be a positive number" }, { status: 400 });
  return NextResponse.json(createResource(name, skills, capacity), { status: 201 });
}
