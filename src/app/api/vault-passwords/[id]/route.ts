import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { vaultPasswords } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { encrypt } from "@/lib/crypto";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  password: z.string().min(1).optional(), // if omitted, keep current
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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const passwordUpdate = parsed.data.password
    ? (() => { const { encryptedData, iv, authTag } = encrypt(parsed.data.password!); return { encryptedPassword: encryptedData, iv, authTag }; })()
    : {};

  const [updated] = await db
    .update(vaultPasswords)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...passwordUpdate,
      updatedAt: new Date(),
    })
    .where(and(eq(vaultPasswords.id, id), eq(vaultPasswords.organizationId, ctx.org.id)))
    .returning({
      id: vaultPasswords.id,
      name: vaultPasswords.name,
      description: vaultPasswords.description,
      provider: vaultPasswords.provider,
      createdAt: vaultPasswords.createdAt,
      updatedAt: vaultPasswords.updatedAt,
    });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({
    organizationId: ctx.org.id,
    userId: ctx.userId,
    action: "updated",
    resourceType: "vault_password",
    resourceId: updated.id,
    resourceName: updated.name,
    ipAddress: getClientIp(req),
  });

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
    .delete(vaultPasswords)
    .where(and(eq(vaultPasswords.id, id), eq(vaultPasswords.organizationId, ctx.org.id)))
    .returning({ id: vaultPasswords.id, name: vaultPasswords.name });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({
    organizationId: ctx.org.id,
    userId: ctx.userId,
    action: "deleted",
    resourceType: "vault_password",
    resourceId: deleted.id,
    resourceName: deleted.name,
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}
