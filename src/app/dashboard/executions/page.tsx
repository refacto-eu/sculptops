import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { executions, playbooks, inventories, servers, vaultPasswords } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { ExecutionsClient } from "@/components/executions/executions-client";

const PAGE_SIZE = 25;

export default async function ExecutionsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [executionList, [{ total }], playbookList, inventoryList, serverList, vaultList] = await Promise.all([
    db.query.executions.findMany({
      where: eq(executions.organizationId, ctx.org.id),
      orderBy: [desc(executions.createdAt)],
      with: {
        playbook: { columns: { id: true, name: true } },
        inventory: { columns: { id: true, name: true } },
      },
      limit: PAGE_SIZE,
    }),
    db.select({ total: count() }).from(executions).where(eq(executions.organizationId, ctx.org.id)),
    db.select({ id: playbooks.id, name: playbooks.name }).from(playbooks).where(eq(playbooks.organizationId, ctx.org.id)),
    db.select({ id: inventories.id, name: inventories.name }).from(inventories).where(eq(inventories.organizationId, ctx.org.id)),
    db.select({ id: servers.id, name: servers.name, host: servers.host }).from(servers).where(eq(servers.organizationId, ctx.org.id)),
    db.select({ id: vaultPasswords.id, name: vaultPasswords.name }).from(vaultPasswords).where(eq(vaultPasswords.organizationId, ctx.org.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executions"
        description="Run playbooks against your inventories and view live logs"
      />
      <ExecutionsClient
        initialExecutions={executionList as Parameters<typeof ExecutionsClient>[0]["initialExecutions"]}
        initialTotal={total}
        playbooks={playbookList}
        inventories={inventoryList}
        servers={serverList}
        vaultPasswords={vaultList}
        role={ctx.role as "admin" | "member" | "viewer"}
      />
    </div>
  );
}
