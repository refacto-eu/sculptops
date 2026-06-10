import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inviteTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const { id } = await params;

  const deleted = await db
    .delete(inviteTokens)
    .where(and(eq(inviteTokens.id, id), eq(inviteTokens.organizationId, ctx.org.id)))
    .returning();

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "invite", resourceId: id, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
