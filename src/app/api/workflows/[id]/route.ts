import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { workflows, workflowSteps } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { validateWorkflowStepRefs } from "@/lib/security";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const stepSchema = z.object({
  position: z.number().int().min(0),
  name: z.string().max(255).optional(),
  playbookId: z.string().uuid().nullable(),
  inventoryId: z.string().uuid().nullable(),
  options: z.object({
    dryRun: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    limitHosts: z.string().optional(),
    extraVars: z.record(z.string()).default({}),
    vaultPasswordId: z.string().uuid().optional(),
    propagateVars: z.boolean().default(false),
  }).default({}),
  onFailure: z.enum(["stop", "continue"]).default("stop"),
});

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  extraVars: z.record(z.string()).default({}).optional(),
  steps: z.array(stepSchema).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflow = await db.query.workflows.findFirst({
    where: and(eq(workflows.id, id), eq(workflows.organizationId, ctx.org.id)),
    with: {
      steps: {
        orderBy: [asc(workflowSteps.position)],
        with: {
          playbook: { columns: { id: true, name: true } },
          inventory: { columns: { id: true, name: true } },
        },
      },
    },
  });

  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(workflow);
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { steps, ...rest } = parsed.data;
  if (steps !== undefined) {
    const refsError = await validateWorkflowStepRefs(ctx.org.id, steps);
    if (refsError) return NextResponse.json({ error: refsError }, { status: 404 });
  }

  const [updated] = await db.update(workflows)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, ctx.org.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (steps !== undefined) {
    await db.transaction(async (tx) => {
      await tx.delete(workflowSteps).where(eq(workflowSteps.workflowId, id));
      if (steps.length > 0) {
        await tx.insert(workflowSteps).values(steps.map(s => ({ ...s, workflowId: id })));
      }
    });
  }

  const full = await db.query.workflows.findFirst({
    where: eq(workflows.id, id),
    with: {
      steps: {
        orderBy: [asc(workflowSteps.position)],
        with: {
          playbook: { columns: { id: true, name: true } },
          inventory: { columns: { id: true, name: true } },
        },
      },
    },
  });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "workflow", resourceId: id, resourceName: updated.name, ipAddress: getClientIp(req) });
  return NextResponse.json(full);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [deleted] = await db.delete(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.organizationId, ctx.org.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "workflow", resourceId: id, resourceName: deleted.name, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
