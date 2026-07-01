import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { servers, sshKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const updateServerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  sshKeyId: z.string().uuid().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const server = await db.query.servers.findFirst({
    where: and(eq(servers.id, id), eq(servers.organizationId, ctx.org.id)),
    with: { sshKey: { columns: { id: true, name: true, fingerprint: true, publicKey: true } } },
  });

  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(server);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = updateServerSchema.safeParse(body);
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

  const [updated] = await db
    .update(servers)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(servers.id, id), eq(servers.organizationId, ctx.org.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "server", resourceId: updated.id, resourceName: updated.name, metadata: { host: updated.host, port: updated.port }, ipAddress: getClientIp(req) });

  const enriched = await db.query.servers.findFirst({
    where: eq(servers.id, updated.id),
    with: { sshKey: { columns: { id: true, name: true } } },
  });

  return NextResponse.json(enriched ?? updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [deleted] = await db
    .delete(servers)
    .where(and(eq(servers.id, id), eq(servers.organizationId, ctx.org.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "server", resourceId: deleted.id, resourceName: deleted.name, metadata: { host: deleted.host, port: deleted.port, username: deleted.username }, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
