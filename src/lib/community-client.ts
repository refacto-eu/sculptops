const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

export interface CommunityCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  count: number;
}

export interface ScanResults {
  checkovAvailable: boolean;
  checkovFindings: { checkId: string; name: string; lines?: [number, number] }[];
  scannedAt: string;
}

export interface CommunityPlaybook {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  authorName: string | null;
  authorHandle: string | null;
  authorUrl: string | null;
  authorVerifiedMethod: "github" | "gitlab" | null;
  authorType: "personal" | "org" | null;
  sourceUrl: string | null;
  ansibleMinVersion: string | null;
  downloads: number;
  likes: number;
  dislikes: number;
  featured: boolean;
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  category: CommunityCategory | null;
  scanResults: ScanResults | null;
}

export interface CommunityPlaybookDetail extends CommunityPlaybook {
  content: string; // YAML
}

export interface PlaybookListResponse {
  items: CommunityPlaybook[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListParams {
  q?: string;
  category?: string;
  sort?: "newest" | "popular" | "downloads";
  page?: number;
  featured?: boolean;
}

async function apiFetch<T>(path: string): Promise<T> {
  if (!BASE) throw new Error("not_configured");
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Community API error ${res.status}: ${path}`);
  return res.json();
}

export async function getCategories(): Promise<CommunityCategory[]> {
  return apiFetch("/api/categories");
}

export async function getPlaybooks(params: ListParams = {}): Promise<PlaybookListResponse> {
  const qs = new URLSearchParams();
  if (params.q)        qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.sort)     qs.set("sort", params.sort);
  if (params.page)     qs.set("page", String(params.page));
  if (params.featured) qs.set("featured", "true");
  const query = qs.toString();
  return apiFetch(`/api/playbooks${query ? `?${query}` : ""}`);
}

export async function getPlaybook(id: string): Promise<CommunityPlaybookDetail> {
  return apiFetch(`/api/playbooks/${id}`);
}

export function getDownloadUrl(id: string): string {
  if (!BASE) throw new Error("not_configured");
  return `${BASE}/api/playbooks/${id}/download`;
}
