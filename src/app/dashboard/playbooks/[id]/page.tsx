import { redirect, notFound } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { playbooks, playbookVersions, inventories, vaultPasswords } from "@/lib/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { PlaybookEditor } from "@/components/playbooks/playbook-editor";
import { safePlaybook } from "@/lib/playbook-response";

export default async function PlaybookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const playbook = await db.query.playbooks.findFirst({
    where: and(eq(playbooks.id, id), eq(playbooks.organizationId, ctx.org.id)),
  });
  if (!playbook) notFound();

  const [versions, inventoryList, vaultList] = await Promise.all([
    db.query.playbookVersions.findMany({
      where: eq(playbookVersions.playbookId, id),
      orderBy: [desc(playbookVersions.version)],
      limit: 50,
      with: { changedByUser: { columns: { id: true, name: true, email: true } } },
    }),
    db.select({ id: inventories.id, name: inventories.name })
      .from(inventories)
      .where(eq(inventories.organizationId, ctx.org.id))
      .orderBy(asc(inventories.name)),
    db
      .select({ id: vaultPasswords.id, name: vaultPasswords.name })
      .from(vaultPasswords)
      .where(eq(vaultPasswords.organizationId, ctx.org.id)),
  ]);

  return (
    <PlaybookEditor
      playbook={safePlaybook(playbook)}
      versions={versions}
      inventories={inventoryList}
      vaultPasswords={vaultList}
      canRun={ctx.role !== "viewer"}
    />
  );
}
