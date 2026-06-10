import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { inventories, servers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { InventoriesClient } from "@/components/inventories/inventories-client";

export default async function InventoriesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [inventoryList, serverList] = await Promise.all([
    db.query.inventories.findMany({
      where: eq(inventories.organizationId, ctx.org.id),
      orderBy: [desc(inventories.createdAt)],
      with: {
        groups: {
          with: { hosts: { with: { server: { columns: { id: true, name: true, host: true, organizationId: true } } } } },
        },
      },
    }),
    db
      .select({ id: servers.id, name: servers.name, host: servers.host })
      .from(servers)
      .where(eq(servers.organizationId, ctx.org.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventories"
        description="Group servers into inventories to target with playbooks"
      />
      <InventoriesClient
        initialInventories={inventoryList.map(inventory => ({
          ...inventory,
          groups: inventory.groups.map(group => ({
            ...group,
            hosts: group.hosts.filter(host => host.server.organizationId === ctx.org.id),
          })),
        })) as Parameters<typeof InventoriesClient>[0]["initialInventories"]}
        servers={serverList}
        role={ctx.role as "admin" | "member" | "viewer"}
      />
    </div>
  );
}
