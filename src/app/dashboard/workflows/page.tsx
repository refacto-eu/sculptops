import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { workflows, workflowSteps, playbooks, inventories } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowsClient } from "@/components/workflows/workflows-client";

export default async function WorkflowsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [workflowList, playbookList, inventoryList] = await Promise.all([
    db.query.workflows.findMany({
      where: eq(workflows.organizationId, ctx.org.id),
      orderBy: [desc(workflows.updatedAt)],
      with: {
        steps: {
          orderBy: [asc(workflowSteps.position)],
          with: {
            playbook: { columns: { id: true, name: true } },
            inventory: { columns: { id: true, name: true } },
          },
        },
      },
    }),
    db.select({ id: playbooks.id, name: playbooks.name }).from(playbooks).where(eq(playbooks.organizationId, ctx.org.id)),
    db.select({ id: inventories.id, name: inventories.name }).from(inventories).where(eq(inventories.organizationId, ctx.org.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        description="Chain playbooks into automated multi-step sequences"
      />
      <WorkflowsClient
        initialWorkflows={workflowList as any}
        playbooks={playbookList}
        inventories={inventoryList}
        role={ctx.role as "admin" | "member" | "viewer"}
      />
    </div>
  );
}
