import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { executions } from "@/lib/db/schema";
import { eq, desc, and, ne, count } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { validateExecutionRefs } from "@/lib/security";

const createExecutionSchema = z.object({
  playbookId: z.string().uuid(),
  inventoryId: z.string().uuid(),
  options: z
    .object({
      dryRun: z.boolean().default(false),
      tags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/, "Tag contains invalid characters")).max(50).default([]),
      limitHosts: z.string().max(255).regex(/^[a-zA-Z0-9_.,:&!*\[\]-]*$/, "limitHosts contains invalid characters").optional(),
      extraVars: z.record(z.string().max(10000)).default({}),
      vaultPasswordId: z.string().uuid().optional(),
    })
    .default({}),
});

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, [{ total }]] = await Promise.all([
    db.query.executions.findMany({
      where: eq(executions.organizationId, ctx.org.id),
      orderBy: [desc(executions.createdAt)],
      with: {
        playbook: { columns: { id: true, name: true } },
        inventory: { columns: { id: true, name: true } },
      },
      limit: PAGE_SIZE,
      offset,
    }),
    db.select({ total: count() }).from(executions).where(eq(executions.organizationId, ctx.org.id)),
  ]);

  return NextResponse.json({ items: rows, total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createExecutionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const refsError = await validateExecutionRefs(ctx.org.id, {
    playbookId: parsed.data.playbookId,
    inventoryId: parsed.data.inventoryId,
    vaultPasswordId: parsed.data.options.vaultPasswordId,
  });
  if (refsError) return NextResponse.json({ error: refsError }, { status: 404 });

  const [execution] = await db
    .insert(executions)
    .values({
      organizationId: ctx.org.id,
      playbookId: parsed.data.playbookId,
      inventoryId: parsed.data.inventoryId,
      options: parsed.data.options,
      status: "pending",
      createdBy: ctx.userId,
    })
    .returning();

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "executed", resourceType: "execution", resourceId: execution.id, metadata: { playbookId: parsed.data.playbookId, inventoryId: parsed.data.inventoryId, dryRun: parsed.data.options.dryRun }, ipAddress: getClientIp(req) });

  // Start execution in background (fire and forget)
  import("@/lib/run-execution").then(m => m.runExecution(execution.id)).catch(console.error);

  const full = await db.query.executions.findFirst({
    where: eq(executions.id, execution.id),
    with: {
      playbook: { columns: { id: true, name: true } },
      inventory: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json(full, { status: 201 });
}

export async function DELETE() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  await db.delete(executions).where(
    and(eq(executions.organizationId, ctx.org.id), ne(executions.status, "running"))
  );

  return NextResponse.json({ success: true });
}
