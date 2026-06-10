"use client";

import { useState } from "react";
import {
  Button, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, SelectField } from "@/components/ui/field";
import { Webhook, Plus, Trash2, Copy, Check, ExternalLink, GitBranch } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { formatDate, copyToClipboard } from "@/lib/utils";

interface RefItem { id: string; name: string }
interface WebhookItem {
  id: string;
  name: string;
  token?: string;
  gitBranch: string | null;
  options: { dryRun?: boolean; tags?: string[]; limitHosts?: string; extraVars?: Record<string, string> };
  lastTriggeredAt: Date | null;
  triggerCount: number;
  playbook: RefItem | null;
  inventory: RefItem | null;
}
interface Props {
  initialWebhooks: WebhookItem[];
  playbooks: RefItem[];
  inventories: RefItem[];
  role: "admin" | "member" | "viewer";
}

const defaultForm = { name: "", playbookId: "", inventoryId: "", gitBranch: "", dryRun: false, tags: "", limitHosts: "" };

function triggerUrl(token: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/api/webhooks/trigger/${token}`;
}

export function WebhooksClient({ initialWebhooks, playbooks, inventories, role }: Props) {
  const canWrite = role !== "viewer";
  const [webhooks, setWebhooks] = useState<WebhookItem[]>(initialWebhooks);
  const [form, setForm] = useState(defaultForm);
  const [isOpen, setIsOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  function openCreate() { setForm(defaultForm); setErrors({}); setApiError(null); setIsOpen(true); }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.playbookId) e.playbookId = "Playbook is required";
    if (!form.inventoryId) e.inventoryId = "Inventory is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    const payload = {
      name: form.name,
      playbookId: form.playbookId,
      inventoryId: form.inventoryId,
      gitBranch: form.gitBranch.trim() || undefined,
      options: {
        dryRun: form.dryRun,
        tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        limitHosts: form.limitHosts || undefined,
        extraVars: {},
      },
    };
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) setCreatedUrl(triggerUrl(data.token));
      const { token: _token, ...safeWebhook } = data;
      setWebhooks(prev => [safeWebhook, ...prev]);
      setIsOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/webhooks/${deleteId}`, { method: "DELETE" });
    if (res.ok) setWebhooks(prev => prev.filter(w => w.id !== deleteId));
    setDeleteId(null);
  }

  async function copyUrl(token: string, id: string) {
    copyToClipboard(triggerUrl(token));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 5000);
  }

  return (
    <>
      <div className="flex justify-end">
        {canWrite && (
          <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>
            New Webhook
          </Button>
        )}
      </div>

      {webhooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No webhooks yet"
          description="Create a webhook to trigger playbook executions from CI/CD pipelines or external tools."
          action={canWrite ? { label: "New Webhook", onClick: openCreate } : undefined}
        />
      ) : (
        <Table aria-label="Webhooks" classNames={{ wrapper: "bg-card border border-border-base", th: "bg-input text-th-secondary !px-3 !text-left", td: "text-th-secondary !px-3 !text-left" }}>
          <TableHeader>
            <TableColumn>NAME</TableColumn>
            <TableColumn>PLAYBOOK</TableColumn>
            <TableColumn>INVENTORY</TableColumn>
            <TableColumn>TRIGGERS</TableColumn>
            <TableColumn>LAST TRIGGERED</TableColumn>
            <TableColumn>OPTIONS</TableColumn>
            <TableColumn>GIT BRANCH</TableColumn>
            <TableColumn>ACTIONS</TableColumn>
          </TableHeader>
          <TableBody>
            {webhooks.map(w => (
              <TableRow key={w.id}>
                <TableCell className="font-medium text-th-primary">{w.name}</TableCell>
                <TableCell className="text-th-secondary">{w.playbook?.name ?? <span className="text-th-subtle">—</span>}</TableCell>
                <TableCell className="text-th-secondary">{w.inventory?.name ?? <span className="text-th-subtle">—</span>}</TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={w.triggerCount > 0 ? "success" : "default"}>
                    {w.triggerCount}
                  </Chip>
                </TableCell>
                <TableCell className="text-th-muted text-sm">
                  {w.lastTriggeredAt ? formatDate(new Date(w.lastTriggeredAt)) : <span className="text-th-subtle">Never</span>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {w.options?.dryRun && <Chip size="sm" variant="flat" color="warning">dry-run</Chip>}
                    {w.options?.tags?.length ? <Chip size="sm" variant="flat">{w.options.tags.join(", ")}</Chip> : null}
                    {w.options?.limitHosts && <Chip size="sm" variant="flat">{w.options.limitHosts}</Chip>}
                  </div>
                </TableCell>
                <TableCell>
                  {w.gitBranch
                    ? <span className="flex items-center gap-1 text-xs text-th-secondary"><GitBranch className="h-3 w-3 text-th-subtle" />{w.gitBranch}</span>
                    : <span className="text-th-subtle text-xs">any</span>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {w.token && (
                      <Tip content={copiedId === w.id ? "Copied!" : "Copy trigger URL"} placement="bottom">
                        <Button
                          isIconOnly size="sm" variant="flat"
                          color={copiedId === w.id ? "success" : "default"}
                          onPress={() => copyUrl(w.token!, w.id)}
                          className="hover:!bg-zinc-500/15 transition-colors"
                        >
                          {copiedId === w.id
                            ? <Check className="h-3.5 w-3.5" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </Tip>
                    )}
                    <Tip content="View in executions" placement="bottom">
                      <Button isIconOnly size="sm" variant="flat" as="a" href="/dashboard/executions" className="hover:!bg-zinc-500/15 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Tip>
                    {canWrite && (
                      <Tip content="Delete webhook" color="danger" placement="bottom">
                        <Button isIconOnly size="sm" variant="flat" color="danger" onPress={() => setDeleteId(w.id)} className="hover:!bg-red-500/15 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </Tip>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Usage hint */}
      {webhooks.length > 0 && (
        <div className="rounded-lg border border-border-base bg-card p-4 text-sm text-th-muted space-y-2">
          <p className="font-medium text-th-secondary">How to use</p>
          <p>Send a <code className="text-emerald-400 bg-input px-1 rounded">POST</code> request to the webhook URL. No authentication required.</p>
          <pre className="bg-page rounded p-3 text-xs overflow-x-auto text-th-secondary">
{`curl -X POST "${triggerUrl("<token>")}" \\
  -H "Content-Type: application/json" \\
  -d '{"extraVars": {"env": "production"}}'`}
          </pre>
          <p className="text-th-subtle text-xs">
            Optional body fields: <code className="text-th-muted">dryRun</code>, <code className="text-th-muted">tags</code>, <code className="text-th-muted">limitHosts</code>, <code className="text-th-muted">extraVars</code> — override the webhook defaults.
          </p>
          <p className="font-medium text-th-secondary pt-1">GitHub / GitLab push trigger</p>
          <p>Point a GitHub or GitLab webhook directly at this URL — no extra configuration needed. When a <code className="text-emerald-400 bg-input px-1 rounded">push</code> event arrives the playbook is auto-synced from Git then executed. Set a <span className="text-th-secondary">Git branch filter</span> to only run on a specific branch (e.g. <code className="text-th-muted">main</code>).</p>
        </div>
      )}

      <Modal isOpen={!!createdUrl} onClose={() => setCreatedUrl(null)} title="Webhook created">
        <div className="space-y-4">
          <p className="text-sm text-th-secondary">Copy this trigger URL now. It will not be shown again.</p>
          <pre className="bg-page rounded p-3 text-xs overflow-x-auto text-th-secondary">{createdUrl}</pre>
          <div className="flex justify-end gap-2">
            <Button variant="flat" onPress={() => setCreatedUrl(null)}>Close</Button>
            <Button color="primary" startContent={<Copy className="h-4 w-4" />} onPress={() => createdUrl && copyToClipboard(createdUrl)}>
              Copy URL
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create modal */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="New Webhook">
        <div className="space-y-4">
          <FormError error={apiError} />
          <Field
            label="Name"
            placeholder="e.g. Deploy production"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            error={errors.name}
          />
          <SelectField label="Playbook" value={form.playbookId} onChange={v => setForm(f => ({ ...f, playbookId: v }))} error={errors.playbookId}>
            <option value="">Select a playbook…</option>
            {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
          <SelectField label="Inventory" value={form.inventoryId} onChange={v => setForm(f => ({ ...f, inventoryId: v }))} error={errors.inventoryId}>
            <option value="">Select an inventory…</option>
            {inventories.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </SelectField>
          <div className="flex flex-col gap-1.5">
            <Field
              label="Git branch filter (optional)"
              placeholder="main"
              value={form.gitBranch}
              onChange={e => setForm(f => ({ ...f, gitBranch: e.target.value }))}
            />
            <p className="text-xs text-th-subtle">For GitHub/GitLab push events — only trigger on this branch. Leave empty to trigger on any branch.</p>
          </div>
          <Field
            label="Tags (optional, comma-separated)"
            placeholder="deploy, migrate"
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
          />
          <Field
            label="Limit hosts (optional)"
            placeholder="webservers"
            value={form.limitHosts}
            onChange={e => setForm(f => ({ ...f, limitHosts: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-th-secondary cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={form.dryRun}
              onChange={e => setForm(f => ({ ...f, dryRun: e.target.checked }))}
            />
            Dry run by default
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="flat" onPress={() => setIsOpen(false)}>Cancel</Button>
            <Button
              color="primary"
              isLoading={loading}
              onPress={handleSave}
            >
              Create Webhook
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Webhook">
        <p className="text-th-secondary mb-6">This will permanently delete the webhook. Any CI/CD jobs using this token will stop working.</p>
        <div className="flex justify-end gap-2">
          <Button variant="flat" onPress={() => setDeleteId(null)}>Cancel</Button>
          <Button color="danger" onPress={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}
