import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { db } from "@/lib/db";
import { users, notificationSettings, apiTokens, smtpSettings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const [user, notifSettingsList, tokenList, smtpConfig] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      columns: { id: true, name: true, email: true, communitySubmitToken: true },
    }),
    db.query.notificationSettings.findMany({
      where: eq(notificationSettings.organizationId, ctx.org.id),
    }),
    db.query.apiTokens.findMany({
      where: and(eq(apiTokens.organizationId, ctx.org.id), eq(apiTokens.createdBy, ctx.userId)),
      columns: { id: true, name: true, role: true, lastUsedAt: true, expiresAt: true, createdAt: true, tokenHash: false },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
    db.query.smtpSettings.findFirst({
      where: eq(smtpSettings.organizationId, ctx.org.id),
      columns: {
        host: true, port: true, secure: true, username: true,
        fromAddress: true, fromName: true, recipients: true,
        onFailure: true, onSuccess: true, enabled: true,
        encryptedPassword: false, iv: false, authTag: false,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Account and organization configuration" />
      <SettingsClient
        user={{ name: user?.name ?? null, email: user?.email ?? "" }}
        org={{ name: ctx.org.name, slug: ctx.org.slug }}
        role={ctx.role as "admin" | "member" | "viewer"}
        notifSettings={
          ctx.role === "admin"
            ? notifSettingsList
            : notifSettingsList.map(row => ({ ...row, webhookUrl: null }))
        }
        tokenList={tokenList as Parameters<typeof SettingsClient>[0]["tokenList"]}
        communityTokenConfigured={!!user?.communitySubmitToken}
        communityConfigured={!!process.env.COMMUNITY_API_URL}
        smtpConfig={smtpConfig ? {
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          username: smtpConfig.username ?? null,
          fromAddress: smtpConfig.fromAddress,
          fromName: smtpConfig.fromName,
          recipients: smtpConfig.recipients ?? [],
          onFailure: smtpConfig.onFailure,
          onSuccess: smtpConfig.onSuccess,
          enabled: smtpConfig.enabled,
        } : null}
      />
    </div>
  );
}
