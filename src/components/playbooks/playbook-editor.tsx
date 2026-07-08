"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Button,
  Switch,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  useDisclosure,
} from "@heroui/react";
import {
  ArrowLeft,
  Save,
  Clock,
  Play,
  Check,
  Plus,
  X,
  GitCompare,
  RotateCcw,
  GitBranch,
  RefreshCw,
  Pencil,
  Boxes,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Modal as UiModal } from "@/components/ui/modal";
import type { SafePlaybook } from "@/lib/playbook-response";
import yaml from "js-yaml";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
const MonacoDiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false }
);

interface RefItem { id: string; name: string }
interface ServerRef { id: string; name: string; host: string }

interface VersionItem {
  id: string;
  version: number;
  content: string;
  changedBy: string | null;
  createdAt: Date;
  changedByUser: { id: string; name: string | null; email: string } | null;
}

interface Props {
  playbook: SafePlaybook;
  versions: VersionItem[];
  inventories: RefItem[];
  servers: ServerRef[];
  vaultPasswords: RefItem[];
  canRun: boolean;
}

const MAX_TAGS    = 30;
const MAX_TAG_LEN = 256;

export function PlaybookEditor({ playbook, versions, inventories, servers, vaultPasswords, canRun }: Props) {
  const router = useRouter();
  const [name,        setName]        = useState(playbook.name);
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(playbook.name);
  const [content, setContent] = useState(playbook.content);
  const [requirements, setRequirements] = useState(playbook.requirements ?? "");
  const [isReqOpen, setIsReqOpen] = useState(false);
  const [reqSaving, setReqSaving] = useState(false);
  const hasRequirements = !!requirements.trim();
  const [tags, setTags] = useState<string[]>(playbook.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentVersions, setCurrentVersions] = useState<VersionItem[]>(versions);
  const [diffVersion, setDiffVersion] = useState<VersionItem | null>(null);

  const { isOpen: isHistoryOpen, onOpen: onHistoryOpen, onClose: onHistoryClose } = useDisclosure();

  // Git state
  const [gitRepo, setGitRepo] = useState(playbook.gitRepo ?? "");
  const [gitBranch, setGitBranch] = useState(playbook.gitBranch ?? "main");
  const [gitPath, setGitPath] = useState(playbook.gitPath ?? "");
  const [gitToken, setGitToken] = useState("");
  const [isGitOpen, setIsGitOpen] = useState(false);
  const [gitSaving, setGitSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<"ok" | "error" | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const hasGit = !!(playbook.gitRepo || gitRepo);


  // Run modal state
  const [isRunOpen, setIsRunOpen] = useState(false);
  const [runForm, setRunForm] = useState({ targetMode: "inventory" as "inventory" | "server", inventoryId: "", serverId: "", dryRun: false, tags: "", limitHosts: "", vaultPasswordId: "" });
  const [runExtraVars, setRunExtraVars] = useState<{ key: string; value: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function handleRun() {
    if (runForm.targetMode === "inventory" && !runForm.inventoryId) return;
    if (runForm.targetMode === "server" && !runForm.serverId) return;
    setRunning(true);
    setRunError(null);
    const target = runForm.targetMode === "inventory"
      ? { inventoryId: runForm.inventoryId }
      : { serverId: runForm.serverId };
    const res = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playbookId: playbook.id,
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
    setRunning(false);
    if (res.ok) {
      router.push("/dashboard/executions");
    } else {
      const data = await res.json().catch(() => ({}));
      setRunError(data.error ?? "Failed to start execution");
    }
  }

  const save = useCallback(async () => {
    try {
      yaml.load(content);
    } catch (e) {
      setSaveError(`YAML error: ${e instanceof yaml.YAMLException ? e.message : "invalid syntax"}`);
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/playbooks/${playbook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content, tags }),
    });
    if (res.ok) {
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 2000);
      const versionsRes = await fetch(`/api/playbooks/${playbook.id}/versions`);
      if (versionsRes.ok) setCurrentVersions(await versionsRes.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setSaveError(data.error ?? "Save failed");
    }
    setSaving(false);
  }, [playbook.id, name, content, tags]);

  function addTag(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      const val = tagInput.trim().slice(0, MAX_TAG_LEN);
      if (!val) return;
      if (tags.length >= MAX_TAGS) { setTagInput(""); return; }
      setTags((prev) => Array.from(new Set([...prev, val])));
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleGitSave() {
    setGitSaving(true);
    const res = await fetch(`/api/playbooks/${playbook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gitRepo: gitRepo.trim() || null,
        gitBranch: gitBranch.trim() || "main",
        gitPath: gitPath.trim() || null,
        ...(gitToken ? { gitToken } : {}),
      }),
    });
    if (res.ok) setIsGitOpen(false);
    setGitSaving(false);
  }

  async function handleRequirementsSave() {
    setReqSaving(true);
    const res = await fetch(`/api/playbooks/${playbook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirements: requirements.trim() || null }),
    });
    if (res.ok) setIsReqOpen(false);
    setReqSaving(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    const res = await fetch(`/api/playbooks/${playbook.id}/sync`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setContent(data.content);
      setSyncResult("ok");
      const versionsRes = await fetch(`/api/playbooks/${playbook.id}/versions`);
      if (versionsRes.ok) setCurrentVersions(await versionsRes.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setSyncError(data.error ?? "Sync failed");
      setSyncResult("error");
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 3000);
  }

  function restoreVersion(v: VersionItem) {
    setContent(v.content);
    onHistoryClose();
  }

  const latestVersion = currentVersions[0]?.version ?? 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-input border-b border-border-base">
        <Link href="/dashboard/playbooks">
          <Button isIconOnly size="sm" variant="light">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={() => { setName(nameInput || name); setEditingName(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { setName(nameInput || name); setEditingName(false); }
              if (e.key === "Escape") { setNameInput(name); setEditingName(false); }
            }}
            maxLength={1024}
            className="bg-card border border-emerald-500/50 rounded-lg px-2.5 h-8 text-base font-semibold text-th-primary focus:outline-none focus:ring-1 focus:ring-emerald-500/50 max-w-[220px] min-w-[120px]"
          />
        ) : (
          <button
            onClick={() => { setNameInput(name); setEditingName(true); }}
            className="group flex items-center gap-1.5 px-1 rounded hover:bg-input transition-colors max-w-[220px] min-w-0"
          >
            <span className="text-base font-semibold text-th-primary truncate">{name}</span>
            <Pencil className="h-3 w-3 text-th-subtle/40 group-hover:text-th-subtle shrink-0 transition-colors" />
          </button>
        )}

        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 overflow-hidden">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-input border border-border-base text-xs text-th-muted">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="flex items-center text-th-subtle/50 hover:text-th-primary transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {tags.length < MAX_TAGS ? (
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value.slice(0, MAX_TAG_LEN))}
              onKeyDown={addTag}
              placeholder="Add tag…"
              className="bg-transparent text-xs text-th-primary placeholder:text-th-subtle/50 focus:outline-none w-20 min-w-0"
            />
          ) : (
            <span className="text-xs text-th-subtle/40">{MAX_TAGS}/{MAX_TAGS}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="flat"
            startContent={<Boxes className="h-3.5 w-3.5" />}
            color={hasRequirements ? "success" : "default"}
            onPress={() => setIsReqOpen(true)}
          >
            Dependencies
          </Button>
          <Button
            size="sm"
            variant="flat"
            startContent={<GitBranch className="h-3.5 w-3.5" />}
            color={hasGit ? "success" : "default"}
            onPress={() => setIsGitOpen(true)}
          >
            {hasGit ? "Git" : "Link Git"}
          </Button>
          <Button
            size="sm"
            variant="flat"
            startContent={<Clock className="h-3.5 w-3.5" />}
            onPress={onHistoryOpen}
          >
            History {latestVersion > 0 ? `(v${latestVersion})` : ""}
          </Button>
          {canRun && (
            <Button
              size="sm"
              color="success"
              variant="flat"
              startContent={<Play className="h-3.5 w-3.5" />}
              onPress={() => { setRunError(null); setIsRunOpen(true); }}
            >
              Run
            </Button>
          )}
          <Button
            size="sm"
            color="primary"
            isLoading={saving}
            startContent={saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            onPress={save}
          >
            {saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-sm text-red-400">
          <span>{saveError}</span>
          <button className="ml-auto text-red-400/60 hover:text-red-400" onClick={() => setSaveError(null)}>✕</button>
        </div>
      )}

      {/* Git sync bar */}
      {hasGit && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-card border-b border-border-base text-xs text-th-muted">
          <GitBranch className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="truncate font-mono">{playbook.gitRepo ?? gitRepo} · {playbook.gitBranch ?? gitBranch} · {playbook.gitPath ?? gitPath}</span>
          <Button
            size="sm"
            variant="flat"
            className="ml-auto shrink-0"
            isLoading={syncing}
            startContent={!syncing && <RefreshCw className="h-3 w-3" />}
            color={syncResult === "ok" ? "success" : syncResult === "error" ? "danger" : "default"}
            onPress={handleSync}
          >
            {syncResult === "ok" ? "Synced!" : syncResult === "error" ? "Failed" : "Sync"}
          </Button>
        </div>
      )}
      {syncError && (
        <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-sm text-red-400">
          <span>{syncError}</span>
          <button className="ml-auto text-red-400/60 hover:text-red-400" onClick={() => setSyncError(null)}>✕</button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          height="100%"
          defaultLanguage="yaml"
          theme="vs-dark"
          value={content}
          onChange={(val) => setContent(val ?? "")}
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            minimap: { enabled: false },
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>

      {/* Dependencies (Galaxy roles & collections) modal */}
      <UiModal
        isOpen={isReqOpen}
        onClose={() => setIsReqOpen(false)}
        title="Dependencies — roles & collections"
        size="2xl"
        footer={
          <>
            <Button variant="light" onPress={() => setIsReqOpen(false)}>Cancel</Button>
            <Button color="success" isLoading={reqSaving} onPress={handleRequirementsSave}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-th-muted">
            Ansible Galaxy <code className="bg-input px-1 rounded">requirements.yml</code>. Roles and collections
            are installed with <code className="bg-input px-1 rounded">ansible-galaxy install</code> before each run.
            Leave empty for none.
          </p>
          <div className="h-[45vh] rounded-lg overflow-hidden border border-border-base">
            <MonacoEditor
              height="100%"
              defaultLanguage="yaml"
              theme="vs-dark"
              value={requirements}
              onChange={(val) => setRequirements(val ?? "")}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
              }}
            />
          </div>
          <p className="text-xs text-th-subtle">
            Example:
            <br />
            <code className="bg-input px-1 rounded">roles:</code> — <code className="bg-input px-1 rounded">name: geerlingguy.docker</code>
            {" · "}
            <code className="bg-input px-1 rounded">collections:</code> — <code className="bg-input px-1 rounded">name: community.general</code>
          </p>
        </div>
      </UiModal>

      {/* Git settings modal */}
      <UiModal
        isOpen={isGitOpen}
        onClose={() => setIsGitOpen(false)}
        title="Git Repository"
        footer={
          <>
            <Button variant="light" onPress={() => setIsGitOpen(false)}>Cancel</Button>
            <Button color="success" isLoading={gitSaving} onPress={handleGitSave}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Repository URL</label>
            <input type="url" value={gitRepo} onChange={e => setGitRepo(e.target.value)} placeholder="https://github.com/user/ansible-playbooks"
              className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-th-secondary">Branch</label>
              <input type="text" value={gitBranch} onChange={e => setGitBranch(e.target.value)} placeholder="main"
                className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-th-secondary">File path</label>
              <input type="text" value={gitPath} onChange={e => setGitPath(e.target.value)} placeholder="site.yml"
                className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Access token {playbook.hasGitToken ? "(leave empty to keep current)" : "(optional)"}</label>
            <input type="password" value={gitToken} onChange={e => setGitToken(e.target.value)} placeholder="ghp_… or glpat-…"
              className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
          </div>
          {playbook.gitRepo && (
            <Button variant="flat" color="success" className="w-full" isLoading={syncing} startContent={<RefreshCw className="h-4 w-4" />}
              onPress={() => { setIsGitOpen(false); handleSync(); }}>
              Save & Sync now
            </Button>
          )}
        </div>
      </UiModal>

      {/* Run modal */}
      <UiModal
        isOpen={isRunOpen}
        onClose={() => setIsRunOpen(false)}
        title={`Run — ${name}`}
        footer={
          <>
            <Button variant="light" onPress={() => setIsRunOpen(false)}>Cancel</Button>
            <Button
              color="success"
              isLoading={running}
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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Tags (comma-separated)</label>
            <input
              type="text"
              value={runForm.tags}
              onChange={e => setRunForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="deploy, config"
              className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-th-secondary">Limit hosts</label>
            <input
              type="text"
              value={runForm.limitHosts}
              onChange={e => setRunForm(f => ({ ...f, limitHosts: e.target.value }))}
              placeholder="webservers"
              className="w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
            />
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
      </UiModal>

      {/* Version History Drawer */}
      <Drawer isOpen={isHistoryOpen} onClose={onHistoryClose} placement="right" size="sm">
        <DrawerContent className="bg-card">
          <DrawerHeader className="border-b border-border-base text-th-primary flex items-center gap-2">
            <Clock className="h-4 w-4 text-th-muted" />
            Version History
          </DrawerHeader>
          <DrawerBody className="p-0">
            {currentVersions.length === 0 ? (
              <p className="text-th-muted text-sm p-6">No versions yet. Save the playbook to create a version.</p>
            ) : (
              <ul className="divide-y divide-border-base">
                {currentVersions.map((v) => {
                  const author = v.changedByUser?.name ?? v.changedByUser?.email ?? "Unknown";
                  const isCurrent = v.version === latestVersion;
                  return (
                    <li key={v.id} className="p-4 hover:bg-input/40 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-th-primary text-sm">v{v.version}</span>
                          {isCurrent && (
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                              current
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            title="Compare with current editor"
                            onPress={() => { setDiffVersion(v); onHistoryClose(); }}
                          >
                            <GitCompare className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="flat"
                            color="warning"
                            isIconOnly
                            title="Restore this version"
                            onPress={() => restoreVersion(v)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-th-subtle">{formatDate(v.createdAt)}</p>
                      <p className="text-xs text-th-subtle mt-0.5">by {author}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Diff viewer modal */}
      <UiModal
        isOpen={!!diffVersion}
        onClose={() => setDiffVersion(null)}
        title={diffVersion ? `v${diffVersion.version} → current editor` : ""}
        size="4xl"
        footer={
          <>
            <Button variant="light" onPress={() => setDiffVersion(null)}>Close</Button>
            {diffVersion && (
              <Button
                color="warning"
                startContent={<RotateCcw className="h-4 w-4" />}
                onPress={() => { restoreVersion(diffVersion); setDiffVersion(null); }}
              >
                Restore v{diffVersion.version}
              </Button>
            )}
          </>
        }
      >
        <div className="h-[60vh]">
          {diffVersion && (
            <MonacoDiffEditor
              height="100%"
              language="yaml"
              theme="vs-dark"
              original={diffVersion.content}
              modified={content}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          )}
        </div>
      </UiModal>
    </div>
  );
}
