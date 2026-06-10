import { describe, it, expect, vi } from "vitest";

// Mock before any import that would pull in next-auth / Next.js internals
vi.mock("@/lib/session", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { requireWrite, requireAdmin } from "@/lib/get-org";
import type { AuthContext } from "@/lib/session";

function makeCtx(role: "admin" | "member" | "viewer"): AuthContext {
  return {
    userId: "test-user-id",
    org: { id: "test-org-id", name: "Test Org", slug: "test-org", createdAt: new Date(), updatedAt: new Date() },
    role,
  };
}

// ─── requireWrite ─────────────────────────────────────────────────────────────

describe("requireWrite", () => {
  it("returns null for admin", () => {
    expect(requireWrite(makeCtx("admin"))).toBeNull();
  });

  it("returns null for member", () => {
    expect(requireWrite(makeCtx("member"))).toBeNull();
  });

  it("returns 403 response for viewer", async () => {
    const res = requireWrite(makeCtx("viewer"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toMatch(/forbidden/i);
  });
});

// ─── requireAdmin ─────────────────────────────────────────────────────────────

describe("requireAdmin", () => {
  it("returns null for admin", () => {
    expect(requireAdmin(makeCtx("admin"))).toBeNull();
  });

  it("returns 403 response for member", async () => {
    const res = requireAdmin(makeCtx("member"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toMatch(/forbidden/i);
  });

  it("returns 403 response for viewer", async () => {
    const res = requireAdmin(makeCtx("viewer"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toMatch(/forbidden/i);
  });
});
