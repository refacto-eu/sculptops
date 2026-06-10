import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admins can revoke any org token; members can only revoke their own
  const isAdmin = ctx.role === "admin";
  const ownershipFilter = isAdmin
    ? eq(apiTokens.organizationId, ctx.org.id)
    : and(eq(apiTokens.organizationId, ctx.org.id), eq(apiTokens.createdBy, ctx.userId));

  const [deleted] = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), ownershipFilter))
    .returning({ id: apiTokens.id, name: apiTokens.name });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({
    organizationId: ctx.org.id,
    userId: ctx.userId,
    action: "deleted",
    resourceType: "api_token",
    resourceId: deleted.id,
    resourceName: deleted.name,
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}
