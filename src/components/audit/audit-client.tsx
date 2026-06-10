"use client";

import { useState } from "react";
import { Shield, Server, Key, List, BookOpen, Play, Filter, Download, FileText, Braces, Globe, Users, Mail, Webhook, Clock, Workflow, User, Lock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Pager } from "@/components/ui/pager";

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
}

interface Props {
  initialItems: AuditEntry[];
  initialTotal: number;
  resourceTypes: string[];
}

const PAGE_SIZE = 50;

const resourceIcons: Record<string, React.ElementType> = {
  server: Server, ssh_key: Key, inventory: List, playbook: BookOpen, execution: Play,
  vault_password: Lock, api_token: Key, member: Users, invite: Mail,
  webhook: Webhook, schedule: Clock, workflow: Workflow, account: User,
};

const actionColors: Record<string, string> = {
  created:   "text-emerald-400 bg-emerald-400/10",
  updated:   "text-blue-400 bg-blue-400/10",
  deleted:   "text-red-400 bg-red-400/10",
  executed:  "text-yellow-400 bg-yellow-400/10",
  tested:    "text-purple-400 bg-purple-400/10",
  cancelled: "text-orange-400 bg-orange-400/10",
};

const resourceLabels: Record<string, string> = {
  server: "Server", ssh_key: "SSH Key", inventory: "Inventory",
  playbook: "Playbook", execution: "Execution", vault_password: "Vault Password",
  api_token: "API Token", member: "Member", invite: "Invite",
  webhook: "Webhook", schedule: "Schedule", workflow: "Workflow", account: "Account",
};

function csvCell(v: string) {
  return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
}
function downloadBlob(content: string, filename: string, mime: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([content], { type: mime })), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}
function toCSV(logs: AuditEntry[]) {
  const headers = ["Date", "Actor", "IP Address", "Action", "Resource Type", "Resource Name", "Resource ID", "Metadata"];
  const rows = logs.map(l => [
    new Date(l.createdAt).toISOString(),
    l.userName || l.userEmail || "System",
    l.ipAddress ?? "",
    l.action,
    resourceLabels[l.resourceType] ?? l.resourceType,
    l.resourceName ?? "", l.resourceId ?? "",
    l.metadata ? Object.entries(l.metadata).filter(([,v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k,v]) => `${k}=${Array.isArray(v) ? (v as string[]).join("|") : v}`).join("; ") : "",
  ].map(csvCell));
  return [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
}

export function AuditClient({ initialItems, initialTotal, resourceTypes }: Props) {
  const [items, setItems] = useState<AuditEntry[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  async function fetch_(p: number, type: string) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (type && type !== "all") params.set("type", type);
    const res = await fetch(`/api/audit-logs?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setPage(p);
    }
    setLoading(false);
  }

  function handleTypeChange(type: string) {
    setTypeFilter(type);
    fetch_(1, type);
  }

  function handlePageChange(p: number) {
    fetch_(p, typeFilter);
  }

  return (
    <div className="space-y-4">
      {/* Filter + export bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-th-subtle shrink-0" />
        {["all", ...resourceTypes].map(type => (
          <button
            key={type}
            onClick={() => handleTypeChange(type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              typeFilter === type
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-input text-th-muted border border-border-base hover:text-th-primary"
            }`}
          >
            {type === "all" ? "All" : resourceLabels[type] ?? type}
          </button>
        ))}

        <div className="relative ml-auto">
          <button
            onClick={() => setExportOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-input border border-border-base text-xs font-medium text-th-muted hover:text-th-primary hover:border-border-strong transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export {total > 0 && <span className="text-th-subtle ml-1">({total})</span>}
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg bg-input border border-border-base shadow-xl z-10 overflow-hidden">
              <button onClick={() => { downloadBlob(toCSV(items), `audit-log-${Date.now()}.csv`, "text/csv;charset=utf-8;"); setExportOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-th-secondary hover:bg-card hover:text-th-primary transition-colors">
                <FileText className="h-4 w-4 text-th-subtle" /> Export page as CSV
              </button>
              <button onClick={() => { downloadBlob(JSON.stringify(items.map(l => ({ date: new Date(l.createdAt).toISOString(), actor: l.userName || l.userEmail || "System", ipAddress: l.ipAddress, action: l.action, resourceType: l.resourceType, resourceName: l.resourceName, resourceId: l.resourceId, metadata: l.metadata })), null, 2), `audit-log-${Date.now()}.json`, "application/json"); setExportOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-th-secondary hover:bg-card hover:text-th-primary transition-colors">
                <Braces className="h-4 w-4 text-th-subtle" /> Export page as JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* List */}
      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-th-subtle">
          <Shield className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">No audit events yet.</p>
          <p className="text-xs mt-1">Actions will appear here as they happen.</p>
        </div>
      ) : (
        <div className={`bg-input border border-border-base rounded-xl overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="divide-y divide-border-base/50">
            {items.map(log => {
              const Icon = resourceIcons[log.resourceType] ?? Shield;
              const actionStyle = actionColors[log.action] ?? "text-th-muted bg-th-muted/10";
              const actor = log.userName || log.userEmail || "System";
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-card/60 transition-colors">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card">
                    <Icon className="h-4 w-4 text-th-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-th-primary">{actor}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${actionStyle}`}>{log.action}</span>
                      <span className="text-sm text-th-secondary">
                        {resourceLabels[log.resourceType] ?? log.resourceType}
                        {log.resourceName && <span className="font-medium text-th-primary"> "{log.resourceName}"</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-th-subtle">
                        <Globe className="h-3 w-3 shrink-0" />{log.ipAddress ?? "—"}
                      </span>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <p className="text-xs text-th-subtle truncate">
                          {Object.entries(log.metadata).filter(([,v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k,v]) => `${k}: ${Array.isArray(v) ? (v as string[]).join(", ") : v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-th-subtle mt-1">{formatDate(log.createdAt)}</time>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-th-subtle">
          {total > 0 && `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
        </span>
        <Pager page={page} totalPages={totalPages} onPageChange={handlePageChange} isLoading={loading} />
        <span className="w-24" />
      </div>
    </div>
  );
}
