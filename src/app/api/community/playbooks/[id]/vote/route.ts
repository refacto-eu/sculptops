import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!BASE) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);

  // Forward real IP so community-api deduplicates correctly
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";

  try {
    const res = await fetch(`${BASE}/api/playbooks/${id}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Community API unavailable" }, { status: 503 });
  }
}
