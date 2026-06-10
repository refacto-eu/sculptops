"use client";

import { useState, useEffect } from "react";
import {
  Button,
  Select,
  SelectItem,
  Chip,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, TextareaField } from "@/components/ui/field";
import { Plus, Pencil, Trash2, Server, RefreshCw } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { formatDate } from "@/lib/utils";

interface SshKeyRef { id: string; name: string }

interface ServerItem {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  description: string | null;
  tags: string[];
  status: string | null;
  lastConnectedAt: Date | null;
  sshKey?: SshKeyRef | null;
  sshKeyId?: string | null;
}

interface Props {
  initialServers: ServerItem[];
  sshKeys: SshKeyRef[];
  role: "admin" | "member" | "viewer";
}

const defaultForm = { name: "", host: "", port: 22, username: "root", description: "", tags: "", sshKeyId: "" };

export function ServersClient({ initialServers, sshKeys, role }: Props) {
  const canWrite = role !== "viewer";
  const [servers, setServers] = useState<ServerItem[]>(initialServers);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  function openCreate() { setEditingId(null); setForm(defaultForm); setErrors({}); setApiError(null); setIsOpen(true); }
  function openEdit(s: ServerItem) {
    setEditingId(s.id);
    setForm({ name: s.name, host: s.host, port: s.port, username: s.username, description: s.description || "", tags: s.tags?.join(", ") || "", sshKeyId: s.sshKeyId || "" });
    setErrors({});
    setApiError(null);
    setIsOpen(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.host.trim()) e.host = "Host / IP is required";
    if (!form.username.trim()) e.username = "Username is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    const payload = { name: form.name, host: form.host, port: Number(form.port), username: form.username, description: form.description || null, tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [], sshKeyId: form.sshKeyId || null };
    const res = await fetch(editingId ? `/api/servers/${editingId}` : "/api/servers", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      const data = await res.json();
      setServers(prev => editingId ? prev.map(s => s.id === editingId ? { ...s, ...data } : s) : [data, ...prev]);
      setIsOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/servers/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setServers(prev => prev.filter(s => s.id !== deleteId)); setDeleteId(null); }
  }

  async function testConnection(id: string) {
    setTestingId(id);
    setTestError(null);
    const res = await fetch(`/api/servers/${id}/test-connection`, { method: "POST" });
    const data = await res.json();
    setServers(prev => prev.map(s => s.id === id ? { ...s, status: data.success ? "reachable" : "unreachable" } : s));
    if (!data.success) setTestError(data.message);
    setTestingId(null);
  }

  async function checkAll(ids?: string[]) {
    const targets = ids ?? initialServers.map(s => s.id);
    if (!targets.length) return;
    setCheckingAll(true);
    await Promise.all(targets.map(async id => {
      const res = await fetch(`/api/servers/${id}/test-connection`, { method: "POST" });
      const data = await res.json();
      setServers(prev => prev.map(s => s.id === id ? { ...s, status: data.success ? "reachable" : "unreachable" } : s));
    }));
    setCheckingAll(false);
  }

  useEffect(() => { if (canWrite) checkAll(); }, []);

  const filtered = servers.filter(s => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || s.tags?.some(t => t.toLowerCase().includes(q));
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search servers…" className="max-w-xs" />
        <div className="ml-auto flex gap-2">
        {canWrite && servers.length > 0 && (
          <Button className="btn-secondary-outline" isLoading={checkingAll} startContent={!checkingAll && <RefreshCw className="h-4 w-4" />} onPress={() => checkAll()}>
            Check All
          </Button>
        )}
        {canWrite && (
          <Button className="btn-primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>
            Add Server
          </Button>
        )}
        </div>
      </div>

      {testError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 font-mono break-all">
          <span className="font-semibold text-red-300">SSH error: </span>{testError}
        </div>
      )}

      {servers.length === 0 ? (
        <EmptyState icon={Server} title="No servers yet" description="Add your first server to start managing your infrastructure with Ansible." action={canWrite ? { label: "Add Server", onClick: openCreate } : undefined} />
      ) : (
        <div className="bg-card border border-border-base rounded-xl overflow-hidden">
          <Table removeWrapper aria-label="Servers" classNames={{ th: "bg-input text-th-secondary !px-3 !text-left", td: "text-th-secondary !px-3 !text-left" }}>
            <TableHeader>
              <TableColumn>NAME</TableColumn>
              <TableColumn>HOST</TableColumn>
              <TableColumn>USER</TableColumn>
              <TableColumn>SSH KEY</TableColumn>
              <TableColumn>STATUS</TableColumn>
              <TableColumn>LAST CONNECTED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent={search ? `No servers match "${search}"` : "No servers"}>
              {filtered.map(server => (
                <TableRow key={server.id}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell className="font-mono text-sm">{server.host}:{server.port}</TableCell>
                  <TableCell className="font-mono text-sm">{server.username}</TableCell>
                  <TableCell>{server.sshKey ? <Chip size="sm" variant="flat">{server.sshKey.name}</Chip> : <span className="text-th-subtle text-sm">None</span>}</TableCell>
                  <TableCell>
                    {server.status === "reachable"
                      ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />Reachable</span>
                      : server.status === "unreachable"
                      ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25"><span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />Unreachable</span>
                      : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"><span className="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />Unknown</span>}
                  </TableCell>
                  <TableCell className="text-th-muted text-sm">{formatDate(server.lastConnectedAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Tip content="Test connection" placement="bottom">
                        <Button isIconOnly size="sm" variant="light" isLoading={testingId === server.id} onPress={() => testConnection(server.id)} className="hover:!bg-zinc-500/15 transition-colors"><RefreshCw className="h-3.5 w-3.5" /></Button>
                      </Tip>
                      {canWrite && (
                        <Tip content="Edit" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" onPress={() => openEdit(server)} className="hover:!bg-zinc-500/15 transition-colors"><Pencil className="h-3.5 w-3.5" /></Button>
                        </Tip>
                      )}
                      {canWrite && (
                        <Tip content="Delete" color="danger" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(server.id)} className="hover:!bg-red-500/15 transition-colors"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </Tip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit Server" : "Add Server"}
        size="lg"
        footer={
          <>
            <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
            <Button color="success" isLoading={loading} onPress={handleSave}>{editingId ? "Save" : "Add Server"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError error={apiError} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="web-server-01" error={errors.name} />
            <Field label="Host / IP" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.10" error={errors.host} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Port" type="number" value={String(form.port)} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 22 })} />
            <Field label="Username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} error={errors.username} />
          </div>
          <TextareaField label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional..." />
          <Field label="Tags (comma-separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="web, production" />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">SSH Key</label>
            <select
              value={form.sshKeyId}
              onChange={e => setForm({ ...form, sshKeyId: e.target.value })}
              className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
            >
              <option value="">None</option>
              {sshKeys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Server"
        size="sm"
        footer={
          <>
            <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
            <Button color="danger" onPress={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-th-secondary">Are you sure? This action cannot be undone.</p>
      </Modal>
    </>
  );
}
