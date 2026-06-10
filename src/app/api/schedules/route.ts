import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { CronExpressionParser } from "cron-parser";
import { validateExecutionRefs } from "@/lib/security";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(255),
  playbookId: z.string().uuid(),
  inventoryId: z.string().uuid(),
  cronExpression: z.string().min(1),
  options: z.object({
    dryRun: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    limitHosts: z.string().optional(),
    extraVars: z.record(z.string()).default({}),
    vaultPasswordId: z.string().uuid().optional(),
  }).default({}),
  enabled: z.boolean().default(true),
});

function nextRun(expr: string): Date | null {
  try { return CronExpressionParser.parse(expr).next().toDate(); } catch { return null; }
}

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.schedules.findMany({
    where: eq(schedules.organizationId, ctx.org.id),
    orderBy: [desc(schedules.createdAt)],
    with: {
      playbook: { columns: { id: true, name: true } },
      inventory: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  try { CronExpressionParser.parse(parsed.data.cronExpression); }
  catch { return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 }); }

  const refsError = await validateExecutionRefs(ctx.org.id, {
    playbookId: parsed.data.playbookId,
    inventoryId: parsed.data.inventoryId,
    vaultPasswordId: parsed.data.options.vaultPasswordId,
  });
  if (refsError) return NextResponse.json({ error: refsError }, { status: 404 });

  const [row] = await db.insert(schedules).values({
    ...parsed.data,
    organizationId: ctx.org.id,
    createdBy: ctx.userId,
    nextRunAt: nextRun(parsed.data.cronExpression),
  }).returning();

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "schedule", resourceId: row.id, resourceName: row.name, ipAddress: getClientIp(req) });
  return NextResponse.json(row, { status: 201 });
}
