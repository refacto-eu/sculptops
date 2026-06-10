import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!BASE) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

  try {
    const res = await fetch(`${BASE}/api/playbooks/${id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
