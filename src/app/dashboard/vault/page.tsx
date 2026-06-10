import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { vaultPasswords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { VaultClient } from "@/components/vault/vault-client";

export default async function VaultPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const items = await db.query.vaultPasswords.findMany({
    where: eq(vaultPasswords.organizationId, ctx.org.id),
    orderBy: [desc(vaultPasswords.createdAt)],
    columns: {
      id: true, name: true, description: true,
      provider: true, createdAt: true, updatedAt: true,
      encryptedPassword: false, iv: false, authTag: false,
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vault Passwords"
        description="Store encrypted Ansible Vault passwords and use them at execution time without exposing secrets."
      />
      <VaultClient
        initialVaultPasswords={items as Parameters<typeof VaultClient>[0]["initialVaultPasswords"]}
        role={ctx.role as "admin" | "member" | "viewer"}
      />
    </div>
  );
}
