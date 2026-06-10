import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { sshKeys } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { SshKeysClient } from "@/components/servers/ssh-keys-client";

export default async function SshKeysPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const keys = await db
    .select({
      id: sshKeys.id,
      name: sshKeys.name,
      fingerprint: sshKeys.fingerprint,
      publicKey: sshKeys.publicKey,
      createdAt: sshKeys.createdAt,
      updatedAt: sshKeys.updatedAt,
    })
    .from(sshKeys)
    .where(eq(sshKeys.organizationId, ctx.org.id))
    .orderBy(desc(sshKeys.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader
        title="SSH Keys"
        description="Manage SSH keys used to connect to your servers"
      />
      <SshKeysClient initialKeys={keys} role={ctx.role as "admin" | "member" | "viewer"} />
    </div>
  );
}
