import { NextResponse } from "next/server";

const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

export async function GET() {
  if (!BASE) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const res = await fetch(`${BASE}/api/categories`, { next: { revalidate: 300 } });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
