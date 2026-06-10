import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { schedules, playbooks, inventories, vaultPasswords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { SchedulesClient } from "@/components/schedules/schedules-client";

export default async function SchedulesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [rows, pbList, invList, vaultList] = await Promise.all([
    db.query.schedules.findMany({
      where: eq(schedules.organizationId, ctx.org.id),
      orderBy: [desc(schedules.createdAt)],
      with: {
        playbook: { columns: { id: true, name: true } },
        inventory: { columns: { id: true, name: true } },
      },
    }),
    db.query.playbooks.findMany({ where: eq(playbooks.organizationId, ctx.org.id) }),
    db.query.inventories.findMany({ where: eq(inventories.organizationId, ctx.org.id) }),
    db
      .select({ id: vaultPasswords.id, name: vaultPasswords.name })
      .from(vaultPasswords)
      .where(eq(vaultPasswords.organizationId, ctx.org.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Schedules" description="Run playbooks automatically on a cron schedule." />
      <SchedulesClient initialSchedules={rows as any} playbooks={pbList} inventories={invList} vaultPasswords={vaultList} role={ctx.role as "admin" | "member" | "viewer"} />
    </div>
  );
}
