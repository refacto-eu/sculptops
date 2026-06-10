"use client";

import { useState, useEffect, useRef } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "@heroui/react";
import { X, FileUp } from "lucide-react";
import type { CommunityCategory } from "@/lib/community-client";

interface Prefill {
  name?: string;
  content?: string;
  description?: string;
  tags?: string[];
}

interface IdentityOption {
  handle: string;
  avatarUrl?: string;
  profileUrl?: string;
  type: "personal" | "org";
}

interface VerifiedIdentity {
  verified: boolean;
  identities?: IdentityOption[];
  method?: string;
}

interface Props {
  prefill?: Prefill;
  onClose: () => void;
  onSuccess: () => void;
}

const VALID_EXTENSIONS = [".yml", ".yaml"];
const MAX_FILE_BYTES   = 100 * 1024;

export function CommunitySubmitModal({ prefill, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [form, setForm] = useState({
    name:              prefill?.name ?? "",
    description:       prefill?.description ?? "",
    content:           prefill?.content ?? "",
    categoryId:        "",
    tags:              prefill?.tags?.join(", ") ?? "",
    authorName:        "",
    ansibleMinVersion: "",
  });
  const [fileError,  setFileError]  = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [slowSubmit,  setSlowSubmit]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [identity,      setIdentity]      = useState<VerifiedIdentity | null>(null);
  const [useVerified,   setUseVerified]   = useState(true);
  const [selectedIdent, setSelectedIdent] = useState<IdentityOption | null>(null);

  useEffect(() => {
    fetch("/api/community/categories")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCategories(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/user/community/identity")
      .then(r => r.json())
      .then((data: VerifiedIdentity) => {
        setIdentity(data);
        if (data.verified && data.identities?.length) {
          setSelectedIdent(data.identities[0]);
        }
      })
      .catch(() => {});
  }, []);

  function set(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function handleFile(file: File) {
    setFileError(null);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!VALID_EXTENSIONS.includes(ext)) { setFileError(`Invalid file type "${ext}". Only .yml and .yaml are accepted.`); return; }
    if (file.size > MAX_FILE_BYTES) { setFileError(`File too large (${(file.size / 1024).toFixed(1)} KB). Max 100 KB.`); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setForm(f => ({ ...f, content: text, name: f.name || file.name.replace(/\.(yml|yaml)$/i, "") }));
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) { setError("Content is required."); return; }
    setSubmitting(true); setError(null); setSlowSubmit(false);
    const slowTimer = setTimeout(() => setSlowSubmit(true), 3000);
    try {
      const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
      const body: Record<string, unknown> = {
        name: form.name.trim(), content: form.content, tags,
        useVerifiedIdentity: identity?.verified && useVerified,
        ...(identity?.verified && useVerified && selectedIdent
          ? { selectedHandle: selectedIdent.handle }
          : {}),
      };
      if (form.description.trim())       body.description       = form.description.trim();
      if (form.categoryId)               body.categoryId        = form.categoryId;
      if (!useVerified && form.authorName.trim()) body.authorName = form.authorName.trim();
      if (form.ansibleMinVersion.trim()) body.ansibleMinVersion = form.ansibleMinVersion.trim();
      const res  = await fetch("/api/community/playbooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      onSuccess();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Submission failed"); }
    finally { clearTimeout(slowTimer); setSubmitting(false); setSlowSubmit(false); }
  }

  const inputCls = "w-full rounded-lg bg-input border border-border-base px-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors";
  const labelCls = "block text-xs font-medium text-th-secondary mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-card border border-border-base rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-base shrink-0">
          <div>
            <h2 className="font-semibold text-th-primary">Submit to community library</h2>
            <p className="text-xs text-th-subtle mt-0.5">Your submission will be reviewed before appearing in the library.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-th-subtle hover:text-th-primary hover:bg-input transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* File drop — only shown if no prefilled content */}
            {!prefill?.content && (
              <div>
                <label className={labelCls}>YAML file <span className="text-th-subtle font-normal">(.yml / .yaml, max 100 KB)</span></label>
                <div className="border-2 border-dashed border-border-base rounded-lg p-5 text-center cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
                  <FileUp className="h-6 w-6 mx-auto mb-2 text-th-subtle" />
                  <p className="text-sm text-th-muted">{form.content ? <span className="text-emerald-400">File loaded</span> : "Drop a file or click to browse"}</p>
                  <input ref={fileRef} type="file" accept=".yml,.yaml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
                {fileError && <p className="text-xs text-red-400 mt-1">{fileError}</p>}
              </div>
            )}

            <div>
              <label className={labelCls}>Author</label>
              {identity?.verified && (
                <div className="space-y-2 mb-2">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setUseVerified(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${useVerified ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-input border-border-base text-th-subtle hover:text-th-secondary"}`}>
                      <BadgeCheck className="h-3 w-3" /> Verified
                    </button>
                    <button type="button" onClick={() => setUseVerified(false)}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${!useVerified ? "bg-input border-border-strong text-th-primary" : "bg-input border-border-base text-th-subtle hover:text-th-secondary"}`}>
                      Anonymous
                    </button>
                  </div>
                  <p className="text-xs text-th-subtle/60">
                    When submitting as verified, your {identity.method === "github" ? "GitHub" : "GitLab"} username will appear publicly on the playbook and cannot be changed.
                  </p>
                </div>
              )}
              {identity?.verified && useVerified ? (
                <div className="space-y-2">
                  {(identity.identities ?? []).map(opt => (
                    <button key={opt.handle} type="button" onClick={() => setSelectedIdent(opt)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left ${
                        selectedIdent?.handle === opt.handle
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-input border-border-base hover:border-border-strong"
                      }`}>
                      {opt.avatarUrl && <img src={opt.avatarUrl} alt="" className={`w-6 h-6 border border-border-base ${opt.type === "org" ? "rounded-md" : "rounded-full"}`} />}
                      <span className={`text-sm font-medium flex-1 ${selectedIdent?.handle === opt.handle ? "text-emerald-400" : "text-th-primary"}`}>
                        @{opt.handle}
                      </span>
                      <span className="text-xs text-th-subtle/60">{opt.type === "org" ? "Organization" : "Personal"}</span>
                      {selectedIdent?.handle === opt.handle && <BadgeCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  ))}
                  <p className="text-xs text-th-subtle/60">
                    This name will be publicly displayed — it is your {identity.method === "github" ? "GitHub" : "GitLab"} username and cannot be changed.
                  </p>
                </div>
              ) : (
                <input value={form.authorName} onChange={e => set("authorName", e.target.value)}
                  placeholder="e.g. devops_team (optional)"
                  className={inputCls} maxLength={255} />
              )}
            </div>
            <div><label className={labelCls}>Name <span className="text-red-400">*</span></label><input required value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Deploy Nginx" className={inputCls} maxLength={255} /></div>
            <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="What does this playbook do?" rows={2} className={`${inputCls} resize-none`} maxLength={2000} /></div>

            {/* YAML preview/edit */}
            <div>
              <label className={labelCls}>
                YAML content <span className="text-red-400">*</span>
                {prefill?.content && <span className="text-th-subtle font-normal ml-1">— pre-filled from your playbook</span>}
              </label>
              <textarea required value={form.content} onChange={e => set("content", e.target.value)}
                placeholder={"---\n- name: My playbook\n  hosts: all\n  tasks: []"}
                rows={8} className={`${inputCls} font-mono text-xs resize-y`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Category</label>
                <select value={form.categoryId} onChange={e => set("categoryId", e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Min Ansible version</label><input value={form.ansibleMinVersion} onChange={e => set("ansibleMinVersion", e.target.value)} placeholder="e.g. 2.14" className={inputCls} maxLength={50} /></div>
            </div>

            <div><label className={labelCls}>Tags <span className="text-th-subtle font-normal">(comma-separated)</span></label><input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="nginx, web, deploy" className={inputCls} /></div>
            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
          </div>

          <div className="px-5 py-4 border-t border-border-base flex justify-end gap-2 shrink-0 bg-input/20">
            {slowSubmit && (
              <p className="text-xs text-th-subtle/60 mr-auto flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
                Scanning for security issues…
              </p>
            )}
            <Button type="button" size="sm" className="btn-secondary-outline" onPress={onClose}>Cancel</Button>
            <Button type="submit" size="sm" className="btn-primary" isDisabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-1">
                  Submitting
                  <span className="flex gap-0.5 items-end pb-0.5">
                    <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </span>
              ) : "Submit for review"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
