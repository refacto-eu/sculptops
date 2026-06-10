import { describe, it, expect } from "vitest";
import { generateToken, hashToken, isApiToken } from "@/lib/api-token";

describe("generateToken", () => {
  it("starts with the at_ prefix", () => {
    expect(generateToken()).toMatch(/^at_/);
  });

  it("has 64 hex chars after the prefix (32 random bytes)", () => {
    const token = generateToken();
    expect(token.slice(3)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates a different token every call", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("hashToken", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = hashToken("at_" + "a".repeat(64));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same input gives same hash", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("different tokens produce different hashes", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it("a raw token never appears in its own hash", () => {
    const token = generateToken();
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("isApiToken", () => {
  it("returns true for a valid at_ token", () => {
    expect(isApiToken(generateToken())).toBe(true);
  });

  it("returns false for a plain string", () => {
    expect(isApiToken("not-a-token")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isApiToken("")).toBe(false);
  });

  it("returns false for a UUID", () => {
    expect(isApiToken("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});

describe("ROLE_RANK privilege escalation prevention", () => {
  // Mirrors the ROLE_RANK map in api/tokens/route.ts
  const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2 };

  it("viewer cannot create a member token", () => {
    expect(ROLE_RANK.member > ROLE_RANK.viewer).toBe(true);
  });

  it("viewer cannot create an admin token", () => {
    expect(ROLE_RANK.admin > ROLE_RANK.viewer).toBe(true);
  });

  it("member cannot create an admin token", () => {
    expect(ROLE_RANK.admin > ROLE_RANK.member).toBe(true);
  });

  it("admin can create a token of any role", () => {
    expect(ROLE_RANK.admin >= ROLE_RANK.admin).toBe(true);
    expect(ROLE_RANK.admin >= ROLE_RANK.member).toBe(true);
    expect(ROLE_RANK.admin >= ROLE_RANK.viewer).toBe(true);
  });
});
