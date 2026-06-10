import { describe, it, expect, vi, afterEach } from "vitest";
import { sep } from "node:path";
import { safeJoinUnder, assertSafeHttpUrl, assertSafeOutboundHost } from "@/lib/security";

vi.mock("dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "dns/promises";

// ─── safeJoinUnder ────────────────────────────────────────────────────────────

describe("safeJoinUnder", () => {
  const base = "/tmp/workspace";

  it("allows a simple relative path", () => {
    expect(safeJoinUnder(base, "playbook.yml")).toBeTruthy();
  });

  it("allows a nested relative path", () => {
    expect(safeJoinUnder(base, "roles/nginx/tasks/main.yml")).toBeTruthy();
  });

  it("blocks path traversal with ..", () => {
    expect(safeJoinUnder(base, "../etc/passwd")).toBeNull();
  });

  it("blocks deep path traversal", () => {
    expect(safeJoinUnder(base, "a/../../etc/passwd")).toBeNull();
  });

  it("blocks absolute paths", () => {
    expect(safeJoinUnder(base, "/etc/passwd")).toBeNull();
  });

  it("blocks Windows drive paths", () => {
    expect(safeJoinUnder(base, "C:/Windows/System32")).toBeNull();
  });

  it("blocks null bytes", () => {
    expect(safeJoinUnder(base, "file\0.yml")).toBeNull();
  });

  it("blocks backslash traversal", () => {
    expect(safeJoinUnder(base, "..\\..\\etc\\passwd")).toBeNull();
  });

  it("blocks empty string", () => {
    expect(safeJoinUnder(base, "")).toBeNull();
  });

  it("returns a string ending with the expected suffix", () => {
    const result = safeJoinUnder(base, "subdir/file.yml");
    expect(result).toBeTruthy();
    expect(result!.endsWith("workspace" + sep + "subdir" + sep + "file.yml")).toBe(true);
  });
});

// ─── assertSafeOutboundHost (IP-based, no DNS) ────────────────────────────────

describe("assertSafeOutboundHost — private IPs", () => {
  it("blocks 127.0.0.1", () => expect(assertSafeOutboundHost("127.0.0.1")).rejects.toThrow());
  it("blocks 10.0.0.1", ()  => expect(assertSafeOutboundHost("10.0.0.1")).rejects.toThrow());
  it("blocks 192.168.1.1",  () => expect(assertSafeOutboundHost("192.168.1.1")).rejects.toThrow());
  it("blocks 172.16.0.1",   () => expect(assertSafeOutboundHost("172.16.0.1")).rejects.toThrow());
  it("blocks 169.254.0.1",  () => expect(assertSafeOutboundHost("169.254.0.1")).rejects.toThrow());
  it("blocks 0.0.0.0",      () => expect(assertSafeOutboundHost("0.0.0.0")).rejects.toThrow());
  it("blocks ::1 (IPv6)",   () => expect(assertSafeOutboundHost("::1")).rejects.toThrow());
  it("blocks fe80:: (link-local IPv6)", () => expect(assertSafeOutboundHost("fe80::1")).rejects.toThrow());

  it("blocks localhost", () => expect(assertSafeOutboundHost("localhost")).rejects.toThrow());
  it("blocks sub.localhost", () => expect(assertSafeOutboundHost("sub.localhost")).rejects.toThrow());
  it("blocks *.local", () => expect(assertSafeOutboundHost("myserver.local")).rejects.toThrow());
  it("blocks metadata.google.internal", () => expect(assertSafeOutboundHost("metadata.google.internal")).rejects.toThrow());

  it("allows a public IP", async () => {
    await expect(assertSafeOutboundHost("8.8.8.8")).resolves.toBeUndefined();
  });
});

describe("assertSafeOutboundHost — DNS resolution", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("blocks hostname that resolves to a private IP", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "192.168.0.1", family: 4 }] as any);
    await expect(assertSafeOutboundHost("evil.internal")).rejects.toThrow("private");
  });

  it("blocks when DNS resolution fails", async () => {
    vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeOutboundHost("doesnotexist.invalid")).rejects.toThrow("resolved");
  });

  it("allows hostname resolving to a public IP", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    await expect(assertSafeOutboundHost("example.com")).resolves.toBeUndefined();
  });
});

// ─── assertSafeHttpUrl ────────────────────────────────────────────────────────

describe("assertSafeHttpUrl", () => {
  afterEach(() => { vi.clearAllMocks(); });

  const mockPublicDns = () =>
    vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);

  it("accepts a valid HTTPS URL", async () => {
    mockPublicDns();
    await expect(assertSafeHttpUrl("https://example.com/hook")).resolves.toBeInstanceOf(URL);
  });

  it("rejects HTTP by default", async () => {
    await expect(assertSafeHttpUrl("http://example.com")).rejects.toThrow("HTTPS");
  });

  it("accepts HTTP when ALLOW_INSECURE_OUTBOUND_HTTP=true", async () => {
    mockPublicDns();
    process.env.ALLOW_INSECURE_OUTBOUND_HTTP = "true";
    await expect(assertSafeHttpUrl("http://example.com")).resolves.toBeInstanceOf(URL);
    delete process.env.ALLOW_INSECURE_OUTBOUND_HTTP;
  });

  it("rejects URLs with embedded credentials", async () => {
    await expect(assertSafeHttpUrl("https://user:pass@example.com")).rejects.toThrow("credentials");
  });

  it("rejects malformed URLs", async () => {
    await expect(assertSafeHttpUrl("not-a-url")).rejects.toThrow("invalid");
  });

  it("rejects HTTPS to a private IP", async () => {
    await expect(assertSafeHttpUrl("https://192.168.1.1/webhook")).rejects.toThrow("private");
  });

  it("rejects HTTPS to localhost", async () => {
    await expect(assertSafeHttpUrl("https://localhost/hook")).rejects.toThrow("private");
  });
});
