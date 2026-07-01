import { lookup } from "dns/promises";
import { isIP } from "net";
import { resolve, sep } from "path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventories, playbooks, servers, vaultPasswords, workflows } from "@/lib/db/schema";

type NullableId = string | null | undefined;

export interface ExecutionRefs {
  playbookId?: NullableId;
  inventoryId?: NullableId;
  serverId?: NullableId;
  vaultPasswordId?: NullableId;
}

function uniqueIds(ids: NullableId[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

async function requireOwnedIds(
  orgId: string,
  ids: NullableId[],
  table: typeof playbooks | typeof inventories | typeof servers | typeof vaultPasswords | typeof workflows,
  label: string
): Promise<string | null> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return null;

  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(inArray(table.id, unique), eq(table.organizationId, orgId)));

  return rows.length === unique.length ? null : `${label} not found`;
}

export async function validateExecutionRefs(orgId: string, refs: ExecutionRefs): Promise<string | null> {
  const playbookErr = await requireOwnedIds(orgId, [refs.playbookId], playbooks, "Playbook");
  if (playbookErr) return playbookErr;

  const inventoryErr = await requireOwnedIds(orgId, [refs.inventoryId], inventories, "Inventory");
  if (inventoryErr) return inventoryErr;

  const serverErr = await requireOwnedIds(orgId, [refs.serverId], servers, "Server");
  if (serverErr) return serverErr;

  const vaultErr = await requireOwnedIds(orgId, [refs.vaultPasswordId], vaultPasswords, "Vault password");
  if (vaultErr) return vaultErr;

  return null;
}

export async function validateServerIds(orgId: string, serverIds: NullableId[]): Promise<string | null> {
  return requireOwnedIds(orgId, uniqueIds(serverIds), servers, "One or more servers");
}

export async function validateWorkflowId(orgId: string, workflowId: string): Promise<string | null> {
  return requireOwnedIds(orgId, [workflowId], workflows, "Workflow");
}

export async function validateWorkflowStepRefs(
  orgId: string,
  steps: Array<{
    playbookId?: NullableId;
    inventoryId?: NullableId;
    options?: { vaultPasswordId?: NullableId };
  }>
): Promise<string | null> {
  const playbookErr = await requireOwnedIds(orgId, steps.map(s => s.playbookId), playbooks, "One or more playbooks");
  if (playbookErr) return playbookErr;

  const inventoryErr = await requireOwnedIds(orgId, steps.map(s => s.inventoryId), inventories, "One or more inventories");
  if (inventoryErr) return inventoryErr;

  const vaultErr = await requireOwnedIds(orgId, steps.map(s => s.options?.vaultPasswordId), vaultPasswords, "One or more vault passwords");
  if (vaultErr) return vaultErr;

  return null;
}

export function safeJoinUnder(baseDir: string, userPath: string): string | null {
  const cleaned = userPath.replace(/\\/g, "/").trim();
  if (!cleaned || cleaned.includes("\0") || cleaned.startsWith("/") || /^[a-zA-Z]:/.test(cleaned)) {
    return null;
  }

  const base = resolve(baseDir);
  const target = resolve(base, cleaned);
  const basePrefix = base.endsWith(sep) ? base : `${base}${sep}`;

  if (target !== base && !target.startsWith(basePrefix)) return null;
  return target;
}

function privateOutboundAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_OUTBOUND === "true";
}

function insecureHttpAllowed(): boolean {
  return process.env.ALLOW_INSECURE_OUTBOUND_HTTP === "true";
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h === "metadata.google.internal"
  );
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;

  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }

  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("ff")
  );
}

export async function assertSafeOutboundHost(hostname: string, label = "Host"): Promise<void> {
  if (privateOutboundAllowed()) return;
  if (isBlockedHostname(hostname)) throw new Error(`${label} points to a private or local address`);

  if (isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) throw new Error(`${label} points to a private or local address`);
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`${label} could not be resolved`);
  }

  if (addresses.length === 0 || addresses.some(entry => isPrivateIpAddress(entry.address))) {
    throw new Error(`${label} points to a private or local address`);
  }
}

export async function assertSafeHttpUrl(rawUrl: string, label = "URL"): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is invalid`);
  }

  const usesHttps = url.protocol === "https:";
  const usesAllowedHttp = url.protocol === "http:" && insecureHttpAllowed();
  if (!usesHttps && !usesAllowedHttp) {
    throw new Error(`${label} must use HTTPS`);
  }

  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials`);
  }

  await assertSafeOutboundHost(url.hostname, label);
  return url;
}

export async function assertSafeGitUrl(rawUrl: string): Promise<void> {
  await assertSafeHttpUrl(rawUrl, "Git repository URL");
}
