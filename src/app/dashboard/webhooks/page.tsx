import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { webhookTokens, playbooks, inventories } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { WebhooksClient } from "@/components/webhooks/webhooks-client";

export default async function WebhooksPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [rows, pbList, invList] = await Promise.all([
    db.query.webhookTokens.findMany({
      where: eq(webhookTokens.organizationId, ctx.org.id),
      orderBy: [desc(webhookTokens.createdAt)],
      columns: { tokenHash: false },
      with: {
        playbook: { columns: { id: true, name: true } },
        inventory: { columns: { id: true, name: true } },
      },
    }),
    db.query.playbooks.findMany({ where: eq(playbooks.organizationId, ctx.org.id) }),
    db.query.inventories.findMany({ where: eq(inventories.organizationId, ctx.org.id) }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Trigger playbook executions via HTTP POST from any CI/CD pipeline or external tool."
      />
      <WebhooksClient
        initialWebhooks={rows as any}
        playbooks={pbList}
        inventories={invList}
        role={ctx.role as "admin" | "member" | "viewer"}
      />
    </div>
  );
}
