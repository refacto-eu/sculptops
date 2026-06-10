import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!BASE) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await params;
  try {
    const res = await fetch(`${BASE}/api/playbooks/${id}`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
