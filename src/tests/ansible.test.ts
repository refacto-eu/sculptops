import { describe, it, expect } from "vitest";
import { normalizePrivateKey, buildInventoryContent } from "@/lib/ansible";
import type { ExecutionContext } from "@/lib/ansible";

// ─── normalizePrivateKey ──────────────────────────────────────────────────────

describe("normalizePrivateKey", () => {
  const HEADER = "-----BEGIN OPENSSH PRIVATE KEY-----";
  const FOOTER = "-----END OPENSSH PRIVATE KEY-----";

  it("produces a key that ends with a newline", () => {
    const key = `${HEADER}\nABCDEF\n${FOOTER}`;
    expect(normalizePrivateKey(key)).toMatch(/\n$/);
  });

  it("strips Windows CRLF line endings", () => {
    const key = `${HEADER}\r\nABCDEF\r\n${FOOTER}\r\n`;
    expect(normalizePrivateKey(key)).not.toContain("\r");
  });

  it("strips UTF-8 BOM if present", () => {
    const key = `﻿${HEADER}\nABCDEF\n${FOOTER}`;
    const result = normalizePrivateKey(key);
    expect(result.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("re-wraps base64 body at exactly 70 chars per line", () => {
    // 210 chars of base64 → should wrap into 3 lines of 70
    const base64 = "A".repeat(210);
    const key = `${HEADER}\n${base64}\n${FOOTER}`;
    const result = normalizePrivateKey(key);
    const bodyLines = result.split("\n").filter(l => l && !l.startsWith("---"));
    expect(bodyLines).toHaveLength(3);
    expect(bodyLines.every(l => l.length <= 70)).toBe(true);
  });

  it("re-wraps even when base64 was split across many lines", () => {
    // Simulate a key pasted with 10-char line breaks
    const body = "B".repeat(140);
    const splitBody = body.match(/.{1,10}/g)!.join("\n");
    const key = `${HEADER}\n${splitBody}\n${FOOTER}`;
    const result = normalizePrivateKey(key);
    const bodyLines = result.split("\n").filter(l => l && !l.startsWith("---"));
    expect(bodyLines.every(l => l.length <= 70)).toBe(true);
    // Re-joining must equal original base64 body
    expect(bodyLines.join("")).toBe(body);
  });

  it("preserves the header and footer verbatim", () => {
    const key = `${HEADER}\nABC\n${FOOTER}`;
    const result = normalizePrivateKey(key);
    expect(result).toContain(HEADER);
    expect(result).toContain(FOOTER);
  });

  it("returns content + newline for non-PEM input", () => {
    const raw = "not a real key";
    const result = normalizePrivateKey(raw);
    expect(result).toBe("not a real key\n");
  });
});

// ─── buildInventoryContent ────────────────────────────────────────────────────

function makeCtx(groups: ExecutionContext["inventory"]["groups"]): ExecutionContext {
  return {
    execution: {} as any,
    playbook: {} as any,
    sshKeys: [],
    inventory: { groups } as any,
  };
}

describe("buildInventoryContent", () => {
  it("produces a [group] header for each group", () => {
    const ini = buildInventoryContent(makeCtx([
      { name: "webservers", variables: {}, hosts: [] },
      { name: "databases", variables: {}, hosts: [] },
    ]));
    expect(ini).toContain("[webservers]");
    expect(ini).toContain("[databases]");
  });

  it("includes host with ansible_port and ansible_user", () => {
    const ini = buildInventoryContent(makeCtx([{
      name: "web",
      variables: {},
      hosts: [{
        server: { host: "10.0.0.1", port: 2222, username: "deploy", sshKeyId: null } as any,
        variables: {},
      }],
    }]));
    expect(ini).toContain("10.0.0.1");
    expect(ini).toContain("ansible_port=2222");
    expect(ini).toContain("ansible_user=deploy");
  });

  it("adds ansible_ssh_private_key_file when sshKeyId is set", () => {
    const ini = buildInventoryContent(makeCtx([{
      name: "servers",
      variables: {},
      hosts: [{
        server: { host: "192.168.1.1", port: 22, username: "root", sshKeyId: "key-uuid-abc" } as any,
        variables: {},
      }],
    }]));
    expect(ini).toContain("ansible_ssh_private_key_file=/tmp/keys/key-uuid-abc.pem");
  });

  it("omits ansible_ssh_private_key_file when sshKeyId is null", () => {
    const ini = buildInventoryContent(makeCtx([{
      name: "servers",
      variables: {},
      hosts: [{
        server: { host: "10.0.0.2", port: 22, username: "root", sshKeyId: null } as any,
        variables: {},
      }],
    }]));
    expect(ini).not.toContain("ansible_ssh_private_key_file");
  });

  it("emits [group:vars] section when group has variables", () => {
    const ini = buildInventoryContent(makeCtx([{
      name: "appservers",
      variables: { ansible_python_interpreter: "/usr/bin/python3", http_port: "8080" },
      hosts: [],
    }]));
    expect(ini).toContain("[appservers:vars]");
    expect(ini).toContain("ansible_python_interpreter=/usr/bin/python3");
    expect(ini).toContain("http_port=8080");
  });

  it("omits [group:vars] when group has no variables", () => {
    const ini = buildInventoryContent(makeCtx([{
      name: "clean",
      variables: {},
      hosts: [],
    }]));
    expect(ini).not.toContain("[clean:vars]");
  });

  it("merges host-level variables onto the host line", () => {
    const ini = buildInventoryContent(makeCtx([{
      name: "mixed",
      variables: {},
      hosts: [{
        server: { host: "10.10.10.1", port: 22, username: "admin", sshKeyId: null } as any,
        variables: { custom_var: "hello" },
      }],
    }]));
    expect(ini).toContain("custom_var=hello");
  });

  it("returns empty string for empty inventory", () => {
    const ini = buildInventoryContent(makeCtx([]));
    expect(ini.trim()).toBe("");
  });
});
