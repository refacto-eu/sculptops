import { headers } from "next/headers";
import { getAuthContext, AuthContext } from "@/lib/session";
import { NextResponse } from "next/server";
import { isApiToken, hashToken } from "@/lib/api-token";

export type MemberRole = "admin" | "member" | "viewer";

const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, member: 1, admin: 2 };

function lowestRole(a: MemberRole, b: MemberRole): MemberRole {
  return ROLE_RANK[a] <= ROLE_RANK[b] ? a : b;
}

async function resolveApiToken(token: string): Promise<AuthContext | null> {
  const { db } = await import("@/lib/db");
  const { apiTokens, organizationMembers } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");

  const hash = hashToken(token);
  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, hash),
    with: { organization: true },
  });

  if (!row) return null;
  if (!row.createdBy) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, row.organizationId),
      eq(organizationMembers.userId, row.createdBy),
    ),
    columns: { role: true },
  });
  if (!membership) return null;

  const effectiveRole = lowestRole(row.role, membership.role);

  // Fire-and-forget lastUsedAt update — never blocks the request
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});

  return {
    userId: row.createdBy,
    org: row.organization,
    role: effectiveRole,
  };
}

/**
 * Returns the auth context for the current request.
 * Accepts both Auth.js session cookies and Bearer API tokens.
 */
export async function getCurrentOrg(): Promise<AuthContext | null> {
  const headersList = await headers();
  const authHeader = headersList.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (isApiToken(token)) return resolveApiToken(token);
  }

  return getAuthContext();
}

// Returns 403 response if caller is a viewer (read-only), null if allowed
export function requireWrite(ctx: AuthContext): NextResponse | null {
  if (ctx.role === "viewer") {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }
  return null;
}

// Returns 403 response if caller is not an admin, null if allowed
export function requireAdmin(ctx: AuthContext): NextResponse | null {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
  }
  return null;
}
