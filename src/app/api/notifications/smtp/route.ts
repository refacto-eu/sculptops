import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { smtpSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { encrypt } from "@/lib/crypto";
import { assertSafeOutboundHost } from "@/lib/security";

const updateSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().optional(),
  password: z.string().optional(),
  fromAddress: z.string().email(),
  fromName: z.string().default("SculptOps"),
  recipients: z.array(z.string().email()).min(1),
  onFailure: z.boolean().default(true),
  onSuccess: z.boolean().default(false),
  enabled: z.boolean().default(false),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await db.query.smtpSettings.findFirst({
    where: eq(smtpSettings.organizationId, ctx.org.id),
    columns: {
      id: true, host: true, port: true, secure: true, username: true,
      fromAddress: true, fromName: true, recipients: true,
      onFailure: true, onSuccess: true, enabled: true, updatedAt: true,
      // encrypted fields excluded
      encryptedPassword: false, iv: false, authTag: false,
    },
  });

  return NextResponse.json(settings ?? null);
}

export async function PUT(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  try {
    await assertSafeOutboundHost(parsed.data.host, "SMTP host");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid SMTP host";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { password, ...rest } = parsed.data;

  let encryptedFields: { encryptedPassword?: string; iv?: string; authTag?: string } = {};
  if (password) {
    try {
      const { encryptedData, iv, authTag } = encrypt(password);
      encryptedFields = { encryptedPassword: encryptedData, iv, authTag };
    } catch {
      return NextResponse.json({ error: "Encryption failed: check server configuration" }, { status: 500 });
    }
  }

  const values = {
    organizationId: ctx.org.id,
    ...rest,
    ...encryptedFields,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(smtpSettings)
    .values(values)
    .onConflictDoUpdate({
      target: smtpSettings.organizationId,
      set: {
        host: values.host,
        port: values.port,
        secure: values.secure,
        username: values.username,
        fromAddress: values.fromAddress,
        fromName: values.fromName,
        recipients: values.recipients,
        onFailure: values.onFailure,
        onSuccess: values.onSuccess,
        enabled: values.enabled,
        updatedAt: values.updatedAt,
        ...(encryptedFields.encryptedPassword ? {
          encryptedPassword: encryptedFields.encryptedPassword,
          iv: encryptedFields.iv,
          authTag: encryptedFields.authTag,
        } : {}),
      },
    })
    .returning({ id: smtpSettings.id });

  return NextResponse.json({ success: true, id: row.id });
}

const patchSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().email()).min(1),
  onFailure: z.boolean(),
  onSuccess: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const existing = await db.query.smtpSettings.findFirst({
    where: eq(smtpSettings.organizationId, ctx.org.id),
  });
  if (!existing) return NextResponse.json({ error: "SMTP is not configured yet" }, { status: 400 });

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  await db.update(smtpSettings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(smtpSettings.organizationId, ctx.org.id));

  return NextResponse.json({ success: true });
}
