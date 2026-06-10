import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { servers, sshKeys } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { ServersClient } from "@/components/servers/servers-client";

export default async function ServersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [serverList, sshKeyList] = await Promise.all([
    db.query.servers.findMany({
      where: eq(servers.organizationId, ctx.org.id),
      orderBy: [desc(servers.createdAt)],
      with: { sshKey: { columns: { id: true, name: true } } },
    }),
    db.query.sshKeys.findMany({
      where: eq(sshKeys.organizationId, ctx.org.id),
      columns: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        description="Manage your infrastructure servers and SSH connections"
      />
      <ServersClient
        initialServers={serverList as Parameters<typeof ServersClient>[0]["initialServers"]}
        sshKeys={sshKeyList}
        role={ctx.role as "admin" | "member" | "viewer"}
      />
    </div>
  );
}
