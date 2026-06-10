"use client";

import { useState, useRef } from "react";
import { Button, Chip } from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, TextareaField } from "@/components/ui/field";
import { Plus, Trash2, List, PlusCircle, MinusCircle, Server, Download, Upload, X, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { formatDate } from "@/lib/utils";

interface ServerRef { id: string; name: string; host: string }
interface InventoryHost { server: ServerRef; variables: Record<string, string> }
interface InventoryGroup { name: string; variables: Record<string, string>; hosts: InventoryHost[] }
interface InventoryItem { id: string; name: string; description: string | null; groups: InventoryGroup[]; createdAt: Date }
interface Props { initialInventories: InventoryItem[]; servers: ServerRef[]; role: "admin" | "member" | "viewer" }

type KV = { key: string; value: string };
type GroupHost = { serverId: string; vars: KV[]; varsOpen: boolean };
type Group = { name: string; groupVars: KV[]; hosts: GroupHost[]; varsOpen: boolean };

function toKV(obj: Record<string, string>): KV[] {
  return Object.entries(obj).map(([key, value]) => ({ key, value }));
}
function fromKV(kvs: KV[]): Record<string, string> {
  return Object.fromEntries(kvs.filter(kv => kv.key.trim()).map(kv => [kv.key.trim(), kv.value]));
}

function KVEditor({ vars, onChange }: { vars: KV[]; onChange: (v: KV[]) => void }) {
  return (
    <div className="space-y-1.5">
      {vars.map((kv, i) => (
        <div key={i} className="flex gap-1.5 items-center">
          <input
            type="text" placeholder="key" value={kv.key}
            onChange={e => onChange(vars.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
            className="w-2/5 rounded-md bg-card border border-border-base px-2 py-1 text-xs text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
          <span className="text-th-subtle text-xs">=</span>
          <input
            type="text" placeholder="value" value={kv.value}
            onChange={e => onChange(vars.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
            className="flex-1 rounded-md bg-card border border-border-base px-2 py-1 text-xs text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
          <button type="button" onClick={() => onChange(vars.filter((_, j) => j !== i))} className="text-th-subtle hover:text-red-400 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...vars, { key: "", value: "" }])}
        className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
      >
        + Add variable
      </button>
    </div>
  );
}

export function InventoriesClient({ initialInventories, servers, role }: Props) {
  const canWrite = role !== "viewer";
  const [search, setSearch] = useState("");
  const [inventories, setInventories] = useState<InventoryItem[]>(initialInventories);
  const [form, setForm] = useState({ name: "", description: "" });
  const [groups, setGroups] = useState<Group[]>([{ name: "all", groupVars: [], hosts: [], varsOpen: false }]);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matched: number; unmatched: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", description: "" });
    setGroups([{ name: "all", groupVars: [], hosts: [], varsOpen: false }]);
    setApiError(null);
    setIsOpen(true);
  }

  function openEdit(inv: InventoryItem) {
    setEditingId(inv.id);
    setForm({ name: inv.name, description: inv.description || "" });
    setGroups(inv.groups.map(g => ({
      name: g.name,
      groupVars: toKV(g.variables),
      hosts: g.hosts.map(h => ({ serverId: h.server.id, vars: toKV(h.variables), varsOpen: Object.keys(h.variables).length > 0 })),
      varsOpen: Object.keys(g.variables).length > 0,
    })));
    setApiError(null);
    setIsOpen(true);
  }

  function addGroup() {
    setGroups(prev => [...prev, { name: "", groupVars: [], hosts: [], varsOpen: false }]);
  }
  function removeGroup(idx: number) {
    setGroups(prev => prev.filter((_, i) => i !== idx));
  }
  function updateGroup<K extends keyof Group>(idx: number, key: K, value: Group[K]) {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, [key]: value } : g));
  }

  function addHostToGroup(groupIdx: number, serverId: string) {
    if (!serverId) return;
    setGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      if (g.hosts.some(h => h.serverId === serverId)) return g;
      return { ...g, hosts: [...g.hosts, { serverId, vars: [], varsOpen: false }] };
    }));
  }

  function removeHostFromGroup(groupIdx: number, serverId: string) {
    setGroups(prev => prev.map((g, i) =>
      i !== groupIdx ? g : { ...g, hosts: g.hosts.filter(h => h.serverId !== serverId) }
    ));
  }

  function updateHostVars(groupIdx: number, serverId: string, vars: KV[]) {
    setGroups(prev => prev.map((g, i) =>
      i !== groupIdx ? g : { ...g, hosts: g.hosts.map(h => h.serverId === serverId ? { ...h, vars } : h) }
    ));
  }

  function toggleHostVars(groupIdx: number, serverId: string) {
    setGroups(prev => prev.map((g, i) =>
      i !== groupIdx ? g : { ...g, hosts: g.hosts.map(h => h.serverId === serverId ? { ...h, varsOpen: !h.varsOpen } : h) }
    ));
  }

  async function handleSave() {
    setLoading(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      groups: groups.filter(g => g.name).map(g => ({
        name: g.name,
        variables: fromKV(g.groupVars),
        hosts: g.hosts.map(h => ({ serverId: h.serverId, variables: fromKV(h.vars) })),
      })),
    };
    const url = editingId ? `/api/inventories/${editingId}` : "/api/inventories";
    const res = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      const listRes = await fetch("/api/inventories");
      if (listRes.ok) setInventories(await listRes.json());
      setIsOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleImport() {
    if (!importFile || !importName.trim()) return;
    setImporting(true);
    setImportError(null);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("name", importName.trim());
    const res = await fetch("/api/inventories/import", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setImportResult({ matched: data.matched, unmatched: data.unmatched });
      const listRes = await fetch("/api/inventories");
      if (listRes.ok) setInventories(await listRes.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setImportError(data.error ?? "Import failed");
    }
    setImporting(false);
  }

  function closeImport() {
    setIsImportOpen(false);
    setImportName("");
    setImportFile(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/inventories/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setInventories(prev => prev.filter(i => i.id !== deleteId)); setDeleteId(null); }
  }

  const serverMap = new Map(servers.map(s => [s.id, s]));

  const filtered = inventories.filter(inv => {
    const q = search.toLowerCase();
    return !q || inv.name.toLowerCase().includes(q) || inv.description?.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search inventories…" className="max-w-xs" />
        {canWrite && (
          <div className="ml-auto flex gap-2">
            <Button className="btn-secondary-outline" startContent={<Upload className="h-4 w-4" />} onPress={() => setIsImportOpen(true)}>Import</Button>
            <Button className="btn-primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>New Inventory</Button>
          </div>
        )}
      </div>

      {inventories.length === 0 ? (
        <EmptyState icon={List} title="No inventories yet" description="Create an inventory to group servers and target them with playbooks." action={canWrite ? { label: "New Inventory", onClick: openCreate } : undefined} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-th-subtle py-8 text-center">No inventories match &ldquo;{search}&rdquo;</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(inv => {
            const totalHosts = inv.groups.reduce((n, g) => n + g.hosts.length, 0);
            return (
              <div key={inv.id} className="bg-card border border-border-base rounded-xl overflow-hidden hover:border-border-strong transition-colors flex flex-col">
                {/* Card body */}
                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Header: icon + name + description */}
                  <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-input border border-border-base flex items-center justify-center">
                      <List className="h-4 w-4 text-th-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-th-primary leading-tight truncate">{inv.name}</h3>
                      {inv.description
                        ? <p className="text-xs text-th-muted mt-1 line-clamp-2">{inv.description}</p>
                        : <p className="text-xs text-th-subtle/60 mt-1 italic">No description</p>}
                    </div>
                  </div>

                  {/* Stats badges */}
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-input border border-border-base text-xs">
                      <List className="h-3 w-3 text-th-subtle" />
                      <span className="font-semibold text-th-secondary">{inv.groups.length}</span>
                      <span className="text-th-subtle">group{inv.groups.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-input border border-border-base text-xs">
                      <Server className="h-3 w-3 text-th-subtle" />
                      <span className="font-semibold text-th-secondary">{totalHosts}</span>
                      <span className="text-th-subtle">host{totalHosts !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Group name pills */}
                  {inv.groups.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {inv.groups.slice(0, 3).map(g => (
                        <span key={g.name} className="inline-block text-[11px] font-mono px-2 py-0.5 rounded-full bg-input border border-border-base text-th-muted">
                          {g.name}
                        </span>
                      ))}
                      {inv.groups.length > 3 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-input border border-border-base text-th-subtle">
                          +{inv.groups.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-input/30 border-t border-border-base flex items-center justify-between gap-2">
                  <time className="text-xs text-th-subtle shrink-0">{formatDate(inv.createdAt)}</time>
                  <div className="flex items-center gap-1">
                    <Tip content="Export INI" placement="bottom">
                      <Button isIconOnly size="sm" variant="light" onPress={() => window.location.href = `/api/inventories/${inv.id}/export?format=ini`} className="hover:!bg-zinc-500/15 transition-colors">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </Tip>
                    <Tip content="Export YAML" placement="bottom">
                      <Button isIconOnly size="sm" variant="light" onPress={() => window.location.href = `/api/inventories/${inv.id}/export?format=yaml`} className="hover:!bg-zinc-500/15 transition-colors">
                        <span className="text-[10px] font-bold leading-none">YML</span>
                      </Button>
                    </Tip>
                    {canWrite && (
                      <>
                        <div className="w-px h-4 bg-border-base mx-0.5" />
                        <Button
                          size="sm"
                          className="!bg-zinc-500/10 hover:!bg-zinc-500/20 !border !border-border-base hover:!border-border-strong !text-th-secondary !font-medium transition-colors"
                          startContent={<Pencil className="h-3.5 w-3.5" />}
                          onPress={() => openEdit(inv)}
                        >
                          Edit
                        </Button>
                        <Tip content="Delete" color="danger" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(inv.id)} className="hover:!bg-red-500/15 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Tip>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingId ? "Edit Inventory" : "New Inventory"} size="2xl" footer={
        <>
          <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
          <Button color="success" isLoading={loading} isDisabled={!form.name} onPress={handleSave}>{editingId ? "Save" : "Create"}</Button>
        </>
      }>
        <div className="space-y-5">
          <FormError error={apiError} />
          <Field label="Inventory Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="production" required />
          <TextareaField label="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." />

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-th-primary">Groups</h3>
              <Button size="sm" variant="flat" startContent={<PlusCircle className="h-3.5 w-3.5" />} onPress={addGroup}>Add Group</Button>
            </div>
            <div className="space-y-3">
              {groups.map((group, gIdx) => {
                const availableServers = servers.filter(s => !group.hosts.some(h => h.serverId === s.id));
                return (
                  <div key={gIdx} className="bg-card border border-border-base rounded-lg p-3 space-y-3">
                    {/* Group name + remove */}
                    <div className="flex items-center gap-2">
                      <Field label="Group name" value={group.name} onChange={e => updateGroup(gIdx, "name", e.target.value)} placeholder="webservers" wrapperClassName="flex-1" />
                      <Button isIconOnly size="sm" variant="light" color="danger" isDisabled={groups.length === 1} onPress={() => removeGroup(gIdx)}>
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Group variables toggle */}
                    <div>
                      <button
                        type="button"
                        onClick={() => updateGroup(gIdx, "varsOpen", !group.varsOpen)}
                        className="flex items-center gap-1.5 text-xs text-th-muted hover:text-th-secondary transition-colors"
                      >
                        {group.varsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Group variables
                        {group.groupVars.filter(kv => kv.key).length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px]">
                            {group.groupVars.filter(kv => kv.key).length}
                          </span>
                        )}
                      </button>
                      {group.varsOpen && (
                        <div className="mt-2 pl-4 border-l border-border-base">
                          <KVEditor vars={group.groupVars} onChange={v => updateGroup(gIdx, "groupVars", v)} />
                        </div>
                      )}
                    </div>

                    {/* Hosts */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-th-muted">Hosts</label>

                      {/* Selected hosts */}
                      {group.hosts.map((h) => {
                        const srv = serverMap.get(h.serverId);
                        if (!srv) return null;
                        return (
                          <div key={h.serverId} className="rounded-md bg-input border border-border-base">
                            <div className="flex items-center gap-2 px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => toggleHostVars(gIdx, h.serverId)}
                                className="text-th-subtle hover:text-th-secondary transition-colors"
                              >
                                {h.varsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </button>
                              <span className="text-xs text-th-primary flex-1">{srv.name}</span>
                              <span className="text-xs text-th-subtle font-mono">{srv.host}</span>
                              {h.vars.filter(kv => kv.key).length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px]">
                                  {h.vars.filter(kv => kv.key).length} vars
                                </span>
                              )}
                              <button type="button" onClick={() => removeHostFromGroup(gIdx, h.serverId)} className="text-th-subtle hover:text-red-400 transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {h.varsOpen && (
                              <div className="px-3 pb-2 pt-1 border-t border-border-base">
                                <KVEditor vars={h.vars} onChange={v => updateHostVars(gIdx, h.serverId, v)} />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Add host dropdown */}
                      {availableServers.length > 0 && (
                        <select
                          value=""
                          onChange={e => { addHostToGroup(gIdx, e.target.value); e.target.value = ""; }}
                          className="w-full rounded-md bg-input border border-border-base px-2 py-1.5 text-xs text-th-muted focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                        >
                          <option value="">+ Add a server…</option>
                          {availableServers.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                          ))}
                        </select>
                      )}
                      {availableServers.length === 0 && group.hosts.length === 0 && (
                        <p className="text-xs text-th-subtle italic">No servers available.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal
        isOpen={isImportOpen}
        onClose={closeImport}
        title="Import Inventory"
        size="sm"
        footer={
          importResult ? (
            <Button color="success" onPress={closeImport}>Done</Button>
          ) : (
            <>
              <Button variant="light" onPress={closeImport}>Cancel</Button>
              <Button color="success" isLoading={importing} isDisabled={!importFile || !importName.trim()} onPress={handleImport}>Import</Button>
            </>
          )
        }
      >
        {importResult ? (
          <div className="space-y-3">
            <p className="text-sm text-th-secondary">
              Inventory imported. <span className="text-emerald-400 font-medium">{importResult.matched} host{importResult.matched !== 1 ? "s" : ""} matched</span>.
            </p>
            {importResult.unmatched.length > 0 && (
              <div>
                <p className="text-sm text-yellow-400 mb-1">{importResult.unmatched.length} host{importResult.unmatched.length !== 1 ? "s" : ""} not found in your servers:</p>
                <ul className="space-y-0.5">
                  {importResult.unmatched.map(h => (
                    <li key={h} className="text-xs font-mono text-th-muted bg-input/50 px-2 py-1 rounded">{h}</li>
                  ))}
                </ul>
                <p className="text-xs text-th-subtle mt-2">Add these servers first, then re-import or edit the inventory.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <FormError error={importError} />
            <Field label="Inventory name" value={importName} onChange={e => setImportName(e.target.value)} placeholder="production-imported" />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-th-secondary">File <span className="text-th-subtle font-normal">(.ini or .yml/.yaml)</span></label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ini,.yml,.yaml"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > 1024 * 1024) {
                    setImportError("File too large — maximum size is 1 MB");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    return;
                  }
                  setImportError(null);
                  setImportFile(f);
                }}
                className="w-full text-sm text-th-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-input file:text-th-secondary hover:file:bg-card file:cursor-pointer cursor-pointer"
              />
              <p className="text-xs text-th-subtle">Hosts are matched against your existing servers by IP / hostname.</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Inventory" size="sm" footer={
        <>
          <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
          <Button color="danger" onPress={handleDelete}>Delete</Button>
        </>
      }>
        <p className="text-th-secondary">Delete this inventory? All group and host associations will be removed.</p>
      </Modal>
    </>
  );
}
