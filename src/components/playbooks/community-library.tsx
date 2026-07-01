"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import {
  BookOpen, Download, Search, ChevronLeft, ChevronRight,
  SlidersHorizontal, Eye, X, User, Upload, ThumbsUp, ThumbsDown,
  Flag, ShieldCheck, ShieldAlert, BadgeCheck, CircleCheck, Building2,
} from "lucide-react";
import { Tip } from "@/components/ui/tip";
import type { CommunityPlaybook, CommunityCategory, PlaybookListResponse } from "@/lib/community-client";
import type { CommunityData, CommunityParams } from "@/lib/community-server";
import { CommunitySubmitModal } from "@/components/playbooks/community-submit-modal";

interface Props {
  role: "admin" | "member" | "viewer";
  data: CommunityData | null;
  params: CommunityParams;
}

const SORT_OPTIONS = [
  { value: "newest",    label: "Newest" },
  { value: "downloads", label: "Most downloaded" },
  { value: "popular",   label: "Most liked" },
];

const VALID_EXTENSIONS = [".yml", ".yaml"];
const MAX_FILE_BYTES   = 100 * 1024;

interface PlaybookDetail extends CommunityPlaybook {
  content: string;
}

function authorLabel(playbook: Pick<CommunityPlaybook, "authorHandle" | "authorName">) {
  return playbook.authorHandle ?? playbook.authorName;
}

function authorVerificationLabel(playbook: Pick<CommunityPlaybook, "authorType" | "authorVerifiedMethod">) {
  if (playbook.authorType === "org") return "Organization verified";
  if (!playbook.authorVerifiedMethod) return "Identity verified";
  return `Identity verified via ${playbook.authorVerifiedMethod === "github" ? "GitHub" : "GitLab"}`;
}

function authorLink(playbook: Pick<CommunityPlaybook, "authorUrl" | "authorVerifiedMethod" | "authorHandle">) {
  if (playbook.authorUrl) return playbook.authorUrl;
  if (!playbook.authorVerifiedMethod || !playbook.authorHandle) return null;
  return `https://${playbook.authorVerifiedMethod}.com/${playbook.authorHandle}`;
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

interface VoteState { likes: number; dislikes: number; userVote: "up" | "down" | null }

function DetailModal({
  playbook, canWrite, alreadyImported, savedVote,
  onClose, onImported, onVoteChange, onTagFilter, onRefresh,
}: {
  playbook: PlaybookDetail;
  canWrite: boolean;
  alreadyImported: boolean;
  savedVote: VoteState | null;
  onClose: () => void;
  onImported: (id: string) => void;
  onVoteChange: (id: string, v: VoteState) => void;
  onTagFilter: (tag: string) => void;
  onRefresh: () => void;
}) {
  const [voteState, setVoteState] = useState<VoteState>(
    savedVote ?? { likes: playbook.likes, dislikes: playbook.dislikes, userVote: null },
  );
  const [voting,    setVoting]    = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported,  setImported]  = useState(alreadyImported);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [reported,  setReported]  = useState(false);

  async function handleVote(direction: "up" | "down") {
    if (voting) return;
    setVoting(true);
    try {
      const res = await fetch(`/api/community/playbooks/${playbook.id}/vote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: direction }),
      });
      if (!res.ok) return;
      const data: VoteState = await res.json();
      setVoteState(data);
      onVoteChange(playbook.id, data);
    } finally { setVoting(false); }
  }

  async function handleImport() {
    if (!canWrite || imported) return;
    setImporting(true); setImportErr(null);
    try {
      const dlRes = await fetch(`/api/community/playbooks/${playbook.id}/download`);
      if (!dlRes.ok) throw new Error("Download failed");
      const content = await dlRes.text();
      const res = await fetch("/api/playbooks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: playbook.name,
          description: playbook.description ?? undefined,
          tags: playbook.tags ?? [],
          content,
          communitySourceId:   playbook.id,
          communitySourceName: playbook.name,
          communityAuthorName: playbook.authorName ?? undefined,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to add"); }
      setImported(true); onImported(playbook.id); onRefresh();
    } catch (e: unknown) { setImportErr(e instanceof Error ? e.message : "Import failed"); }
    finally { setImporting(false); }
  }

  async function handleReport() {
    if (reported) return;
    await fetch(`/api/community/playbooks/${playbook.id}/report`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    }).catch(() => {});
    setReported(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] flex flex-col bg-card border border-border-base rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-base shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-th-primary text-base leading-tight">{playbook.name}</h2>
              {playbook.verified && (
                <Tip content="Reviewed and verified by the SculptOps team" placement="top">
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 cursor-default">
                    <BadgeCheck className="h-3 w-3" /> Verified
                  </span>
                </Tip>
              )}
            </div>
            {(playbook.authorName || playbook.authorHandle) && (
              <p className="text-xs text-th-subtle mt-0.5 flex items-center gap-1.5">
                {playbook.verified || playbook.authorVerifiedMethod ? (
                  <Tip content={authorVerificationLabel(playbook)} placement="top">
                    {playbook.authorType === "org"
                      ? <Building2 className="h-3 w-3 shrink-0 cursor-default text-blue-400/80" />
                      : <CircleCheck className="h-3 w-3 shrink-0 cursor-default text-blue-400/80" />}
                  </Tip>
                ) : (
                  playbook.authorType === "org"
                    ? <Building2 className="h-3 w-3 shrink-0 text-blue-400/80" />
                    : <User className="h-3 w-3 shrink-0" />
                )}
                {authorLink(playbook)
                  ? <a href={authorLink(playbook)!} target="_blank" rel="noopener noreferrer" className={`transition-colors ${playbook.authorType === "org" ? "text-blue-400/80 hover:text-blue-400" : "hover:text-th-muted"}`}>{authorLabel(playbook)}</a>
                  : <span className={playbook.authorType === "org" ? "text-blue-400/80" : ""}>{authorLabel(playbook)}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-th-subtle hover:text-th-primary hover:bg-input transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            {playbook.description && (
              <p className="text-sm text-th-muted leading-relaxed">{playbook.description}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              {playbook.category && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-input border border-border-base text-th-muted">{playbook.category.name}</span>
              )}
              {playbook.ansibleMinVersion && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-input border border-border-base text-th-subtle">ansible ≥ {playbook.ansibleMinVersion}</span>
              )}
            </div>
            {playbook.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {playbook.tags.map(tag => (
                  <button key={tag} onClick={() => { onTagFilter(tag); onClose(); }}
                    className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-input border border-border-base text-th-muted hover:border-emerald-500/40 hover:text-emerald-400 transition-colors">
                    {tag}
                  </button>
                ))}
              </div>
            )}
            {playbook.scanResults && (
              playbook.scanResults.checkovAvailable
                ? <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/80"><ShieldCheck className="h-3 w-3" /><span>Security scanned · {new Date(playbook.scanResults.scannedAt).toLocaleDateString()}</span></div>
                : <div className="flex items-center gap-1.5 text-[11px] text-th-subtle/60"><ShieldAlert className="h-3 w-3" /><span>Security scan not available</span></div>
            )}
            <div className="rounded-lg border border-border-base overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-input/50 border-b border-border-base">
                <span className="w-2 h-2 rounded-full bg-border-strong" />
                <span className="text-xs font-mono text-th-subtle">playbook.yml</span>
              </div>
              <pre className="p-4 text-xs font-mono text-th-muted leading-relaxed whitespace-pre overflow-x-auto bg-input/10">{playbook.content}</pre>
            </div>
            {importErr && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{importErr}</div>}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border-base flex items-center justify-between gap-3 shrink-0 bg-input/20">
          <div className="flex items-center gap-3 text-xs text-th-subtle">
            <Tip content={voteState.userVote === "up" ? "Remove upvote" : "Upvote"} placement="top">
              <button onClick={() => handleVote("up")} disabled={voting}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${voteState.userVote === "up" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border-base hover:border-border-strong hover:text-th-secondary"}`}>
                <ThumbsUp className="h-3.5 w-3.5" />{voteState.likes}
              </button>
            </Tip>
            <Tip content={voteState.userVote === "down" ? "Remove downvote" : "Downvote"} placement="top">
              <button onClick={() => handleVote("down")} disabled={voting}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${voteState.userVote === "down" ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-border-base hover:border-border-strong hover:text-th-secondary"}`}>
                <ThumbsDown className="h-3.5 w-3.5" />{voteState.dislikes}
              </button>
            </Tip>
            <span className="flex items-center gap-1"><Download className="h-3 w-3" />{playbook.downloads}</span>
            <Tip content={reported ? "Reported" : "Report this playbook"} placement="top">
              <button onClick={handleReport} disabled={reported}
                className={`flex items-center gap-1 transition-colors ${reported ? "text-amber-400/60" : "text-th-subtle/60 hover:text-amber-400"}`}>
                <Flag className="h-3 w-3" />
              </button>
            </Tip>
          </div>
          {canWrite && (
            <Button size="sm" isLoading={importing} isDisabled={imported} onPress={handleImport}
              className={imported ? "!bg-emerald-500/10 !border !border-emerald-500/20 !text-emerald-400 !font-medium" : "btn-primary"}
              startContent={!importing && <Download className="h-3.5 w-3.5" />}>
              {imported ? "Added" : "Add to my playbooks"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommunityLibrary({ role, data, params }: Props) {
  const canWrite = role !== "viewer";
  const router   = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local interactive state only — data comes from server
  const [search,         setSearch]         = useState(params.q ?? "");
  const [imported,       setImported]       = useState<Set<string>>(new Set());
  const [importError,    setImportError]    = useState<string | null>(null);
  const [detailPlaybook, setDetailPlaybook] = useState<PlaybookDetail | null>(null);
  const [loadingDetail,  setLoadingDetail]  = useState<string | null>(null);
  const [votesCache,     setVotesCache]     = useState<Record<string, VoteState>>({});
  const [showSubmit,    setShowSubmit]    = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Sync search input when URL changes (e.g. back button)
  useEffect(() => { setSearch(params.q ?? ""); }, [params.q]);

  // Debounced search → push to URL
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.q ?? "") !== search) pushFilter("q", search || null);
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function pushFilter(key: string, value: string | null) {
    const sp = new URLSearchParams();
    sp.set("tab", "community");
    const current: Record<string, string | null> = {
      q: params.q ?? null, category: params.category ?? null,
      tag: params.tag ?? null, sort: params.sort ?? null, page: params.page ?? null,
    };
    current[key] = value;
    if (key !== "page") current.page = null; // reset page on filter change
    Object.entries(current).forEach(([k, v]) => { if (v) sp.set(k, v); });
    startTransition(() => { router.push(`?${sp}`); });
  }

  const categories: CommunityCategory[] = data?.state === "ok" ? data.categories : [];
  const result: PlaybookListResponse | null = data?.state === "ok" ? data.result : null;

  async function openDetail(pb: CommunityPlaybook) {
    setLoadingDetail(pb.id); setImportError(null);
    try {
      const res = await fetch(`/api/community/playbooks/${pb.id}`);
      if (!res.ok) throw new Error("Not found");
      setDetailPlaybook(await res.json());
    } finally { setLoadingDetail(null); }
  }

  async function handleCardImport(pb: CommunityPlaybook) {
    if (!canWrite) return;
    setImportError(null);
    try {
      const dlRes = await fetch(`/api/community/playbooks/${pb.id}/download`);
      if (!dlRes.ok) throw new Error("Download failed");
      const content = await dlRes.text();
      const res = await fetch("/api/playbooks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pb.name,
          description: pb.description ?? undefined,
          tags: pb.tags ?? [],
          content,
          communitySourceId:   pb.id,
          communitySourceName: pb.name,
          communityAuthorName: pb.authorName ?? undefined,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to add"); }
      setImported(prev => new Set(prev).add(pb.id));
      router.refresh();
    } catch (e: unknown) { setImportError(e instanceof Error ? e.message : "Import failed"); }
  }

  return (
    <div className="space-y-4">
      {detailPlaybook && (
        <DetailModal playbook={detailPlaybook} canWrite={canWrite}
          alreadyImported={imported.has(detailPlaybook.id)}
          savedVote={votesCache[detailPlaybook.id] ?? null}
          onClose={() => setDetailPlaybook(null)}
          onImported={id => setImported(prev => new Set(prev).add(id))}
          onVoteChange={(id, v) => setVotesCache(prev => ({ ...prev, [id]: v }))}
          onTagFilter={t => { pushFilter("tag", t); }}
          onRefresh={() => router.refresh()}
        />
      )}
      {showSubmit && <CommunitySubmitModal onClose={() => setShowSubmit(false)} onSuccess={() => { setShowSubmit(false); setSubmitSuccess(true); }} />}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-th-subtle pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search community…"
            className="w-full rounded-lg bg-input border border-border-base pl-9 pr-3 py-2 text-sm text-th-primary placeholder:text-th-subtle focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors" />
        </div>
        {params.tag && (
          <button onClick={() => pushFilter("tag", null)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
            #{params.tag}<X className="h-3 w-3 ml-0.5" />
          </button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <SlidersHorizontal className="h-3.5 w-3.5 text-th-subtle shrink-0" />
          <select value={params.sort ?? "newest"} onChange={e => pushFilter("sort", e.target.value)}
            className="rounded-lg bg-input border border-border-base px-2.5 py-2 text-sm text-th-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canWrite && (
            <Button size="sm" className="btn-secondary-outline ml-1" startContent={<Upload className="h-3.5 w-3.5" />}
              onPress={() => { setShowSubmit(true); setSubmitSuccess(false); }}>Submit</Button>
          )}
        </div>
      </div>

      {submitSuccess && (
        <div className="flex items-center justify-between text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          <span>Playbook submitted! It will appear in the library after review.</span>
          <button onClick={() => setSubmitSuccess(false)} className="text-th-subtle hover:text-th-muted ml-3"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => pushFilter("category", null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!params.category ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-input border-border-base text-th-muted hover:border-border-strong hover:text-th-secondary"}`}>
            All
          </button>
          {categories.map(cat => (
            <button key={cat.slug} onClick={() => pushFilter("category", cat.slug)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${params.category === cat.slug ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-input border-border-base text-th-muted hover:border-border-strong hover:text-th-secondary"}`}>
              {cat.name}<span className="ml-1.5 text-th-subtle">{cat.count}</span>
            </button>
          ))}
        </div>
      )}

      {importError && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{importError}</div>}

      {/* Grid */}
      {isPending || !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border-base rounded-xl overflow-hidden flex flex-col animate-pulse">
              <div className="p-5 flex flex-col gap-4 flex-1">
                <div className="flex gap-3 items-start"><div className="shrink-0 w-9 h-9 rounded-lg bg-input" /><div className="flex-1 space-y-2"><div className="h-4 bg-input rounded w-3/4" /><div className="h-3 bg-input rounded w-full" /></div></div>
                <div className="flex gap-2"><div className="h-6 w-20 bg-input rounded-full" /><div className="h-6 w-16 bg-input rounded-full" /></div>
              </div>
              <div className="px-5 py-3 bg-input/30 border-t border-border-base h-10" />
            </div>
          ))}
        </div>
      ) : data.state === "not_configured" ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-input border border-border-base">
            <BookOpen className="h-7 w-7 text-th-subtle" />
          </div>
          <p className="font-medium text-sm text-th-secondary">Community library not available</p>
          <p className="text-xs text-th-subtle max-w-sm">This instance is running without a community service. Configure <span className="font-mono">COMMUNITY_API_URL</span> to connect.</p>
        </div>
      ) : data.state === "error" ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-th-subtle">Community library unavailable — possible network issue or service down.</p>
        </div>
      ) : result && result.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <BookOpen className="h-10 w-10 text-th-subtle opacity-40" />
          <p className="text-sm text-th-muted">No playbooks found{params.q ? ` for "${params.q}"` : ""}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result?.items.map(pb => (
            <div key={pb.id} className="bg-card border border-border-base rounded-xl overflow-hidden hover:border-border-strong transition-colors flex flex-col">
              <div className="p-5 flex flex-col gap-3 flex-1">
                <div className="flex gap-3 items-start">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-input border border-border-base flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-th-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-th-primary leading-tight truncate">{pb.name}</h3>
                      {pb.verified && (
                        <Tip content="Reviewed and verified by the SculptOps team" placement="top">
                          <BadgeCheck className="h-3.5 w-3.5 text-blue-400 shrink-0 cursor-default" />
                        </Tip>
                      )}
                    </div>
                    {pb.description ? <p className="text-xs text-th-muted mt-1 line-clamp-2">{pb.description}</p> : <p className="text-xs text-th-subtle/60 mt-1 italic">No description</p>}
                  </div>
                </div>
                {(pb.authorName || pb.authorHandle) && (
                  <div className="flex items-center gap-1.5 text-xs text-th-subtle">
                    {pb.verified || pb.authorVerifiedMethod ? (
                      <Tip content={authorVerificationLabel(pb)} placement="top">
                        {pb.authorType === "org"
                          ? <Building2 className="h-3 w-3 shrink-0 cursor-default text-blue-400/80" />
                          : <CircleCheck className="h-3 w-3 shrink-0 cursor-default text-blue-400/80" />}
                      </Tip>
                    ) : (
                      pb.authorType === "org"
                        ? <Building2 className="h-3 w-3 shrink-0 text-blue-400/80" />
                        : <User className="h-3 w-3 shrink-0" />
                    )}
                    {authorLink(pb)
                      ? <a href={authorLink(pb)!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={`truncate transition-colors ${pb.authorType === "org" ? "text-blue-400/80 hover:text-blue-400" : "hover:text-th-muted"}`}>{authorLabel(pb)}</a>
                      : <span className={`truncate ${pb.authorType === "org" ? "text-blue-400/80" : ""}`}>{authorLabel(pb)}</span>}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {pb.category && <span className="text-[11px] px-2 py-0.5 rounded-full bg-input border border-border-base text-th-muted">{pb.category.name}</span>}
                  {pb.ansibleMinVersion && <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-input border border-border-base text-th-subtle">ansible ≥ {pb.ansibleMinVersion}</span>}
                </div>
                {pb.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pb.tags.slice(0, 4).map(t => (
                      <button key={t} onClick={() => pushFilter("tag", t)}
                        className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-input border border-border-base text-th-muted hover:border-emerald-500/40 hover:text-emerald-400 transition-colors">{t}</button>
                    ))}
                    {pb.tags.length > 4 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-input border border-border-base text-th-subtle">+{pb.tags.length - 4}</span>}
                  </div>
                )}
              </div>
              <div className="px-5 py-3 bg-input/30 border-t border-border-base flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-xs text-th-subtle">
                  <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{pb.likes}</span>
                  <span className="flex items-center gap-1"><Download className="h-3 w-3" />{pb.downloads}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Tip content="View details" placement="bottom">
                    <Button isIconOnly size="sm" variant="light" isLoading={loadingDetail === pb.id} onPress={() => openDetail(pb)} className="hover:!bg-zinc-500/15 transition-colors">
                      {loadingDetail !== pb.id && <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </Tip>
                  {canWrite && (
                    <Tip content={imported.has(pb.id) ? "Already added" : "Add to my playbooks"} placement="bottom">
                      <Button size="sm" isDisabled={imported.has(pb.id)} onPress={() => handleCardImport(pb)}
                        className={imported.has(pb.id) ? "!bg-emerald-500/10 !border !border-emerald-500/20 !text-emerald-400 !font-medium" : "!bg-zinc-500/10 hover:!bg-zinc-500/20 !border !border-border-base hover:!border-border-strong !text-th-secondary !font-medium"}
                        startContent={<Download className="h-3.5 w-3.5" />}>
                        {imported.has(pb.id) ? "Added" : "Add"}
                      </Button>
                    </Tip>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {result && result.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button isIconOnly size="sm" variant="light" isDisabled={!params.page || params.page === "1"} onPress={() => pushFilter("page", String(parseInt(params.page ?? "1") - 1))} className="hover:!bg-zinc-500/15 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-th-muted px-2">Page {result.page} / {result.totalPages}</span>
          <Button isIconOnly size="sm" variant="light" isDisabled={result.page >= result.totalPages} onPress={() => pushFilter("page", String(result.page + 1))} className="hover:!bg-zinc-500/15 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
