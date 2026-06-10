import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { playbooks, inventories, vaultPasswords, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { PlaybooksClient } from "@/components/playbooks/playbooks-client";
import { fetchCommunityData } from "@/lib/community-server";
import type { CommunityParams } from "@/lib/community-server";
import { safePlaybooks } from "@/lib/playbook-response";

interface Props {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    category?: string;
    tag?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function PlaybooksPage({ searchParams }: Props) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const params = await searchParams;
  const activeTab = params.tab === "community" ? "community" : "mine";

  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, ctx.userId),
    columns: { name: true, email: true },
  });

  const [playbookList, inventoryList, vaultList] = await Promise.all([
    db.query.playbooks.findMany({
      where: eq(playbooks.organizationId, ctx.org.id),
      orderBy: [desc(playbooks.updatedAt)],
      with: { creator: { columns: { name: true, email: true } } },
    }),
    db.select({ id: inventories.id, name: inventories.name })
      .from(inventories)
      .where(eq(inventories.organizationId, ctx.org.id)),
    db.select({ id: vaultPasswords.id, name: vaultPasswords.name })
      .from(vaultPasswords)
      .where(eq(vaultPasswords.organizationId, ctx.org.id)),
  ]);

  const communityParams: CommunityParams = {
    q:        params.q,
    category: params.category,
    tag:      params.tag,
    sort:     params.sort,
    page:     params.page,
  };

  const communityData = activeTab === "community"
    ? await fetchCommunityData(communityParams)
    : null;

  const normalized = safePlaybooks(playbookList).map((p) => ({
    ...p,
    tags: p.tags ?? [],
    creatorName: p.creator?.name ?? p.creator?.email ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Playbooks"
        description="Create and manage your Ansible playbooks"
      />
      <PlaybooksClient
        initialPlaybooks={normalized}
        inventories={inventoryList}
        vaultPasswords={vaultList}
        role={ctx.role as "admin" | "member" | "viewer"}
        currentUserId={ctx.userId}
        activeTab={activeTab}
        communityData={communityData}
        communityParams={communityParams}
      />
    </div>
  );
}
