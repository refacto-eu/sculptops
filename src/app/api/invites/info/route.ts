import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inviteTokens } from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { hashToken } from "@/lib/api-token";

// Public endpoint — no auth. Used by register page to show org name.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const invite = await db.query.inviteTokens.findFirst({
    where: and(
      eq(inviteTokens.tokenHash, hashToken(token)),
      isNull(inviteTokens.usedAt),
      gt(inviteTokens.expiresAt, new Date()),
    ),
    with: { organization: { columns: { name: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });

  return NextResponse.json({
    role: invite.role,
    orgName: invite.organization.name,
    expiresAt: invite.expiresAt,
  });
}
