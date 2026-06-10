import { NextRequest, NextResponse } from "next/server";
import { load as yamlLoad } from "js-yaml";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptFromString } from "@/lib/crypto";

const BASE = process.env.COMMUNITY_API_URL?.replace(/\/$/, "");

// ─── Rate limiting (in-memory, keyed on the authenticated user) ───────────────
// Keyed on session.user.id rather than a client-supplied X-Forwarded-For header,
// which is spoofable. Submissions always require auth, so the user id is reliable.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const MAX_SUBMISSIONS   = 5;
const RATE_WINDOW_MS    = 24 * 60 * 60 * 1000;
const MAX_CONTENT_BYTES = 100 * 1024;

function checkRateLimit(key: string): boolean {
  const now   = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_SUBMISSIONS) return false;
  entry.count++;
  return true;
}

// ─── GET /api/community/playbooks ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!BASE) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const qs  = req.nextUrl.searchParams.toString();
    const res = await fetch(`${BASE}/api/playbooks${qs ? `?${qs}` : ""}`, { next: { revalidate: 60 } });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

// ─── POST /api/community/playbooks ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!BASE) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit(session.user.id)) {
    return NextResponse.json(
      { error: `Rate limit exceeded — max ${MAX_SUBMISSIONS} submissions per 24 h.` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const content: unknown = body.content;
  if (typeof content !== "string" || content.trim().length === 0)
    return NextResponse.json({ error: "Playbook content is required" }, { status: 422 });

  if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES)
    return NextResponse.json({ error: "Playbook content too large (max 100 KB)" }, { status: 413 });

  let parsed: unknown;
  try { parsed = yamlLoad(content); }
  catch (e: unknown) {
    return NextResponse.json({ error: `Invalid YAML: ${e instanceof Error ? e.message : "parse error"}` }, { status: 422 });
  }
  if (!parsed || typeof parsed !== "object")
    return NextResponse.json({ error: "Content must be a valid YAML document" }, { status: 422 });

  // Optional: identifies this as the official instance to the community API (wider
  // rate limits). Self-hosted instances submit anonymously — the community API
  // accepts keyless submissions and gates them via its scanner + moderation queue.
  const submitKey = process.env.COMMUNITY_SUBMIT_KEY;

  // Attach author submit token only if user chose verified identity
  let authorSubmitToken: string | undefined;
  const useVerifiedIdentity = body.useVerifiedIdentity === true;
  if (useVerifiedIdentity) {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { communitySubmitToken: true },
      });
      if (user?.communitySubmitToken) {
        authorSubmitToken = decryptFromString(user.communitySubmitToken);
      }
    } catch { /* graceful — submit without author token */ }
  }

  // Allowlist the fields forwarded to the community-api. The client must never be
  // able to supply security-sensitive fields (e.g. authorSubmitToken) directly —
  // that token is only ever the server-derived one from the verified-identity flow.
  const src = body as Record<string, unknown>;
  const ALLOWED = ["name", "content", "tags", "description", "categoryId", "authorName", "selectedHandle", "ansibleMinVersion"] as const;
  const forwarded: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (src[key] !== undefined) forwarded[key] = src[key];
  }
  if (authorSubmitToken) forwarded.authorSubmitToken = authorSubmitToken;

  try {
    const res = await fetch(`${BASE}/api/playbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(submitKey ? { "x-api-key": submitKey } : {}) },
      body: JSON.stringify(forwarded),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
