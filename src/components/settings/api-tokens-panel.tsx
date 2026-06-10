"use client";

import { useState } from "react";
import { Button, Chip } from "@heroui/react";
import { Plus, Trash2, Copy, Check, KeyRound, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { formatDate, copyToClipboard } from "@/lib/utils";

interface TokenItem {
  id: string;
  name: string;
  role: "admin" | "member" | "viewer";
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

interface Props {
  initialTokens: TokenItem[];
  userRole: "admin" | "member" | "viewer";
}

const ROLE_COLOR = { admin: "danger", member: "success", viewer: "default" } as const;

function resolveExpiry(days: number, hours: number, minutes: number): string | undefined {
  const total = days * 24 * 60 + hours * 60 + minutes;
  if (total <= 0) return undefined;
  return new Date(Date.now() + total * 60_000).toISOString();
}

export function ApiTokensPanel({ initialTokens, userRole }: Props) {
  const [tokens, setTokens] = useState<TokenItem[]>(initialTokens);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "member" as TokenItem["role"] });
  const [expiry, setExpiry] = useState({ days: "", hours: "", minutes: "" });
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = userRole !== "viewer";

  function openCreate() {
    setForm({ name: "", role: "member" });
    setExpiry({ days: "", hours: "", minutes: "" });
    setApiError(null);
    setIsOpen(true);
  }

  async function handleCreate() {
    if (!form.name.trim()) { setApiError("Name is required"); return; }
    setLoading(true);
    setApiError(null);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        role: form.role,
        expiresAt: resolveExpiry(parseInt(expiry.days) || 0, parseInt(expiry.hours) || 0, parseInt(expiry.minutes) || 0),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTokens(prev => [{ id: data.id, name: data.name, role: data.role, lastUsedAt: null, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null, createdAt: new Date(data.createdAt) }, ...prev]);
      setIsOpen(false);
      setCreatedToken(data.token);
    } else {
      setApiError(data.error ?? "Failed to create token");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/tokens/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setTokens(prev => prev.filter(t => t.id !== deleteId)); setDeleteId(null); }
  }

  function copyToken() {
    if (!createdToken) return;
    copyToClipboard(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 5000);
  }

  function isExpired(token: TokenItem): boolean {
    return !!token.expiresAt && new Date(token.expiresAt) < new Date();
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm text-th-muted">Use API tokens to authenticate requests from CI/CD pipelines, scripts, or external tools.</p>
          </div>
          {canCreate && (
            <Button size="sm" color="success" className="shrink-0 ml-4" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>
              New Token
            </Button>
          )}
        </div>

        {tokens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-th-subtle">
            <KeyRound className="h-8 w-8 opacity-30" />
            <p className="text-sm">No API tokens yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border-base/50">
            {tokens.map(token => (
              <div key={token.id} className="flex items-center justify-between py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <KeyRound className="h-4 w-4 text-th-subtle shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-th-primary truncate">{token.name}</span>
                      <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border-base bg-input text-th-muted capitalize">{token.role}</span>
                      {isExpired(token) && <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">expired</span>}
                    </div>
                    <p className="text-xs text-th-subtle mt-0.5">
                      {token.lastUsedAt ? `Last used ${formatDate(token.lastUsedAt)}` : "Never used"}
                      {token.expiresAt && !isExpired(token) && ` · Expires ${formatDate(token.expiresAt)}`}
                      {!token.expiresAt && " · Never expires"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(token.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-card border border-border-base p-3 text-xs text-th-subtle">
          <p>Use your token in the <code className="bg-input px-1 rounded">Authorization</code> header:</p>
          <code className="block mt-1 text-th-muted">Authorization: Bearer at_xxxxxxxxxxxx</code>
        </div>
      </div>

      {/* Create modal */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="New API Token" footer={
        <>
          <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
          <Button color="success" isLoading={loading} isDisabled={!form.name.trim()} onPress={handleCreate}>Create</Button>
        </>
      }>
        <div className="space-y-4">
          <FormError error={apiError} />
          <Field label="Token name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="GitHub Actions deploy" />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as TokenItem["role"] }))}
              className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
              {userRole === "admin" && <option value="admin">Admin — full access</option>}
              <option value="member">Member — run playbooks, edit resources</option>
              <option value="viewer">Viewer — read-only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Expiration <span className="text-th-subtle font-normal">(leave all at 0 for never)</span></label>
            <div className="grid grid-cols-3 gap-2">
              {(["days", "hours", "minutes"] as const).map(unit => (
                <div key={unit} className="flex flex-col gap-1">
                  <span className="text-xs text-th-subtle capitalize">{unit}</span>
                  <input
                    type="number"
                    min={0}
                    max={unit === "hours" ? 23 : unit === "minutes" ? 59 : undefined}
                    value={expiry[unit]}
                    onChange={e => setExpiry(prev => ({ ...prev, [unit]: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              ))}
            </div>
            {(parseInt(expiry.days) || 0) + (parseInt(expiry.hours) || 0) + (parseInt(expiry.minutes) || 0) > 0 && (
              <p className="text-xs text-th-subtle">
                Expires in {[
                  parseInt(expiry.days) > 0 && `${expiry.days}d`,
                  parseInt(expiry.hours) > 0 && `${expiry.hours}h`,
                  parseInt(expiry.minutes) > 0 && `${expiry.minutes}m`,
                ].filter(Boolean).join(" ")}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Show token once modal */}
      <Modal isOpen={!!createdToken} onClose={() => setCreatedToken(null)} title="Token created" size="sm" footer={
        <Button color="success" onPress={() => setCreatedToken(null)}>Done</Button>
      }>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Copy this token now — it will <strong>never be shown again</strong>.</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-card border border-border-base px-3 py-2 text-xs text-emerald-400 break-all font-mono">
              {createdToken}
            </code>
            <Button isIconOnly size="sm" variant="flat" color={copied ? "success" : "default"} onPress={copyToken}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revoke confirm */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Revoke token" size="sm" footer={
        <>
          <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
          <Button color="danger" onPress={handleDelete}>Revoke</Button>
        </>
      }>
        <p className="text-th-secondary">This token will stop working immediately. Any integration using it will fail.</p>
      </Modal>
    </>
  );
}
