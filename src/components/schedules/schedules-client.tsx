"use client";

import { useState } from "react";
import { Button, Chip, Switch, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, SelectField } from "@/components/ui/field";
import { Clock, Plus, Trash2, Pencil, Play } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { formatDate } from "@/lib/utils";
import { LogViewer } from "@/components/executions/log-viewer";

interface RefItem { id: string; name: string }
interface ScheduleItem {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  options: { dryRun?: boolean; tags?: string[]; limitHosts?: string; extraVars?: Record<string, string> };
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  playbook: RefItem | null;
  inventory: RefItem | null;
}
interface Props { initialSchedules: ScheduleItem[]; playbooks: RefItem[]; inventories: RefItem[]; vaultPasswords: RefItem[]; role: "admin" | "member" | "viewer" }

const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every day at 2am", value: "0 2 * * *" },
  { label: "Every Monday at 8am", value: "0 8 * * 1" },
  { label: "Every Sunday at 3am", value: "0 3 * * 0" },
];

const defaultForm = { name: "", playbookId: "", inventoryId: "", cronExpression: "0 2 * * *", dryRun: false, tags: "", limitHosts: "", vaultPasswordId: "" };

export function SchedulesClient({ initialSchedules, playbooks, inventories, vaultPasswords, role }: Props) {
  const canWrite = role !== "viewer";
  const [schedules, setSchedules] = useState<ScheduleItem[]>(initialSchedules);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [runningNowId, setRunningNowId] = useState<string | null>(null);
  const [runNowExecId, setRunNowExecId] = useState<string | null>(null);

  function openCreate() { setEditingId(null); setForm(defaultForm); setErrors({}); setApiError(null); setIsOpen(true); }
  function openEdit(s: ScheduleItem) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      playbookId: s.playbook?.id ?? "",
      inventoryId: s.inventory?.id ?? "",
      cronExpression: s.cronExpression,
      dryRun: s.options?.dryRun ?? false,
      tags: s.options?.tags?.join(", ") ?? "",
      limitHosts: s.options?.limitHosts ?? "",
      vaultPasswordId: (s.options as any)?.vaultPasswordId ?? "",
    });
    setErrors({});
    setApiError(null);
    setIsOpen(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.playbookId) e.playbookId = "Playbook is required";
    if (!form.inventoryId) e.inventoryId = "Inventory is required";
    if (!form.cronExpression.trim()) e.cronExpression = "Cron expression is required";
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
      cronExpression: form.cronExpression,
      options: {
        dryRun: form.dryRun,
        tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        limitHosts: form.limitHosts || undefined,
        extraVars: {},
        vaultPasswordId: form.vaultPasswordId || undefined,
      },
    };
    const url = editingId ? `/api/schedules/${editingId}` : "/api/schedules";
    const res = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      const data = await res.json();
      setSchedules(prev => editingId ? prev.map(s => s.id === editingId ? { ...s, ...data } : s) : [data, ...prev]);
      setIsOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleToggle(id: string, enabled: boolean) {
    setTogglingId(id);
    const res = await fetch(`/api/schedules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    if (res.ok) setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
    setTogglingId(null);
  }

  async function handleRunNow(s: ScheduleItem) {
    if (!s.playbook || !s.inventory) return;
    setRunningNowId(s.id);
    const res = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playbookId: s.playbook.id, inventoryId: s.inventory.id, options: s.options ?? {} }),
    });
    if (res.ok) {
      const data = await res.json();
      setRunNowExecId(data.id);
    }
    setRunningNowId(null);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/schedules/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setSchedules(prev => prev.filter(s => s.id !== deleteId)); setDeleteId(null); }
  }

  const filtered = schedules.filter(s => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.playbook?.name.toLowerCase().includes(q) || s.inventory?.name.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search schedules…" className="max-w-xs" />
        {canWrite && (
          <Button className="btn-primary ml-auto" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>New Schedule</Button>
        )}
      </div>

      {schedules.length === 0 ? (
        <EmptyState icon={Clock} title="No schedules yet" description="Automate playbook runs on a recurring cron schedule." action={canWrite ? { label: "New Schedule", onClick: openCreate } : undefined} />
      ) : (
        <div className="bg-card border border-border-base rounded-xl overflow-hidden">
          <Table removeWrapper aria-label="Schedules" classNames={{ th: "bg-input text-th-secondary !px-3 !text-left", td: "text-th-secondary !px-3 !text-left" }}>
            <TableHeader>
              <TableColumn>NAME</TableColumn>
              <TableColumn>PLAYBOOK</TableColumn>
              <TableColumn>INVENTORY</TableColumn>
              <TableColumn>CRON</TableColumn>
              <TableColumn>LAST RUN</TableColumn>
              <TableColumn>NEXT RUN</TableColumn>
              <TableColumn>ENABLED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent={search ? `No schedules match "${search}"` : "No schedules"}>
              {filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.playbook?.name ?? <span className="text-th-subtle">Deleted</span>}</TableCell>
                  <TableCell>{s.inventory?.name ?? <span className="text-th-subtle">Deleted</span>}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-input px-2 py-0.5 rounded text-emerald-300">{s.cronExpression}</code>
                  </TableCell>
                  <TableCell className="text-th-muted text-sm">{s.lastRunAt ? formatDate(s.lastRunAt) : "—"}</TableCell>
                  <TableCell className="text-th-muted text-sm">{s.nextRunAt ? formatDate(s.nextRunAt) : "—"}</TableCell>
                  <TableCell>
                    <Switch
                      size="sm"
                      isSelected={s.enabled}
                      isDisabled={!canWrite || togglingId === s.id}
                      onValueChange={v => canWrite && handleToggle(s.id, v)}
                      color="success"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {canWrite && s.playbook && s.inventory && (
                        <Tip content="Run now" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" color="success" isLoading={runningNowId === s.id} onPress={() => handleRunNow(s)} className="hover:!bg-emerald-500/15 transition-colors">
                            <Play className="h-3.5 w-3.5 fill-emerald-400" />
                          </Button>
                        </Tip>
                      )}
                      {canWrite && <Tip content="Edit" placement="bottom"><Button isIconOnly size="sm" variant="light" onPress={() => openEdit(s)} className="hover:!bg-zinc-500/15 transition-colors"><Pencil className="h-3.5 w-3.5" /></Button></Tip>}
                      {canWrite && <Tip content="Delete" color="danger" placement="bottom"><Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(s.id)} className="hover:!bg-red-500/15 transition-colors"><Trash2 className="h-3.5 w-3.5" /></Button></Tip>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingId ? "Edit Schedule" : "New Schedule"} size="lg" footer={
        <>
          <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
          <Button color="success" isLoading={loading} onPress={handleSave}>
            {editingId ? "Save" : "Create"}
          </Button>
        </>
      }>
        <div className="space-y-4">
          <FormError error={apiError} />
          <Field label="Schedule name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nightly deploy" error={errors.name} />

          <SelectField label="Playbook" value={form.playbookId} onChange={v => setForm({ ...form, playbookId: v })} error={errors.playbookId}>
            <option value="">Select a playbook…</option>
            {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>

          <SelectField label="Inventory" value={form.inventoryId} onChange={v => setForm({ ...form, inventoryId: v })} error={errors.inventoryId}>
            <option value="">Select an inventory…</option>
            {inventories.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </SelectField>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Cron expression</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.cronExpression}
                onChange={e => setForm({ ...form, cronExpression: e.target.value })}
                placeholder="0 2 * * *"
                className={`flex-1 rounded-lg bg-input border px-3 py-2 text-sm text-th-primary font-mono focus:outline-none focus:ring-2 transition-colors ${errors.cronExpression ? "border-red-500/70 focus:ring-red-500/50" : "border-border-base focus:ring-emerald-500/50"}`}
              />
              <select
                value=""
                onChange={e => { if (e.target.value) setForm({ ...form, cronExpression: e.target.value }); }}
                className="rounded-lg bg-input border border-border-base px-2 py-2 text-sm text-th-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">Presets…</option>
                {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            {errors.cronExpression && <p className="text-xs text-red-400">{errors.cronExpression}</p>}
            <p className="text-xs text-th-subtle">Format: minute hour day month weekday — e.g. <code className="bg-input px-1 rounded">0 2 * * *</code> = every day at 2am</p>
          </div>

          <Field label="Tags (comma-separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="deploy, config" />
          <Field label="Limit hosts" value={form.limitHosts} onChange={e => setForm({ ...form, limitHosts: e.target.value })} placeholder="webservers" />
          {vaultPasswords.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-th-secondary">Vault password (optional)</label>
              <select value={form.vaultPasswordId} onChange={e => setForm({ ...form, vaultPasswordId: e.target.value })} className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors">
                <option value="">None</option>
                {vaultPasswords.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Switch isSelected={form.dryRun} onValueChange={v => setForm({ ...form, dryRun: v })} color="warning" size="sm" />
            <span className="text-sm text-th-secondary">Dry run (--check)</span>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Schedule" size="sm" footer={
        <>
          <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
          <Button color="danger" onPress={handleDelete}>Delete</Button>
        </>
      }>
        <p className="text-th-secondary">Delete this schedule? Executions already triggered won't be affected.</p>
      </Modal>

      {/* Run now — live log viewer */}
      <Modal isOpen={!!runNowExecId} onClose={() => setRunNowExecId(null)} title="Running now…" size="4xl">
        {runNowExecId && <LogViewer executionId={runNowExecId} />}
      </Modal>
    </>
  );
}
