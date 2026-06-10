"use client";

import { useState } from "react";
import { Button, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/react";
import { Tip } from "@/components/ui/tip";
import { Field, TextareaField } from "@/components/ui/field";
import { Plus, Pencil, Trash2, Key, Wand2, Copy, Check, Terminal } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { formatDate, copyToClipboard } from "@/lib/utils";

interface SshKeyItem { id: string; name: string; fingerprint: string | null; publicKey: string | null; createdAt: Date; }
interface Props { initialKeys: SshKeyItem[]; role: "admin" | "member" | "viewer" }

const defaultForm = { name: "", privateKey: "", publicKey: "" };
const defaultGenForm = { name: "", type: "ed25519" as "ed25519" | "rsa" };

export function SshKeysClient({ initialKeys, role }: Props) {
  const canWrite = role !== "viewer";
  const [keys, setKeys] = useState<SshKeyItem[]>(initialKeys);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Generate modal state
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [genForm, setGenForm] = useState(defaultGenForm);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<SshKeyItem | null>(null);
  const [copied, setCopied] = useState(false);

  // Copy-public-key state
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  function openCreate() { setEditingId(null); setForm(defaultForm); setErrors({}); setApiError(null); setIsOpen(true); }
  function openEdit(k: SshKeyItem) { setEditingId(k.id); setForm({ name: k.name, privateKey: "", publicKey: k.publicKey || "" }); setErrors({}); setApiError(null); setIsOpen(true); }
  function openGenerate() { setGenForm(defaultGenForm); setGenError(null); setGeneratedKey(null); setCopied(false); setIsGenOpen(true); }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Key name is required";
    if (!editingId && !form.privateKey.trim()) e.privateKey = "Private key is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    const url = editingId ? `/api/ssh-keys/${editingId}` : "/api/ssh-keys";
    const method = editingId ? "PATCH" : "POST";
    const payload = editingId
      ? { name: form.name, ...(form.privateKey && { privateKey: form.privateKey }), publicKey: form.publicKey || null }
      : { name: form.name, privateKey: form.privateKey, publicKey: form.publicKey || undefined };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      const data = await res.json();
      setKeys(prev => editingId ? prev.map(k => k.id === editingId ? { ...k, ...data } : k) : [data, ...prev]);
      setIsOpen(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setApiError(data.error ?? "An unexpected error occurred");
    }
    setLoading(false);
  }

  async function handleGenerate() {
    if (!genForm.name.trim()) { setGenError("Key name is required"); return; }
    setGenerating(true);
    setGenError(null);
    const res = await fetch("/api/ssh-keys/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: genForm.name, type: genForm.type }),
    });
    const data = await res.json();
    if (res.ok) {
      setGeneratedKey(data);
      setKeys(prev => [data, ...prev]);
    } else {
      setGenError(data.error ?? "Generation failed");
    }
    setGenerating(false);
  }

  function copyPublicKey(text: string, keyId: string) {
    copyToClipboard(text);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 5000);
  }

  function copyGenerated() {
    if (!generatedKey?.publicKey) return;
    copyToClipboard(generatedKey.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 5000);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/ssh-keys/${deleteId}`, { method: "DELETE" });
    if (res.ok) { setKeys(prev => prev.filter(k => k.id !== deleteId)); setDeleteId(null); }
  }

  return (
    <>
      {canWrite && (
        <div className="flex justify-end gap-2">
          <Button className="btn-secondary-outline" startContent={<Wand2 className="h-4 w-4" />} onPress={openGenerate}>Generate Key</Button>
          <Button className="btn-primary" startContent={<Plus className="h-4 w-4" />} onPress={openCreate}>Import Key</Button>
        </div>
      )}

      {keys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No SSH keys yet"
          description="Generate a new key pair or import an existing private key."
          action={canWrite ? { label: "Generate Key", onClick: openGenerate } : undefined}
        />
      ) : (
        <div className="bg-card border border-border-base rounded-xl overflow-hidden">
          <Table removeWrapper aria-label="SSH Keys" classNames={{ th: "bg-input text-th-secondary !px-3 !text-left", td: "text-th-secondary !px-3 !text-left" }}>
            <TableHeader>
              <TableColumn>NAME</TableColumn>
              <TableColumn>FINGERPRINT</TableColumn>
              <TableColumn>PUBLIC KEY</TableColumn>
              <TableColumn>CREATED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody>
              {keys.map(key => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs text-th-muted">{key.fingerprint ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-th-muted max-w-xs">
                    {key.publicKey ? (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[180px]">{key.publicKey.slice(0, 40)}…</span>
                        <button
                          onClick={() => copyPublicKey(key.publicKey!, key.id)}
                          className="flex items-center gap-1 shrink-0 transition-colors"
                        >
                          {copiedKeyId === key.id
                            ? <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium"><Check className="h-3.5 w-3.5" />Copied!</span>
                            : <span className="flex items-center gap-1 text-th-subtle hover:text-th-secondary"><Copy className="h-3.5 w-3.5" /></span>}
                        </button>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-th-muted text-sm">{formatDate(key.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {canWrite && <Tip content="Edit" placement="bottom"><Button isIconOnly size="sm" variant="light" onPress={() => openEdit(key)} className="hover:!bg-zinc-500/15 transition-colors"><Pencil className="h-3.5 w-3.5" /></Button></Tip>}
                      {canWrite && <Tip content="Delete" color="danger" placement="bottom"><Button isIconOnly size="sm" variant="light" color="danger" onPress={() => setDeleteId(key.id)} className="hover:!bg-red-500/15 transition-colors"><Trash2 className="h-3.5 w-3.5" /></Button></Tip>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Generate Key modal */}
      <Modal
        isOpen={isGenOpen}
        onClose={() => setIsGenOpen(false)}
        title="Generate SSH Key Pair"
        size="lg"
        footer={
          generatedKey ? (
            <Button color="success" onPress={() => setIsGenOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="light" onPress={() => setIsGenOpen(false)}>Cancel</Button>
              <Button
                color="success"
                isLoading={generating}
                isDisabled={!genForm.name.trim()}
                startContent={!generating && <Wand2 className="h-4 w-4" />}
                onPress={handleGenerate}
              >
                Generate
              </Button>
            </>
          )
        }
      >
        {generatedKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <Check className="h-4 w-4" />
              Key <span className="font-semibold">{generatedKey.name}</span> generated and saved
            </div>
            {generatedKey.fingerprint && (
              <p className="text-xs text-th-subtle font-mono">{generatedKey.fingerprint}</p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-th-secondary">Public key</label>
                <button
                  onClick={copyGenerated}
                  className="flex items-center gap-1 text-xs transition-colors"
                >
                  {copied
                    ? <span className="flex items-center gap-1 text-emerald-400 font-semibold"><Check className="h-3.5 w-3.5" />Copied!</span>
                    : <span className="flex items-center gap-1 text-th-muted hover:text-emerald-400"><Copy className="h-3.5 w-3.5" />Copy</span>}
                </button>
              </div>
              <textarea
                readOnly
                value={generatedKey.publicKey ?? ""}
                rows={3}
                className="w-full rounded-lg bg-page border border-border-base px-3 py-2 text-xs font-mono text-th-secondary resize-none focus:outline-none"
              />
            </div>

            <div className="rounded-lg bg-card border border-border-base p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-th-muted">
                <Terminal className="h-3.5 w-3.5" />
                Deploy to a server
              </div>
              <p className="text-xs text-th-subtle">Run this on the target server (replace <code className="bg-input px-1 rounded">user@host</code>):</p>
              <pre className="text-xs font-mono text-emerald-300 bg-page rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {`echo "${generatedKey.publicKey?.trim()}" >> ~/.ssh/authorized_keys`}
              </pre>
              <p className="text-xs text-th-subtle">Or use <code className="bg-input px-1 rounded">ssh-copy-id</code> if you already have password access.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <FormError error={genError} />
            <Field
              label="Key name"
              value={genForm.name}
              onChange={e => setGenForm(f => ({ ...f, name: e.target.value }))}
              placeholder="production-deploy"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-th-secondary">Key type</label>
              <div className="flex gap-2">
                {(["ed25519", "rsa"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setGenForm(f => ({ ...f, type: t }))}
                    className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors text-left ${
                      genForm.type === t
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                        : "border-border-base bg-input text-th-muted hover:border-border-strong"
                    }`}
                  >
                    <div className="font-semibold">{t === "ed25519" ? "Ed25519" : "RSA 4096"}</div>
                    <div className="text-xs font-normal mt-0.5 opacity-70">
                      {t === "ed25519" ? "Recommended — fast, secure, modern" : "Maximum compatibility with legacy systems"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Import Key modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit SSH Key" : "Import SSH Key"}
        size="xl"
        footer={
          <>
            <Button variant="light" onPress={() => setIsOpen(false)}>Cancel</Button>
            <Button color="success" isLoading={loading} isDisabled={!form.name || (!editingId && !form.privateKey)} onPress={handleSave}>
              {editingId ? "Save" : "Import"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError error={apiError} />
          <Field label="Key Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="my-production-key" error={errors.name} />
          <TextareaField
            label={editingId ? "Private Key (leave empty to keep current)" : "Private Key"}
            value={form.privateKey}
            onChange={e => setForm({ ...form, privateKey: e.target.value })}
            placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
            minRows={6}
            className="font-mono text-xs"
            error={errors.privateKey}
          />
          <TextareaField label="Public Key (optional)" value={form.publicKey} onChange={e => setForm({ ...form, publicKey: e.target.value })} placeholder="ssh-rsa AAAA..." minRows={2} className="font-mono text-xs" />
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete SSH Key"
        size="sm"
        footer={
          <>
            <Button variant="light" onPress={() => setDeleteId(null)}>Cancel</Button>
            <Button color="danger" onPress={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-th-secondary">This will permanently delete the key. Servers using it will lose their SSH key association.</p>
      </Modal>
    </>
  );
}
