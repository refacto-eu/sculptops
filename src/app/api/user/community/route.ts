import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptToString, decryptFromString } from "@/lib/crypto";

// GET — is a token configured?
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { communitySubmitToken: true },
  });

  return NextResponse.json({ configured: !!user?.communitySubmitToken });
}

// POST — save token
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json().catch(() => ({})) as { token?: string };
  if (!token?.trim()) return NextResponse.json({ error: "Token is required" }, { status: 422 });

  await db.update(users)
    .set({ communitySubmitToken: encryptToString(token.trim()) })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}

// DELETE — remove token
export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.update(users)
    .set({ communitySubmitToken: null })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
