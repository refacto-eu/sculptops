"use client";

import { useState, useEffect } from "react";
import { Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, TextareaField } from "@/components/ui/field";
import { Plus, Trash2, Pencil, Play, GitBranch, Eye, SkipForward, X } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import { WorkflowStepEditor, type FormStep } from "./workflow-step-editor";
import { WorkflowExecutionViewer, type WorkflowExecution } from "./workflow-execution-viewer";

interface RefItem { id: string; name: string }

interface StepItem {
  id?: string;
  position: number;
  name?: string | null;
  playbookId: string | null;
  inventoryId: string | null;
  options: { dryRun?: boolean; tags?: string[]; limitHosts?: string; extraVars?: Record<string, string>; propagateVars?: boolean };
  onFailure: "stop" | "continue";
  playbook?: RefItem | null;
  inventory?: RefItem | null;
}

interface WorkflowItem {
  id: string;
  name: string;
  description: string | null;
  extraVars: Record<string, string>;
  steps: StepItem[];
  createdAt: Date;
  updatedAt: Date;
}

interface Props {
  initialWorkflows: WorkflowItem[];
  playbooks: RefItem[];
  inventories: RefItem[];
  role: "admin" | "member" | "viewer";
}

const emptyStep = (position: number): FormStep => ({
  position,
  name: "",
  playbookId: "",
  inventoryId: "",
  dryRun: false,
  onFailure: "stop",
  extraVars: [],
  propagateVars: false,
});

export function WorkflowsClient({ initialWorkflows, playbooks, inventories, role }: Props) {
  const canWrite = role !== "viewer";
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [tab, setTab] = useState<"workflows" | "history">("workflows");

  // Create/edit modal
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSteps, setFormSteps] = useState<FormStep[]>([emptyStep(0)]);
  const [formExtraVars, setFormExtraVars] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Delete + execution viewer
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewingExecId, setViewingExecId] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormSteps([emptyStep(0)]);
    setFormExtraVars([]);
    setApiError(null);
    setIsOpen(true);
  }

  function openEdit(w: WorkflowItem) {
    setEditingId(w.id);
    setFormName(w.name);
    setFormDesc(w.description ?? "");
    setFormExtraVars(Object.entries(w.extraVars ?? {}).map(([key, value]) => ({ key, value })));
    setFormSteps(
      w.steps.length > 0
        ? w.steps.map(s => ({
            position: s.position,
            name: s.name ?? "",
            playbookId: s.playbookId ?? "",
            inventoryId: s.inventoryId ?? "",
            dryRun: s.options?.dryRun ?? false,
            onFailure: s.onFailure,
            extraVars: Object.entries(s.options?.extraVars ?? {}).map(([key, value]) => ({ key, value })),
            propagateVars: s.options?.propagateVars ?? false,
          }))
        : [emptyStep(0)]
    );
    setApiError(null);
    setIsOpen(true);
  }

  function addStep() {
    setFormSteps(prev => [...prev, emptyStep(prev.length)]);
  }

  function removeStep(idx: number) {
    setFormSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i })));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    setFormSteps(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, position: i }));
    });
  }

  function updateStep(idx: number, patch: Partial<FormStep>) {
    setFormSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  async function handleSave() {
    setLoading(true);
    const payload = {
      name: formName,
      description: formDesc || undefined,
      extraVars: Object.fromEntries(formExtraVars.filter(v => v.key.trim()).map(v => [v.key.trim(), v.value])),
      steps: formSteps.map(s => ({
        position: s.position,
        name: s.name || undefined,
        playbookId: s.playbookId || null,
        inventoryId: s.inventoryId || null,
        options: {
          dryRun: s.dryRun,
          tags: [],
          extraVars: Object.fromEntries(s.extraVars.filter(v => v.key.trim()).map(v => [v.key.trim(), v.value])),
          propagateVars: s.propagateVars,
        },
        onFailure: s.onFailure,
      })),
    };
    const url = editingId ? `/api/workflows/${editingId}` : "/api/workflows";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      setWorkflows(prev => editingId ? prev.map(w => w.id === editingId ? data : w) : [data, ...prev]);
      setIsOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/workflows/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setWorkflows(prev => prev.filter(w => w.id !== deleteId)); setDeleteId(null); }
  }

  async function runWorkflow(workflowId: string) {
    setRunError(null);
    const res = await fetch("/api/workflow-executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId }),
    });
    if (res.ok) {
      const data = await res.json();
      setExecutions(prev => [data, ...prev]);
      setTab("history");
      setViewingExecId(data.id);
    } else {
      const data = await res.json().catch(() => ({}));
      setRunError(data.error ?? "Failed to start workflow");
    }
  }

  async function loadExecutions() {
    const res = await fetch("/api/workflow-executions");
    if (res.ok) setExecutions(await res.json());
  }

  useEffect(() => {
    if (tab === "history") loadExecutions();
  }, [tab]);

  const filtered = workflows.filter(w => {
    const q = search.toLowerCase();
    return !q || w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q);
  });

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border-base mb-6">
        {(["workflows", "history"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? "border-emerald-500 text-emerald-400" : "border-transparent text-th-muted hover:text-th-primary"
            }`}
          >
            {t === "workflows" ? "Workflows" : "Run History"}
          </button>
        ))}
      </div>

      {tab === "workflows" && (
        <>
          <FormError error={runError} />
          <div className="flex items-center gap-2 mb-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search workflows…" className="max-w-xs" />
            {canWrite && (
              <Button className="btn-primary ml-auto" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>
                New Workflow
              </Button>
            )}
          </div>

          {workflows.length === 0 ? (
            <EmptyState
              icon={GitBranch}
              title="No workflows yet"
              description="Chain multiple playbooks into an automated sequence."
              action={canWrite ? { label: "New Workflow", onClick: openCreate } : undefined}
            />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-th-subtle py-8 text-center">No workflows match &ldquo;{search}&rdquo;</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map(w => (
                <div key={w.id} className="bg-card border border-border-base rounded-xl overflow-hidden hover:border-border-strong transition-colors flex flex-col">
                  {/* Card body */}
                  <div className="p-5 flex flex-col gap-4 flex-1">
                    {/* Header: icon + name + description */}
                    <div className="flex gap-3 items-start">
                      <div className="shrink-0 w-9 h-9 rounded-lg bg-input border border-border-base flex items-center justify-center">
                        <GitBranch className="h-4 w-4 text-th-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-th-primary leading-tight truncate">{w.name}</h3>
                        {w.description
                          ? <p className="text-xs text-th-muted mt-1 line-clamp-2">{w.description}</p>
                          : <p className="text-xs text-th-subtle/60 mt-1 italic">No description</p>}
                      </div>
                    </div>

                    {/* Stats badge */}
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-input border border-border-base text-xs">
                        <Play className="h-3 w-3 text-th-subtle" />
                        <span className="font-semibold text-th-secondary">{w.steps.length}</span>
                        <span className="text-th-subtle">step{w.steps.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>

                    {/* Steps list */}
                    {w.steps.length > 0 ? (
                      <div className="space-y-1">
                        {w.steps.slice(0, 4).map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-th-muted">
                            <span className="w-4 h-4 rounded-full bg-input flex items-center justify-center text-th-secondary shrink-0 font-medium">{i + 1}</span>
                            <span className="truncate flex-1">{s.playbook?.name ?? <span className="text-th-subtle italic">No playbook</span>}</span>
                            {s.onFailure === "continue" && <Tip content="Continues on failure" placement="bottom"><SkipForward className="h-3 w-3 text-yellow-500 shrink-0" /></Tip>}
                          </div>
                        ))}
                        {w.steps.length > 4 && <p className="text-xs text-th-subtle pl-6">+{w.steps.length - 4} more steps</p>}
                      </div>
                    ) : (
                      <p className="text-xs text-th-subtle italic">No steps defined</p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3 bg-input/30 border-t border-border-base flex items-center justify-between gap-2">
                    <time className="text-xs text-th-subtle shrink-0">Updated {formatDate(w.updatedAt)}</time>
                    <div className="flex items-center gap-1">
                      {canWrite && (
                        <Tip content={w.steps.length === 0 ? "No steps defined" : "Run"} placement="bottom">
                          <Button
                            isIconOnly size="sm" variant="light" color="success"
                            isDisabled={w.steps.length === 0}
                            onPress={() => runWorkflow(w.id)}
                            className="hover:!bg-emerald-500/15 transition-colors"
                          >
                            <Play className="h-3.5 w-3.5 fill-emerald-400" />
                          </Button>
                        </Tip>
                      )}
                      {canWrite && (
                        <>
                          <div className="w-px h-4 bg-border-base mx-0.5" />
                          <Button
                            size="sm"
                            className="!bg-zinc-500/10 hover:!bg-zinc-500/20 !border !border-border-base hover:!border-border-strong !text-th-secondary !font-medium transition-colors"
                            startContent={<Pencil className="h-3.5 w-3.5" />}
                            onPress={() => openEdit(w)}
                          >
                            Edit
                          </Button>
                          <Tip content="Delete" color="danger" placement="bottom">
                            <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(w.id)} className="hover:!bg-red-500/15 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </Tip>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        executions.length === 0 ? (
          <EmptyState icon={Play} title="No runs yet" description="Run a workflow to see its execution history here." />
        ) : (
          <div className="bg-card border border-border-base rounded-xl overflow-hidden">
            <Table removeWrapper aria-label="Workflow executions" classNames={{ th: "bg-input text-th-secondary !px-3 !text-left", td: "text-th-secondary !px-3 !text-left" }}>
              <TableHeader>
                <TableColumn>WORKFLOW</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>STEPS</TableColumn>
                <TableColumn>STARTED</TableColumn>
                <TableColumn>DURATION</TableColumn>
                <TableColumn>LOGS</TableColumn>
              </TableHeader>
              <TableBody>
                {executions.map(ex => {
                  const dur = ex.startedAt && ex.finishedAt
                    ? `${Math.round((new Date(ex.finishedAt).getTime() - new Date(ex.startedAt).getTime()) / 1000)}s`
                    : ex.startedAt ? "Running…" : "—";
                  const done = ex.stepExecutions.filter(s => s.status === "success").length;
                  return (
                    <TableRow key={ex.id}>
                      <TableCell className="font-medium">{ex.workflow?.name ?? <span className="text-th-subtle">Deleted</span>}</TableCell>
                      <TableCell><StatusBadge status={ex.status as "pending" | "running" | "success" | "failed" | "cancelled"} /></TableCell>
                      <TableCell><span className="text-sm text-th-muted">{done}/{ex.stepExecutions.length} ok</span></TableCell>
                      <TableCell className="text-th-muted text-sm">{formatDate(ex.createdAt)}</TableCell>
                      <TableCell className="text-th-muted text-sm">{dur}</TableCell>
                      <TableCell>
                        <Tip content="View logs" placement="bottom">
                          <Button isIconOnly size="sm" variant="light" onPress={() => setViewingExecId(ex.id)} className="hover:!bg-zinc-500/15 transition-colors">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Tip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* Create/Edit modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit Workflow" : "New Workflow"}
        size="2xl"
        footer={
          <>
            <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
            <Button color="success" isLoading={loading} isDisabled={!formName} onPress={handleSave}>
              {editingId ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <FormError error={apiError} />
          <Field label="Name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Deploy stack" />
          <TextareaField label="Description (optional)" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="What does this workflow do?" />

          {/* Workflow-level vars */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-th-secondary">Workflow variables</p>
                <p className="text-xs text-th-subtle">Injected into all steps (overridable per step)</p>
              </div>
              <button
                type="button"
                onClick={() => setFormExtraVars(prev => [...prev, { key: "", value: "" }])}
                className="text-xs text-th-subtle hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add var
              </button>
            </div>
            {formExtraVars.length === 0 && (
              <p className="text-xs text-th-subtle italic">No workflow-level variables.</p>
            )}
            {formExtraVars.map((v, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={v.key}
                  onChange={e => setFormExtraVars(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                  placeholder="key"
                  className="w-32 rounded bg-card border border-border-base px-2 py-1 text-xs text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
                <span className="text-th-subtle text-xs">=</span>
                <input
                  value={v.value}
                  onChange={e => setFormExtraVars(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  placeholder="value"
                  className="flex-1 rounded bg-card border border-border-base px-2 py-1 text-xs text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={() => setFormExtraVars(prev => prev.filter((_, j) => j !== i))}
                  className="text-th-subtle hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <WorkflowStepEditor
            steps={formSteps}
            playbooks={playbooks}
            inventories={inventories}
            onAdd={addStep}
            onRemove={removeStep}
            onMove={moveStep}
            onUpdate={updateStep}
          />
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Workflow" size="sm" footer={
        <>
          <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
          <Button color="danger" onPress={handleDelete}>Delete</Button>
        </>
      }>
        <p className="text-th-secondary">Delete this workflow? Execution history will be removed.</p>
      </Modal>

      {/* Execution viewer */}
      <WorkflowExecutionViewer
        executionId={viewingExecId}
        onClose={() => setViewingExecId(null)}
        onUpdate={updated => setExecutions(prev => prev.map(e => e.id === updated.id ? updated : e))}
      />
    </>
  );
}
