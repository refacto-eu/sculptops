"use client";

import { useState, useEffect } from "react";
import { Button, Chip } from "@heroui/react";
import { Link2, Copy, Trash2, Plus, Check, Mail, Send } from "lucide-react";
import { FormError } from "@/components/ui/form-error";
import { formatDate, copyToClipboard } from "@/lib/utils";
import type { MemberRole } from "@/lib/get-org";

interface Invite {
  id: string;
  /** Raw token — only present on invites created in this session; the server stores a hash. */
  token?: string;
  role: MemberRole;
  expiresAt: Date;
  createdAt: Date;
  createdByUser: { name: string | null; email: string } | null;
}

interface Props {
  initial: Invite[];
}

const ROLE_COLORS: Record<MemberRole, "warning" | "primary" | "default"> = {
  admin: "warning",
  member: "primary",
  viewer: "default",
};

export function InvitesPanel({ initial }: Props) {
  const [invites, setInvites] = useState<Invite[]>(initial);

  // Generate link state
  const [linkRole, setLinkRole] = useState<MemberRole>("member");
  const [linkCreating, setLinkCreating] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Send by email state
  const [emailRole, setEmailRole] = useState<MemberRole>("member");
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // Shared
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);

  function inviteUrl(token: string) {
    return `${origin}/register?invite=${token}`;
  }

  async function handleCopy(token: string) {
    copyToClipboard(inviteUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 5000);
  }

  async function handleGenerateLink() {
    setLinkCreating(true);
    setLinkError(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: linkRole, expiresInDays: 7 }),
    });
    if (res.ok) {
      const row = await res.json();
      setInvites(prev => [row, ...prev]);
    } else {
      const data = await res.json().catch(() => ({}));
      setLinkError(data.error ?? "Failed to create invite");
    }
    setLinkCreating(false);
  }

  async function handleSendEmail() {
    if (!emailTo.trim()) return;
    setEmailSending(true);
    setEmailError(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: emailRole, expiresInDays: 7, email: emailTo.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setInvites(prev => [data, ...prev]);
      if (data.emailError) {
        setEmailError(`Invite created but email failed: ${data.emailError}`);
      } else {
        setEmailSent(true);
        setEmailTo("");
        setTimeout(() => setEmailSent(false), 3000);
      }
    } else {
      setEmailError(data.error ?? "Failed to send invite");
    }
    setEmailSending(false);
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
    if (res.ok) setInvites(prev => prev.filter(i => i.id !== id));
    setRevoking(null);
  }

  return (
    <div className="space-y-5">

      {/* Generate link */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-th-muted uppercase tracking-wider">Generate a link</p>
        <div className="flex items-center gap-2">
          <select value={linkRole} onChange={e => setLinkRole(e.target.value as MemberRole)}
            className="w-32 shrink-0 rounded-lg bg-input border border-border-base px-3 py-1.5 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors">
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button size="sm" className="btn-secondary-outline shrink-0" isLoading={linkCreating}
            startContent={<Plus className="h-3.5 w-3.5" />} onPress={handleGenerateLink}>
            Generate link
          </Button>
        </div>
        <FormError error={linkError} />
      </div>

      {/* Send by email */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-th-muted uppercase tracking-wider">Send by email</p>
        <div className="flex items-center gap-2">
          <select value={emailRole} onChange={e => setEmailRole(e.target.value as MemberRole)}
            className="w-32 shrink-0 rounded-lg bg-input border border-border-base px-3 py-1.5 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors">
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <input
            type="email"
            value={emailTo}
            onChange={e => setEmailTo(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSendEmail()}
            placeholder="colleague@company.com"
            className="flex-1 rounded-lg bg-card border border-border-base px-3 py-1.5 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
          <Button size="sm" color="primary" className="shrink-0" isLoading={emailSending}
            isDisabled={!emailTo.trim()}
            startContent={emailSent ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            onPress={handleSendEmail}>
            {emailSent ? "Sent!" : "Send"}
          </Button>
        </div>
        <FormError error={emailError} />
      </div>

      {/* Active invite links */}
      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-th-muted uppercase tracking-wider">Active links</p>
          {invites.map(inv => (
            <div key={inv.id} className="flex items-center gap-3 rounded-lg bg-card border border-border-base/50 px-3 py-2.5">
              <Link2 className="h-4 w-4 text-th-subtle shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-th-muted font-mono truncate">
                  {inv.token ? inviteUrl(inv.token) : "Link visible only at creation — revoke and generate a new one if lost"}
                </p>
                <p className="text-xs text-th-subtle mt-0.5">
                  Expires {formatDate(inv.expiresAt)}
                  {inv.createdByUser && ` · by ${inv.createdByUser.name ?? inv.createdByUser.email}`}
                </p>
              </div>
              <Chip size="sm" color={ROLE_COLORS[inv.role]} variant="flat" className="capitalize shrink-0">
                {inv.role}
              </Chip>
              {inv.token && (
                <Button isIconOnly size="sm" variant="light" onPress={() => handleCopy(inv.token!)} title="Copy link">
                  {copied === inv.token ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button isIconOnly size="sm" variant="light" color="danger"
                isLoading={revoking === inv.id} onPress={() => handleRevoke(inv.id)} title="Revoke">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-th-subtle">Links expire after 7 days and can only be used once.</p>
    </div>
  );
}
