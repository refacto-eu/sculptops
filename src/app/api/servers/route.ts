import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { servers, sshKeys } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const createServerSchema = z.object({
  name: z.string().min(1).max(255),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(100).default("root"),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  sshKeyId: z.string().uuid().optional().nullable(),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.servers.findMany({
    where: eq(servers.organizationId, ctx.org.id),
    orderBy: [desc(servers.createdAt)],
    with: { sshKey: { columns: { id: true, name: true } } },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createServerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  if (parsed.data.sshKeyId) {
    const key = await db.query.sshKeys.findFirst({
      where: and(eq(sshKeys.id, parsed.data.sshKeyId), eq(sshKeys.organizationId, ctx.org.id)),
      columns: { id: true },
    });
    if (!key) return NextResponse.json({ error: "SSH key not found" }, { status: 404 });
  }

  const [server] = await db
    .insert(servers)
    .values({ ...parsed.data, organizationId: ctx.org.id })
    .returning();

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "server", resourceId: server.id, resourceName: server.name, metadata: { host: server.host, port: server.port, username: server.username }, ipAddress: getClientIp(req) });

  const created = await db.query.servers.findFirst({
    where: eq(servers.id, server.id),
    with: { sshKey: { columns: { id: true, name: true } } },
  });

  return NextResponse.json(created ?? server, { status: 201 });
}
