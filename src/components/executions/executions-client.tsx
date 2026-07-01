"use client";

import { useState } from "react";
import { Button, Chip, Switch, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field } from "@/components/ui/field";
import { Play, Eye, Trash2, Plus, X, Square, RotateCcw } from "lucide-react";
import { Pager } from "@/components/ui/pager";
import { SearchInput } from "@/components/ui/search-input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import { LogViewer } from "./log-viewer";

interface RefItem { id: string; name: string }
interface ServerRef { id: string; name: string; host: string }
interface ExecutionItem {
  id: string; status: string;
  options: { dryRun?: boolean; tags?: string[]; limitHosts?: string; extraVars?: Record<string, string>; vaultPasswordId?: string; targetServerId?: string };
  startedAt: Date | null; finishedAt: Date | null; createdAt: Date;
  playbook: RefItem | null; inventory: RefItem | null;
}
const PAGE_SIZE = 25;

interface Props { initialExecutions: ExecutionItem[]; initialTotal: number; playbooks: RefItem[]; inventories: RefItem[]; servers: ServerRef[]; vaultPasswords: RefItem[]; role: "admin" | "member" | "viewer" }

export function ExecutionsClient({ initialExecutions, initialTotal, playbooks, inventories, servers, vaultPasswords, role }: Props) {
  const canWrite = role !== "viewer";
  const [executions, setExecutions] = useState<ExecutionItem[]>(initialExecutions);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const [form, setForm] = useState({ playbookId: "", targetMode: "inventory" as "inventory" | "server", inventoryId: "", serverId: "", dryRun: false, tags: "", limitHosts: "", vaultPasswordId: "" });
  const [extraVars, setExtraVars] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [isRunOpen, setIsRunOpen] = useState(false);
  const [playbookFilter, setPlaybookFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  async function handleRun() {
    const target = form.targetMode === "inventory"
      ? { inventoryId: form.inventoryId }
      : { serverId: form.serverId };
    setLoading(true);
    const res = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playbookId: form.playbookId, ...target, options: { dryRun: form.dryRun, tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [], limitHosts: form.limitHosts || undefined, extraVars: Object.fromEntries(extraVars.filter(v => v.key.trim()).map(v => [v.key.trim(), v.value])), vaultPasswordId: form.vaultPasswordId || undefined } }),
    });
    if (res.ok) {
      const data = await res.json();
      setIsRunOpen(false);
      setExtraVars([]);
      setViewingId(data.id);
      // Go to page 1 to show the new execution
      await goToPage(1);
    }
    setLoading(false);
  }

  async function goToPage(p: number) {
    setLoadingPage(true);
    const res = await fetch(`/api/executions?page=${p}`);
    if (res.ok) {
      const data = await res.json();
      setExecutions(data.items);
      setTotal(data.total);
      setPage(p);
    }
    setLoadingPage(false);
  }

  function onStatusChange(id: string, status: string) {
    setExecutions(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  }

  async function handleCancel(id: string) {
    setCancelling(id);
    const res = await fetch(`/api/executions/${id}/cancel`, { method: "POST" });
    if (res.ok) {
      setExecutions(prev => prev.map(e => e.id === id ? { ...e, status: "cancelled" } : e));
    }
    setCancelling(null);
  }

  function handleRerun(exec: ExecutionItem) {
    const targetServerId = exec.options?.targetServerId ?? "";
    setForm({
      playbookId: exec.playbook?.id ?? "",
      targetMode: targetServerId ? "server" : "inventory",
      inventoryId: exec.inventory?.id ?? "",
      serverId: targetServerId,
      dryRun: exec.options?.dryRun ?? false,
      tags: exec.options?.tags?.join(", ") ?? "",
      limitHosts: exec.options?.limitHosts ?? "",
      vaultPasswordId: exec.options?.vaultPasswordId ?? "",
    });
    setExtraVars(
      exec.options?.extraVars
        ? Object.entries(exec.options.extraVars).map(([key, value]) => ({ key, value }))
        : []
    );
    setIsRunOpen(true);
  }

  async function handleClear() {
    setClearing(true);
    const res = await fetch("/api/executions", { method: "DELETE" });
    if (res.ok) { setExecutions([]); setTotal(0); setPage(1); setIsClearOpen(false); }
    setClearing(false);
  }

  const filtered = executions.filter(e => {
    const q = search.toLowerCase();
    const targetServer = e.options?.targetServerId ? servers.find(s => s.id === e.options.targetServerId) : null;
    const matchText = !q || e.playbook?.name.toLowerCase().includes(q) || e.inventory?.name.toLowerCase().includes(q) || targetServer?.name.toLowerCase().includes(q) || targetServer?.host.toLowerCase().includes(q);
    const matchStatus = !statusFilter || e.status === statusFilter;
    const matchPlaybook = !playbookFilter || e.playbook?.id === playbookFilter;
    const matchDate = (() => {
      if (!dateFilter) return true;
      const d = new Date(e.createdAt);
      const now = new Date();
      if (dateFilter === "today") return d.toDateString() === now.toDateString();
      if (dateFilter === "week") return d >= new Date(now.getTime() - 7 * 86400_000);
      if (dateFilter === "month") return d >= new Date(now.getTime() - 30 * 86400_000);
      return true;
    })();
    return matchText && matchStatus && matchPlaybook && matchDate;
  });

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by playbook or inventory…" className="max-w-xs" />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
        >
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={playbookFilter}
          onChange={e => setPlaybookFilter(e.target.value)}
          className="rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
        >
          <option value="">All playbooks</option>
          {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
        >
          <option value="">All time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </select>
        <div className="ml-auto flex gap-2">
          {canWrite && executions.length > 0 && (
            <Button className="btn-danger-outline" startContent={<Trash2 className="h-4 w-4" />} onPress={() => setIsClearOpen(true)}>Clear History</Button>
          )}
          {canWrite && (
            <Button className="btn-primary" startContent={<Play className="h-4 w-4 fill-white" />} onPress={() => setIsRunOpen(true)}>Run Playbook</Button>
          )}
        </div>
      </div>

      {executions.length === 0 ? (
        <EmptyState icon={Play} title="No executions yet" description="Run a playbook against an inventory or a server to automate your infrastructure." action={canWrite ? { label: "Run Playbook", onClick: () => setIsRunOpen(true) } : undefined} />
      ) : (
        <div className="bg-card border border-border-base rounded-xl overflow-hidden">
          <Table removeWrapper aria-label="Executions" classNames={{ th: "bg-input text-th-secondary !px-3 !text-left", td: "text-th-secondary !px-3 !text-left" }}>
            <TableHeader>
              <TableColumn>PLAYBOOK</TableColumn>
              <TableColumn>TARGET</TableColumn>
              <TableColumn>STATUS</TableColumn>
              <TableColumn>OPTIONS</TableColumn>
              <TableColumn>STARTED</TableColumn>
              <TableColumn>DURATION</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent={search || statusFilter ? "No executions match your filters" : "No executions yet"}>
              {filtered.map(exec => {
                const duration = exec.startedAt && exec.finishedAt
                  ? `${Math.round((new Date(exec.finishedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000)}s`
                  : exec.startedAt ? "Running…" : "—";
                return (
                  <TableRow key={exec.id}>
                    <TableCell className="font-medium">{exec.playbook?.name ?? <span className="text-th-subtle">Deleted</span>}</TableCell>
                    <TableCell>{exec.inventory?.name ?? (exec.options?.targetServerId ? servers.find(s => s.id === exec.options.targetServerId)?.name : null) ?? <span className="text-th-subtle">Deleted</span>}</TableCell>
                    <TableCell><StatusBadge status={exec.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {exec.options?.dryRun && <Chip size="sm" color="warning" variant="flat">dry-run</Chip>}
                        {exec.options?.tags?.map(t => <Chip key={t} size="sm" variant="flat">{t}</Chip>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-th-muted text-sm">{formatDate(exec.createdAt)}</TableCell>
                    <TableCell className="font-mono text-sm text-th-muted">{duration}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tip content="View logs" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" onPress={() => setViewingId(exec.id)} className="hover:!bg-zinc-500/15 transition-colors"><Eye className="h-3.5 w-3.5" /></Button>
                        </Tip>
                        {canWrite && exec.playbook && (exec.inventory || exec.options?.targetServerId) && (
                          <Tip content="Re-run" placement="bottom">
                            <Button isIconOnly size="sm" variant="light" onPress={() => handleRerun(exec)} className="hover:!bg-zinc-500/15 transition-colors">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </Tip>
                        )}
                        {canWrite && (exec.status === "running" || exec.status === "pending") && (
                          <Tip content="Cancel" placement="bottom" color="danger">
                            <Button isIconOnly size="sm" variant="light" color="danger" isLoading={cancelling === exec.id} onPress={() => handleCancel(exec.id)} className="hover:!bg-red-500/15 transition-colors">
                              <Square className="h-3.5 w-3.5" />
                            </Button>
                          </Tip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-th-subtle">
          {total > 0 && `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
        </span>
        <Pager page={page} totalPages={totalPages} onPageChange={goToPage} isLoading={loadingPage} />
        <span className="w-24" />
      </div>

      {/* Run modal */}
      <Modal isOpen={isRunOpen} onClose={() => setIsRunOpen(false)} title="Run Playbook" footer={
        <>
          <Button variant="light" onPress={() => setIsRunOpen(false)}>Cancel</Button>
          <Button color="success" isLoading={loading} isDisabled={!form.playbookId || (form.targetMode === "inventory" ? !form.inventoryId : !form.serverId)} startContent={<Play className="h-4 w-4 fill-white" />} onPress={handleRun}>Run</Button>
        </>
      }>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Playbook *</label>
            <select value={form.playbookId} onChange={e => setForm({ ...form, playbookId: e.target.value })} className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors">
              <option value="">Select a playbook</option>
              {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-input p-1">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, targetMode: "inventory" }))}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${form.targetMode === "inventory" ? "bg-card text-th-primary shadow-sm" : "text-th-muted hover:text-th-primary"}`}
            >
              Inventory
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, targetMode: "server" }))}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${form.targetMode === "server" ? "bg-card text-th-primary shadow-sm" : "text-th-muted hover:text-th-primary"}`}
            >
              Server
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">{form.targetMode === "inventory" ? "Inventory *" : "Server *"}</label>
            {form.targetMode === "inventory" ? (
              <select value={form.inventoryId} onChange={e => setForm({ ...form, inventoryId: e.target.value })} className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors">
                <option value="">Select an inventory</option>
                {inventories.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            ) : (
              <select value={form.serverId} onChange={e => setForm({ ...form, serverId: e.target.value })} className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors">
                <option value="">Select a server</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
              </select>
            )}
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

          {/* Extra vars */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-th-secondary">Extra vars</label>
              <button
                type="button"
                onClick={() => setExtraVars(prev => [...prev, { key: "", value: "" }])}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add variable
              </button>
            </div>
            {extraVars.length === 0 && (
              <p className="text-xs text-th-subtle italic">No extra vars — click "Add variable" to define key/value pairs passed as <code className="bg-input px-1 rounded">--extra-vars</code>.</p>
            )}
            {extraVars.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="key"
                  value={v.key}
                  onChange={e => setExtraVars(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                  className="w-2/5 rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <span className="text-th-subtle text-sm">=</span>
                <input
                  type="text"
                  placeholder="value"
                  value={v.value}
                  onChange={e => setExtraVars(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  className="flex-1 rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={() => setExtraVars(prev => prev.filter((_, j) => j !== i))}
                  className="text-th-subtle hover:text-red-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Log viewer modal */}
      <Modal isOpen={!!viewingId} onClose={() => setViewingId(null)} title="Execution Logs" size="4xl">
        {viewingId && <LogViewer executionId={viewingId} onStatusChange={s => onStatusChange(viewingId, s)} />}
      </Modal>

      {/* Clear history modal */}
      <Modal isOpen={isClearOpen} onClose={() => setIsClearOpen(false)} title="Clear Execution History" size="sm" footer={
        <>
          <Button variant="light" onPress={() => setIsClearOpen(false)}>Cancel</Button>
          <Button color="danger" isLoading={clearing} onPress={handleClear}>Clear All</Button>
        </>
      }>
        <p className="text-th-secondary">This will permanently delete all execution history and logs. Running executions are not affected.</p>
      </Modal>
    </>
  );
}
