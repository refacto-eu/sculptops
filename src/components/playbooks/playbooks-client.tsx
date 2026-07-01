"use client";

import { useState, useEffect } from "react";
import { Button, Switch } from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, TextareaField } from "@/components/ui/field";
import { Plus, Trash2, BookOpen, Code2, GitBranch, Play, X, Info, Upload, Clock } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { LogViewer } from "@/components/executions/log-viewer";
import { CommunityLibrary } from "@/components/playbooks/community-library";
import { CommunitySubmitModal } from "@/components/playbooks/community-submit-modal";
import type { CommunityData, CommunityParams } from "@/lib/community-server";
import { formatDate } from "@/lib/utils";

interface PlaybookItem { id: string; name: string; description: string | null; content: string; tags: string[]; gitRepo: string | null; updatedAt: Date; createdAt: Date; communitySourceId: string | null; communitySourceName: string | null; communityAuthorName: string | null; createdBy: string | null; creatorName: string | null; hasGitToken: boolean; }
interface RefItem { id: string; name: string }
interface ServerRef { id: string; name: string; host: string }
interface Props {
  initialPlaybooks: PlaybookItem[];
  inventories: RefItem[];
  servers: ServerRef[];
  vaultPasswords: RefItem[];
  role: "admin" | "member" | "viewer";
  activeTab: "mine" | "community";
  communityData: CommunityData | null;
  communityParams: CommunityParams;
  currentUserId: string;
}

const defaultRunForm = { targetMode: "inventory" as "inventory" | "server", inventoryId: "", serverId: "", dryRun: false, tags: "", limitHosts: "", vaultPasswordId: "" };

const DEFAULT_PLAYBOOK = `---
- name: Example Playbook
  hosts: all
  become: true
  tasks:
    - name: Ensure nginx is installed
      ansible.builtin.package:
        name: nginx
        state: present

    - name: Start nginx service
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true
`;

const defaultGitForm = { name: "", repoUrl: "", branch: "main", filePath: "", token: "" };

export function PlaybooksClient({ initialPlaybooks, inventories, servers, vaultPasswords, role, activeTab, communityData, communityParams, currentUserId }: Props) {
  const canWrite = role !== "viewer";
  const router = useRouter();
  const [tab, setTab] = useState<"mine" | "community">(activeTab);
  const [playbooks, setPlaybooks] = useState<PlaybookItem[]>(initialPlaybooks);
  useEffect(() => { setPlaybooks(initialPlaybooks); }, [initialPlaybooks]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", description: "", tags: "" });
  const [loading, setLoading] = useState(false);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [detailPlaybook,  setDetailPlaybook]  = useState<PlaybookItem | null>(null);
  const [submitPlaybook,  setSubmitPlaybook]  = useState<PlaybookItem | null>(null);
  const [submitSuccess,   setSubmitSuccess]   = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isGitOpen, setIsGitOpen] = useState(false);
  const [gitForm, setGitForm] = useState(defaultGitForm);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  // Run modal state
  const [runPlaybook, setRunPlaybook] = useState<PlaybookItem | null>(null);
  const [runForm, setRunForm] = useState(defaultRunForm);
  const [runExtraVars, setRunExtraVars] = useState<{ key: string; value: string }[]>([]);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runExecId, setRunExecId] = useState<string | null>(null);

  function openRun(pb: PlaybookItem) {
    setRunPlaybook(pb);
    setRunForm(defaultRunForm);
    setRunExtraVars([]);
    setRunError(null);
  }

  async function handleRun() {
    if (!runPlaybook) return;
    if (runForm.targetMode === "inventory" && !runForm.inventoryId) return;
    if (runForm.targetMode === "server" && !runForm.serverId) return;
    setRunLoading(true);
    setRunError(null);
    const target = runForm.targetMode === "inventory"
      ? { inventoryId: runForm.inventoryId }
      : { serverId: runForm.serverId };
    const res = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playbookId: runPlaybook.id,
        ...target,
        options: {
          dryRun: runForm.dryRun,
          tags: runForm.tags ? runForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
          limitHosts: runForm.limitHosts || undefined,
          extraVars: Object.fromEntries(runExtraVars.filter(v => v.key.trim()).map(v => [v.key.trim(), v.value])),
          vaultPasswordId: runForm.vaultPasswordId || undefined,
        },
      }),
    });
    setRunLoading(false);
    if (res.ok) {
      const data = await res.json();
      setRunPlaybook(null);
      setRunExecId(data.id);
    } else {
      const data = await res.json().catch(() => ({}));
      setRunError(data.error ?? "Failed to start execution");
    }
  }

  function openCreate() { setForm({ name: "", description: "", tags: "" }); setApiError(null); setIsOpen(true); }
  function openGitImport() { setGitForm(defaultGitForm); setGitError(null); setIsGitOpen(true); }

  async function handleGitImport() {
    if (!gitForm.name.trim() || !gitForm.repoUrl.trim() || !gitForm.filePath.trim()) {
      setGitError("Name, repository URL and file path are required"); return;
    }
    setGitLoading(true);
    setGitError(null);
    const res = await fetch("/api/playbooks/import-git", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: gitForm.name.trim(),
        repoUrl: gitForm.repoUrl.trim(),
        branch: gitForm.branch.trim() || "main",
        filePath: gitForm.filePath.trim(),
        token: gitForm.token.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setIsGitOpen(false);
      router.push(`/dashboard/playbooks/${data.id}`);
    } else {
      setGitError(data.error ?? "Import failed");
    }
    setGitLoading(false);
  }

  async function handleCreate() {
    if (!form.name.trim()) { setApiError("Name is required"); return; }
    setLoading(true);
    const payload = { name: form.name, description: form.description || undefined, tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [], content: DEFAULT_PLAYBOOK };
    const res = await fetch("/api/playbooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/playbooks/${data.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/playbooks/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setPlaybooks(prev => prev.filter(p => p.id !== deleteId)); setDeleteId(null); }
  }

  const filtered = playbooks.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
  });

  return (
    <>
      {/* Details panel */}
      {detailPlaybook && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setDetailPlaybook(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 w-80 h-full bg-card border-l border-border-base flex flex-col shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-base">
              <h2 className="font-semibold text-th-primary text-sm truncate pr-2">{detailPlaybook.name}</h2>
              <button onClick={() => setDetailPlaybook(null)} className="p-1.5 rounded-lg text-th-subtle hover:text-th-primary hover:bg-input transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-5 flex-1">
              <div>
                <p className="text-xs font-medium text-th-secondary mb-1">Description</p>
                <p className="text-sm text-th-muted">{detailPlaybook.description ?? <span className="italic text-th-subtle">No description</span>}</p>
              </div>
              {detailPlaybook.tags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-th-secondary mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {detailPlaybook.tags.map(t => (
                      <span key={t} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-input border border-border-base text-th-muted">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-th-secondary mb-1">Created</p>
                <p className="text-sm text-th-muted">{formatDate(detailPlaybook.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-th-secondary mb-1">Last updated</p>
                <p className="text-sm text-th-muted">{formatDate(detailPlaybook.updatedAt)}</p>
              </div>
              {detailPlaybook.gitRepo && (
                <div>
                  <p className="text-xs font-medium text-th-secondary mb-1">Git repository</p>
                  <p className="text-sm text-th-muted font-mono truncate">{detailPlaybook.gitRepo}</p>
                </div>
              )}
              {detailPlaybook.communitySourceId && (
                <div className="pt-2 border-t border-border-base">
                  <p className="text-xs font-medium text-th-secondary mb-2">Community source</p>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <BookOpen className="h-3.5 w-3.5 text-emerald-400/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-emerald-400/80 truncate">
                        {detailPlaybook.communitySourceName ?? "Community library"}
                      </p>
                      {detailPlaybook.communityAuthorName && (
                        <p className="text-xs text-emerald-400/50">by {detailPlaybook.communityAuthorName}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {canWrite && (
                <div className="pt-2 border-t border-border-base">
                  <p className="text-xs font-medium text-th-secondary mb-3">Community library</p>
                  <button
                    onClick={() => { setSubmitPlaybook(detailPlaybook); setDetailPlaybook(null); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border-base bg-input/50 hover:bg-input hover:border-border-strong text-sm text-th-secondary transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Submit to community
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {submitPlaybook && (
        <CommunitySubmitModal
          prefill={{ name: submitPlaybook.name, content: submitPlaybook.content, description: submitPlaybook.description ?? undefined, tags: submitPlaybook.tags }}
          onClose={() => setSubmitPlaybook(null)}
          onSuccess={() => { setSubmitPlaybook(null); setSubmitSuccess(true); }}
        />
      )}

      {/* Submit success toast */}
      {submitSuccess && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-2.5 rounded-lg shadow-lg">
          Playbook submitted! It will appear in the library after review.
          <button onClick={() => setSubmitSuccess(false)} className="ml-2 text-emerald-400/60 hover:text-emerald-400"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border-base">
        {(["mine", "community"] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              router.push(t === "community" ? "?tab=community" : "?tab=mine");
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-emerald-500 text-emerald-400" : "border-transparent text-th-muted hover:text-th-primary"
            }`}
          >
            {t === "mine" ? "My Playbooks" : "Community Library"}
          </button>
        ))}
      </div>

      {tab === "community" && (
        <CommunityLibrary role={role} data={communityData} params={communityParams} />
      )}

      {tab === "mine" && (
        <>
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search playbooks…" className="max-w-xs" />
          {canWrite && (
            <div className="ml-auto flex gap-2">
              <Button className="btn-secondary-outline" startContent={<GitBranch className="h-4 w-4" />} onPress={openGitImport}>Import from Git</Button>
              <Button className="btn-primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>New Playbook</Button>
            </div>
          )}
        </div>

        {playbooks.length === 0 ? (
        <EmptyState icon={BookOpen} title="No playbooks yet" description="Create your first Ansible playbook to automate your infrastructure." action={canWrite ? { label: "New Playbook", onClick: openCreate } : undefined} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-th-subtle py-8 text-center">No playbooks match &ldquo;{search}&rdquo;</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(playbook => (
            <div key={playbook.id} className="bg-card border border-border-base rounded-xl overflow-hidden hover:border-border-strong transition-colors flex flex-col">
              {/* Card body */}
              <div className="p-5 flex flex-col gap-4 flex-1">
                {/* Header: icon + name + description */}
                <div className="flex gap-3 items-start">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-input border border-border-base flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-th-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-th-primary leading-tight truncate">{playbook.name}</h3>
                      {playbook.communitySourceId && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-400/70">
                          Community
                        </span>
                      )}
                    </div>
                    {playbook.communitySourceId && playbook.communityAuthorName
                      ? <p className="text-xs text-emerald-400/50 mt-0.5">by {playbook.communityAuthorName}</p>
                      : playbook.creatorName
                      ? <p className="text-xs text-th-subtle/40 mt-0.5">by {playbook.creatorName}</p>
                      : null
                    }
                    {playbook.description
                      ? <p className="text-xs text-th-muted mt-1 line-clamp-2">{playbook.description}</p>
                      : <p className="text-xs text-th-subtle/60 mt-1 italic">No description</p>}
                  </div>
                </div>

                {/* Stats badges */}
                {playbook.gitRepo && (
                  <div className="flex gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-input border border-border-base text-xs">
                      <GitBranch className="h-3 w-3 text-th-subtle" />
                      <span className="text-th-subtle">Git</span>
                    </div>
                  </div>
                )}

                {/* Tag pills */}
                {playbook.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {playbook.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="inline-block text-[11px] font-mono px-2 py-0.5 rounded-full bg-input border border-border-base text-th-muted">
                        {tag}
                      </span>
                    ))}
                    {playbook.tags.length > 4 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-input border border-border-base text-th-subtle">
                        +{playbook.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-input/30 border-t border-border-base flex items-center justify-between gap-2">
                <Tip content={formatDate(playbook.updatedAt)} placement="top">
                  <span className="flex items-center text-th-subtle/50 hover:text-th-subtle transition-colors cursor-default">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                </Tip>
                <div className="flex items-center gap-1">
                  {canWrite && (
                    <Tip content="Run" placement="bottom">
                      <Button isIconOnly size="sm" variant="light" color="success" onPress={() => openRun(playbook)} className="hover:!bg-emerald-500/15 transition-colors">
                        <Play className="h-3.5 w-3.5 fill-emerald-400" />
                      </Button>
                    </Tip>
                  )}
                  <Tip content="Details" placement="bottom">
                    <Button isIconOnly size="sm" variant="light" onPress={() => setDetailPlaybook(playbook)} className="hover:!bg-zinc-500/15 transition-colors">
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                  <div className="w-px h-4 bg-border-base mx-0.5" />
                  <Link href={`/dashboard/playbooks/${playbook.id}`}>
                    <Button size="sm" className="!bg-zinc-500/10 hover:!bg-zinc-500/20 !border !border-border-base hover:!border-border-strong !text-th-secondary !font-medium transition-colors" startContent={<Code2 className="h-3.5 w-3.5" />}>
                      {canWrite ? "Edit" : "View"}
                    </Button>
                  </Link>
                  {canWrite && (
                    <Tip content="Delete" color="danger" placement="bottom">
                      <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(playbook.id)} className="hover:!bg-red-500/15 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tip>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
        </>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="New Playbook" footer={
        <>
          <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
          <Button color="success" isLoading={loading} onPress={handleCreate}>Create Playbook</Button>
        </>
      }>
        <div className="space-y-4">
          <FormError error={apiError} />
          <Field label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Deploy Nginx" required />
          <TextareaField label="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does this playbook do?" />
          <Field label="Tags (comma-separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="nginx, web, production" />
        </div>
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Playbook" size="sm" footer={
        <>
          <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
          <Button color="danger" onPress={handleDelete}>Delete</Button>
        </>
      }>
        <p className="text-th-secondary">Are you sure? This will delete the playbook and all its version history.</p>
      </Modal>

      {/* Run modal */}
      <Modal
        isOpen={!!runPlaybook}
        onClose={() => setRunPlaybook(null)}
        title={`Run — ${runPlaybook?.name ?? ""}`}
        footer={
          <>
            <Button variant="light" onPress={() => setRunPlaybook(null)}>Cancel</Button>
            <Button
              color="success"
              isLoading={runLoading}
              isDisabled={runForm.targetMode === "inventory" ? !runForm.inventoryId : !runForm.serverId}
              startContent={<Play className="h-4 w-4 fill-white" />}
              onPress={handleRun}
            >
              Run
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-input p-1">
            <button
              type="button"
              onClick={() => setRunForm(f => ({ ...f, targetMode: "inventory" }))}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${runForm.targetMode === "inventory" ? "bg-card text-th-primary shadow-sm" : "text-th-muted hover:text-th-primary"}`}
            >
              Inventory
            </button>
            <button
              type="button"
              onClick={() => setRunForm(f => ({ ...f, targetMode: "server" }))}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${runForm.targetMode === "server" ? "bg-card text-th-primary shadow-sm" : "text-th-muted hover:text-th-primary"}`}
            >
              Server
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">{runForm.targetMode === "inventory" ? "Inventory *" : "Server *"}</label>
            {runForm.targetMode === "inventory" ? (
              <select
                value={runForm.inventoryId}
                onChange={e => setRunForm(f => ({ ...f, inventoryId: e.target.value }))}
                className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
              >
                <option value="">Select an inventory</option>
                {inventories.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            ) : (
              <select
                value={runForm.serverId}
                onChange={e => setRunForm(f => ({ ...f, serverId: e.target.value }))}
                className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
              >
                <option value="">Select a server</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
              </select>
            )}
          </div>
          {vaultPasswords.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-th-secondary">Vault password (optional)</label>
              <select
                value={runForm.vaultPasswordId}
                onChange={e => setRunForm(f => ({ ...f, vaultPasswordId: e.target.value }))}
                className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
              >
                <option value="">None</option>
                {vaultPasswords.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          <Field label="Tags (comma-separated)" value={runForm.tags} onChange={e => setRunForm(f => ({ ...f, tags: e.target.value }))} placeholder="deploy, config" />
          <Field label="Limit hosts" value={runForm.limitHosts} onChange={e => setRunForm(f => ({ ...f, limitHosts: e.target.value }))} placeholder="webservers" />
          <div className="flex items-center gap-3">
            <Switch isSelected={runForm.dryRun} onValueChange={v => setRunForm(f => ({ ...f, dryRun: v }))} color="warning" size="sm" />
            <span className="text-sm text-th-secondary">Dry run (--check)</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-th-secondary">Extra vars</label>
              <button
                type="button"
                onClick={() => setRunExtraVars(prev => [...prev, { key: "", value: "" }])}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add variable
              </button>
            </div>
            {runExtraVars.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input type="text" placeholder="key" value={v.key}
                  onChange={e => setRunExtraVars(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                  className="w-2/5 rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                <span className="text-th-subtle text-sm">=</span>
                <input type="text" placeholder="value" value={v.value}
                  onChange={e => setRunExtraVars(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  className="flex-1 rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                <button type="button" onClick={() => setRunExtraVars(prev => prev.filter((_, j) => j !== i))} className="text-th-subtle hover:text-red-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {runError && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{runError}</p>}
        </div>
      </Modal>

      {/* Live log viewer after run */}
      <Modal isOpen={!!runExecId} onClose={() => setRunExecId(null)} title="Execution logs" size="4xl">
        {runExecId && <LogViewer executionId={runExecId} />}
      </Modal>
    </>
  );
}
