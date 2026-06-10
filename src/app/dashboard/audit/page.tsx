import { getAuthContext } from "@/lib/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { AuditClient } from "@/components/audit/audit-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AuditPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [rows, [{ total }], typeRows] = await Promise.all([
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
      .where(eq(auditLogs.organizationId, ctx.org.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE),
    db.select({ total: count() }).from(auditLogs).where(eq(auditLogs.organizationId, ctx.org.id)),
    // Distinct resource types for filter chips
    db
      .selectDistinct({ resourceType: auditLogs.resourceType })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, ctx.org.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="All actions performed in your organization." />
      <AuditClient
        initialItems={rows}
        initialTotal={total}
        resourceTypes={typeRows.map(r => r.resourceType)}
      />
    </div>
  );
}
