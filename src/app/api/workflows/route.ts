import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { workflows, workflowSteps } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
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

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  extraVars: z.record(z.string()).default({}),
  steps: z.array(stepSchema).default([]),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.workflows.findMany({
    where: eq(workflows.organizationId, ctx.org.id),
    orderBy: [desc(workflows.updatedAt)],
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

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const refsError = await validateWorkflowStepRefs(ctx.org.id, parsed.data.steps);
  if (refsError) return NextResponse.json({ error: refsError }, { status: 404 });

  const [workflow] = await db.insert(workflows).values({
    name: parsed.data.name,
    description: parsed.data.description,
    extraVars: parsed.data.extraVars,
    organizationId: ctx.org.id,
    createdBy: ctx.userId,
  }).returning();

  if (parsed.data.steps.length > 0) {
    await db.insert(workflowSteps).values(
      parsed.data.steps.map(s => ({ ...s, workflowId: workflow.id }))
    );
  }

  const full = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflow.id),
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

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "workflow", resourceId: workflow.id, resourceName: workflow.name, metadata: { steps: parsed.data.steps.length }, ipAddress: getClientIp(req) });
  return NextResponse.json(full, { status: 201 });
}
