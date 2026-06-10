import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const type = req.nextUrl.searchParams.get("type") ?? "";
  const offset = (page - 1) * PAGE_SIZE;

  const where = type
    ? and(eq(auditLogs.organizationId, ctx.org.id), eq(auditLogs.resourceType, type))
    : eq(auditLogs.organizationId, ctx.org.id);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        resourceName: auditLogs.resourceName,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);

  return NextResponse.json({ items: rows, total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}
