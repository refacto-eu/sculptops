import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { notificationSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { assertSafeHttpUrl } from "@/lib/security";

const updateSchema = z.object({
  channelType: z.enum(["generic", "slack", "discord"]),
  webhookUrl: z.string().url().nullable().optional(),
  onFailure: z.boolean().optional(),
  onSuccess: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.notificationSettings.findMany({
    where: eq(notificationSettings.organizationId, ctx.org.id),
  });

  return NextResponse.json(
    ctx.role === "admin"
      ? rows
      : rows.map(row => ({ ...row, webhookUrl: null }))
  );
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

  if (parsed.data.webhookUrl) {
    try {
      await assertSafeHttpUrl(parsed.data.webhookUrl, "Webhook URL");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid webhook URL";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const values = {
    organizationId: ctx.org.id,
    channelType: parsed.data.channelType,
    webhookUrl: parsed.data.webhookUrl ?? null,
    onFailure: parsed.data.onFailure ?? true,
    onSuccess: parsed.data.onSuccess ?? false,
    enabled: parsed.data.enabled ?? false,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(notificationSettings)
    .values(values)
    .onConflictDoUpdate({
      target: [notificationSettings.organizationId, notificationSettings.channelType],
      set: {
        webhookUrl: values.webhookUrl,
        onFailure: values.onFailure,
        onSuccess: values.onSuccess,
        enabled: values.enabled,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return NextResponse.json(row);
}
