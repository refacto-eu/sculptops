import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { CronExpressionParser } from "cron-parser";
import { validateExecutionRefs } from "@/lib/security";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  playbookId: z.string().uuid().optional(),
  inventoryId: z.string().uuid().optional(),
  cronExpression: z.string().optional(),
  options: z.object({
    dryRun: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    limitHosts: z.string().optional(),
    extraVars: z.record(z.string()).default({}),
    vaultPasswordId: z.string().uuid().optional(),
  }).optional(),
  enabled: z.boolean().optional(),
});

function nextRun(expr: string): Date | null {
  try { return CronExpressionParser.parse(expr).next().toDate(); } catch { return null; }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  if (parsed.data.cronExpression) {
    try { CronExpressionParser.parse(parsed.data.cronExpression); }
    catch { return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 }); }
  }

  const refsError = await validateExecutionRefs(ctx.org.id, {
    playbookId: parsed.data.playbookId,
    inventoryId: parsed.data.inventoryId,
    vaultPasswordId: parsed.data.options?.vaultPasswordId,
  });
  if (refsError) return NextResponse.json({ error: refsError }, { status: 404 });

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.cronExpression) updates.nextRunAt = nextRun(parsed.data.cronExpression);

  const [updated] = await db
    .update(schedules)
    .set(updates)
    .where(and(eq(schedules.id, id), eq(schedules.organizationId, ctx.org.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "schedule", resourceId: updated.id, resourceName: updated.name, ipAddress: getClientIp(req) });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [deleted] = await db
    .delete(schedules)
    .where(and(eq(schedules.id, id), eq(schedules.organizationId, ctx.org.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "schedule", resourceId: id, resourceName: deleted.name, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
