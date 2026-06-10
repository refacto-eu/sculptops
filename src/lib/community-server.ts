import type { CommunityCategory, CommunityPlaybook, PlaybookListResponse } from "./community-client";

const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

export type CommunityData =
  | { state: "ok"; categories: CommunityCategory[]; result: PlaybookListResponse }
  | { state: "not_configured" }
  | { state: "error"; message: string };

export interface CommunityParams {
  q?: string;
  category?: string;
  tag?: string;
  sort?: string;
  page?: string;
}

export async function fetchCommunityData(params: CommunityParams): Promise<CommunityData> {
  if (!BASE) return { state: "not_configured" };

  try {
    const qs = new URLSearchParams();
    if (params.q)        qs.set("q", params.q);
    if (params.category) qs.set("category", params.category);
    if (params.tag)      qs.set("tag", params.tag);
    if (params.sort)     qs.set("sort", params.sort);
    if (params.page)     qs.set("page", params.page);

    const [catRes, pbRes] = await Promise.all([
      fetch(`${BASE}/api/categories`, { next: { revalidate: 300 } }),
      fetch(`${BASE}/api/playbooks${qs.size ? `?${qs}` : ""}`, { cache: "no-store" }),
    ]);

    if (!catRes.ok || !pbRes.ok) throw new Error("upstream error");

    const [categories, result] = await Promise.all([catRes.json(), pbRes.json()]) as [CommunityCategory[], PlaybookListResponse];
    return { state: "ok", categories, result };
  } catch {
    return { state: "error", message: "Community service unavailable" };
  }
}
