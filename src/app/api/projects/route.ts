import { NextResponse } from "next/server";
import { createProject } from "@/lib/db";
import { dashboard } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(dashboard());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const deadline = typeof body?.deadline === "string" ? body.deadline : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline))
    return NextResponse.json({ error: "Valid deadline (YYYY-MM-DD) is required" }, { status: 400 });
  return NextResponse.json(createProject(name, deadline), { status: 201 });
}
