"use client";

import { useState } from "react";
import { User, Shield, Palette, KeyRound, Building2, Bell, Mail, Info, BookOpen } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SecurityPanel } from "@/components/settings/security-panel";
import { NotificationsPanel } from "@/components/settings/notifications-panel";
import { ApiTokensPanel } from "@/components/settings/api-tokens-panel";
import { SmtpConfigPanel } from "@/components/settings/smtp-config-panel";
import { SmtpNotificationsPanel } from "@/components/settings/smtp-notifications-panel";
import { CommunityPanel } from "@/components/settings/community-panel";
interface NotifRow { channelType: string; webhookUrl: string | null; onFailure: boolean; onSuccess: boolean; enabled: boolean }
interface TokenItem { id: string; name: string; role: "admin" | "member" | "viewer"; lastUsedAt: Date | null; expiresAt: Date | null; createdAt: Date }
interface SmtpConfig { host: string; port: number; secure: boolean; username: string | null; fromAddress: string; fromName: string; recipients: string[]; onFailure: boolean; onSuccess: boolean; enabled: boolean }

interface Props {
  user: { name: string | null; email: string };
  org: { name: string; slug: string };
  role: "admin" | "member" | "viewer";
  notifSettings: NotifRow[];
  tokenList: TokenItem[];
  smtpConfig: SmtpConfig | null;
  communityTokenConfigured: boolean;
  communityConfigured: boolean;
}

const NAV = [
  { id: "account",       label: "Account",       icon: User },
  { id: "security",      label: "Security",       icon: Shield },
  { id: "appearance",    label: "Appearance",     icon: Palette },
  { id: "tokens",        label: "API Tokens",     icon: KeyRound },
  { id: "organization",  label: "Organization",   icon: Building2 },
  { id: "notifications", label: "Notifications",  icon: Bell },
  { id: "smtp",          label: "Email / SMTP",   icon: Mail },
  { id: "community",     label: "Community",      icon: BookOpen },
  { id: "about",         label: "About",          icon: Info },
] as const;

type Section = typeof NAV[number]["id"];

export function SettingsClient({ user, org, role, notifSettings, tokenList, smtpConfig, communityTokenConfigured, communityConfigured }: Props) {
  const [active, setActive] = useState<Section>("account");

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Vertical sidebar nav */}
      <aside className="w-48 shrink-0">
        <nav className="flex flex-col gap-0.5 sticky top-6">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full ${
                active === id
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "text-th-muted hover:text-th-secondary hover:bg-input"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content panel */}
      <div className="flex-1 min-w-0">
        {active === "account" && (
          <SectionCard title="Account">
            <div className="divide-y divide-border-base">
              <Row label="Name" value={user.name ?? "—"} />
              <Row label="Email" value={user.email} />
              <Row label="Role" value={<span className="capitalize">{role}</span>} />
            </div>
          </SectionCard>
        )}

        {active === "security" && (
          <SectionCard title="Security" description="Change your account password">
            <SecurityPanel />
          </SectionCard>
        )}

        {active === "appearance" && (
          <SectionCard title="Appearance" description="Choose your preferred color theme">
            <ThemeToggle />
          </SectionCard>
        )}

        {active === "tokens" && (
          <SectionCard title="API Tokens" description="Personal access tokens for programmatic API access">
            <ApiTokensPanel
              initialTokens={tokenList}
              userRole={role}
            />
          </SectionCard>
        )}

        {active === "organization" && (
          <SectionCard title="Organization">
            <div className="divide-y divide-border-base">
              <Row label="Name" value={org.name} />
              <Row label="Slug" value={<span className="font-mono">{org.slug}</span>} />
            </div>
          </SectionCard>
        )}

        {active === "notifications" && (
          <div className="space-y-6">
            <SectionCard title="Webhook Notifications" description="Slack, Discord, or generic webhook alerts for execution events">
              <NotificationsPanel configs={notifSettings} isAdmin={role === "admin"} />
            </SectionCard>
            <SectionCard title="Email Notifications" description="Send execution alerts by email — requires SMTP to be configured">
              <SmtpNotificationsPanel
                initial={smtpConfig ? {
                  enabled: smtpConfig.enabled,
                  recipients: smtpConfig.recipients ?? [],
                  onFailure: smtpConfig.onFailure,
                  onSuccess: smtpConfig.onSuccess,
                } : null}
                isAdmin={role === "admin"}
                smtpConfigured={!!smtpConfig?.host}
              />
            </SectionCard>
          </div>
        )}

        {active === "smtp" && (
          <SectionCard title="SMTP Configuration" description="Server settings used to send all outgoing emails">
            <SmtpConfigPanel
              initial={smtpConfig ? {
                host: smtpConfig.host,
                port: smtpConfig.port,
                secure: smtpConfig.secure,
                username: smtpConfig.username ?? null,
                fromAddress: smtpConfig.fromAddress,
                fromName: smtpConfig.fromName,
              } : null}
              isAdmin={role === "admin"}
            />
          </SectionCard>
        )}

        {active === "community" && (
          <SectionCard title="Community">
            <CommunityPanel
              initialConfigured={communityTokenConfigured}
              communityConfigured={communityConfigured}
            />
          </SectionCard>
        )}

        {active === "about" && (
          <SectionCard title="About">
            <Row label="Version" value={<span className="font-mono">0.1.0</span>} />
            <Row label="Publisher" value="© 2026 Refacto" />
            <Row label="License" value={<a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">GNU Affero General Public License v3.0 (AGPL-3.0)</a>} />
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border-base rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border-base">
        <h2 className="font-semibold text-th-primary">{title}</h2>
        {description && <p className="text-xs text-th-subtle mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-3">
      <span className="text-th-muted text-sm">{label}</span>
      <span className="text-th-primary text-sm">{value}</span>
    </div>
  );
}
