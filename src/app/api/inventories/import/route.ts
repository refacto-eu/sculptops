import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventories, inventoryGroups, inventoryHosts, servers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { load as yamlLoad } from "js-yaml";

type ParsedGroup = {
  name: string;
  variables: Record<string, string>;
  hosts: { host: string; variables: Record<string, string> }[];
};

// --- INI parser ---
function parseIni(content: string): ParsedGroup[] {
  const groups: Map<string, ParsedGroup> = new Map();
  let currentGroup: ParsedGroup | null = null;
  let inVarsSection = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    // [group:vars] section
    const varsMatch = line.match(/^\[(.+):vars\]$/);
    if (varsMatch) {
      const name = varsMatch[1];
      if (!groups.has(name)) groups.set(name, { name, variables: {}, hosts: [] });
      currentGroup = groups.get(name)!;
      inVarsSection = true;
      continue;
    }

    // [group] section
    const groupMatch = line.match(/^\[(.+)\]$/);
    if (groupMatch) {
      const name = groupMatch[1];
      if (!groups.has(name)) groups.set(name, { name, variables: {}, hosts: [] });
      currentGroup = groups.get(name)!;
      inVarsSection = false;
      continue;
    }

    if (!currentGroup) continue;

    if (inVarsSection) {
      const [k, ...rest] = line.split("=");
      if (k) currentGroup.variables[k.trim()] = rest.join("=").trim();
    } else {
      // host line: "hostname key=val key=val ..."
      const parts = line.split(/\s+/);
      const host = parts[0];
      const variables: Record<string, string> = {};
      for (const part of parts.slice(1)) {
        const eqIdx = part.indexOf("=");
        if (eqIdx > -1) {
          const k = part.slice(0, eqIdx);
          const v = part.slice(eqIdx + 1);
          // Skip internal ansible connection vars we manage ourselves
          if (!["ansible_ssh_private_key_file"].includes(k)) {
            variables[k] = v;
          }
        }
      }
      currentGroup.hosts.push({ host, variables });
    }
  }

  return Array.from(groups.values());
}

// --- YAML parser ---
function parseYaml(content: string): ParsedGroup[] {
  const doc = yamlLoad(content) as Record<string, unknown> | null | undefined;
  const groups: ParsedGroup[] = [];

  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    const children = node.children ?? node;
    for (const [groupName, groupData] of Object.entries(children as Record<string, any>)) {
      if (groupName === "hosts" || groupName === "vars" || groupName === "_meta") continue;
      const group: ParsedGroup = { name: groupName, variables: {}, hosts: [] };
      if (groupData?.vars) {
        for (const [k, v] of Object.entries(groupData.vars as Record<string, unknown>)) {
          group.variables[k] = String(v);
        }
      }
      if (groupData?.hosts) {
        for (const [hostName, hostVars] of Object.entries(groupData.hosts as Record<string, any>)) {
          const variables: Record<string, string> = {};
          for (const [k, v] of Object.entries(hostVars ?? {})) {
            if (k !== "ansible_ssh_private_key_file") variables[k] = String(v);
          }
          group.hosts.push({ host: hostName, variables });
        }
      }
      groups.push(group);
      if (groupData?.children) walk(groupData);
    }
  }

  if (doc?.all) walk(doc.all);
  else walk(doc);

  return groups;
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();

  if (!file || !name) {
    return NextResponse.json({ error: "Missing file or name" }, { status: 400 });
  }

  const MAX_SIZE = 1 * 1024 * 1024; // 1 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 1 MB)" }, { status: 413 });
  }

  const content = await file.text();
  const format = file.name.endsWith(".yml") || file.name.endsWith(".yaml") ? "yaml" : "ini";

  let parsed: ParsedGroup[];
  try {
    parsed = format === "yaml" ? parseYaml(content) : parseIni(content);
  } catch {
    return NextResponse.json({ error: "Failed to parse file" }, { status: 400 });
  }

  // Match hosts against existing servers in the org by host field
  const orgServers = await db.query.servers.findMany({
    where: eq(servers.organizationId, ctx.org.id),
  });
  const serverByHost = new Map(orgServers.map(s => [s.host, s]));

  const unmatched: string[] = [];
  const resolvedGroups: Array<{
    name: string;
    variables: Record<string, string>;
    hosts: Array<{ serverId: string; variables: Record<string, string> }>;
  }> = [];

  for (const group of parsed) {
    const resolvedHosts: Array<{ serverId: string; variables: Record<string, string> }> = [];
    for (const h of group.hosts) {
      const server = serverByHost.get(h.host);
      if (server) {
        resolvedHosts.push({ serverId: server.id, variables: h.variables });
      } else {
        unmatched.push(h.host);
      }
    }
    resolvedGroups.push({ name: group.name, variables: group.variables, hosts: resolvedHosts });
  }

  // Create inventory + groups atomically
  const inventory = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(inventories)
      .values({ name, organizationId: ctx.org.id })
      .returning();

    for (const group of resolvedGroups) {
      const [g] = await tx
        .insert(inventoryGroups)
        .values({ inventoryId: inv.id, name: group.name, variables: group.variables })
        .returning();

      if (group.hosts.length > 0) {
        await tx.insert(inventoryHosts).values(
          group.hosts.map(h => ({ groupId: g.id, serverId: h.serverId, variables: h.variables }))
        );
      }
    }

    return inv;
  });

  await writeAuditLog({
    organizationId: ctx.org.id,
    userId: ctx.userId,
    action: "created",
    resourceType: "inventory",
    resourceId: inventory.id,
    resourceName: inventory.name,
    metadata: { importedFrom: file.name, format },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({
    inventory: { id: inventory.id, name: inventory.name },
    matched: resolvedGroups.reduce((n, g) => n + g.hosts.length, 0),
    unmatched: [...new Set(unmatched)],
  }, { status: 201 });
}
