import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhookTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const { id } = await params;

  const [deleted] = await db
    .delete(webhookTokens)
    .where(and(eq(webhookTokens.id, id), eq(webhookTokens.organizationId, ctx.org.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "webhook", resourceId: id, resourceName: deleted.name, ipAddress: getClientIp(req) });
  return NextResponse.json({ ok: true });
}
