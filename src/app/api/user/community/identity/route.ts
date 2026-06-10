import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptFromString } from "@/lib/crypto";

const BASE       = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");
const SUBMIT_KEY = process.env.COMMUNITY_SUBMIT_KEY;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!BASE || !SUBMIT_KEY) return NextResponse.json({ verified: false });

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { communitySubmitToken: true },
  });

  if (!user?.communitySubmitToken) return NextResponse.json({ verified: false });

  try {
    const rawToken = decryptFromString(user.communitySubmitToken);
    const res = await fetch(`${BASE}/api/authors/me`, {
      headers: { "x-api-key": SUBMIT_KEY, "x-author-token": rawToken },
    });
    if (!res.ok) return NextResponse.json({ verified: false });
    const data = await res.json() as { identities: unknown[]; method: string };
    return NextResponse.json({ verified: true, identities: data.identities, method: data.method });
  } catch {
    return NextResponse.json({ verified: false });
  }
}
