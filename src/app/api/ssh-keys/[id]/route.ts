import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { sshKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { encrypt } from "@/lib/crypto";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const updateKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  privateKey: z.string().min(1).optional(),
  publicKey: z.string().optional().nullable(),
});

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
  const parsed = updateKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { name, privateKey, publicKey } = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (name) updates.name = name;
  if (publicKey !== undefined) updates.publicKey = publicKey;
  if (privateKey) {
    const { encryptedData, iv, authTag } = encrypt(privateKey);
    updates.encryptedPrivateKey = encryptedData;
    updates.iv = iv;
    updates.authTag = authTag;
  }

  const [updated] = await db
    .update(sshKeys)
    .set(updates)
    .where(and(eq(sshKeys.id, id), eq(sshKeys.organizationId, ctx.org.id)))
    .returning({
      id: sshKeys.id,
      name: sshKeys.name,
      fingerprint: sshKeys.fingerprint,
      publicKey: sshKeys.publicKey,
      updatedAt: sshKeys.updatedAt,
    });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "ssh_key", resourceId: updated.id, resourceName: updated.name, ipAddress: getClientIp(req) });
  return NextResponse.json(updated);
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
    .delete(sshKeys)
    .where(and(eq(sshKeys.id, id), eq(sshKeys.organizationId, ctx.org.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "ssh_key", resourceId: deleted.id, resourceName: deleted.name, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
