import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!BASE) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { id } = await params;
  try {
    const res = await fetch(`${BASE}/api/playbooks/${id}/download`);
    if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const yaml = await res.text();
    return new NextResponse(yaml, {
      headers: { "Content-Type": "text/yaml; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Community API unavailable" }, { status: 503 });
  }
}
