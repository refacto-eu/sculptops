import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";

type HostRow = {
  server: { host: string; port: number; username: string; organizationId?: string };
  variables: Record<string, string>;
};
type GroupRow = {
  name: string;
  variables: Record<string, string>;
  hosts: HostRow[];
};

function buildIni(groups: GroupRow[]): string {
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`[${group.name}]`);
    for (const { server, variables } of group.hosts) {
      const vars: Record<string, string> = {
        ansible_port: String(server.port),
        ansible_user: server.username,
        ...variables,
      };
      const varStr = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(" ");
      lines.push(`${server.host} ${varStr}`);
    }
    lines.push("");
    if (Object.keys(group.variables).length > 0) {
      lines.push(`[${group.name}:vars]`);
      for (const [k, v] of Object.entries(group.variables)) lines.push(`${k}=${v}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildYaml(groups: GroupRow[]): string {
  const indent = (n: number) => "  ".repeat(n);
  const lines: string[] = ["all:", `${indent(1)}children:`];

  for (const group of groups) {
    lines.push(`${indent(2)}${group.name}:`);
    if (group.hosts.length > 0) {
      lines.push(`${indent(3)}hosts:`);
      for (const { server, variables } of group.hosts) {
        lines.push(`${indent(4)}${server.host}:`);
        lines.push(`${indent(5)}ansible_port: ${server.port}`);
        lines.push(`${indent(5)}ansible_user: ${server.username}`);
        for (const [k, v] of Object.entries(variables)) {
          lines.push(`${indent(5)}${k}: ${v}`);
        }
      }
    }
    if (Object.keys(group.variables).length > 0) {
      lines.push(`${indent(3)}vars:`);
      for (const [k, v] of Object.entries(group.variables)) {
        lines.push(`${indent(4)}${k}: ${v}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") === "yaml" ? "yaml" : "ini";

  const inventory = await db.query.inventories.findFirst({
    where: and(eq(inventories.id, id), eq(inventories.organizationId, ctx.org.id)),
    with: {
      groups: {
        with: { hosts: { with: { server: true } } },
      },
    },
  });

  if (!inventory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const groups = (inventory.groups as GroupRow[]).map(group => ({
    ...group,
    hosts: group.hosts.filter(host => host.server.organizationId === ctx.org.id),
  }));
  const content = format === "yaml" ? buildYaml(groups) : buildIni(groups);
  const filename = `${inventory.name.replace(/\s+/g, "_")}.${format === "yaml" ? "yml" : "ini"}`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
