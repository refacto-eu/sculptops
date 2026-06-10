import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { workflowExecutions, workflowStepExecutions } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { validateWorkflowId } from "@/lib/security";

const createSchema = z.object({ workflowId: z.string().uuid() });

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.workflowExecutions.findMany({
    where: eq(workflowExecutions.organizationId, ctx.org.id),
    orderBy: [desc(workflowExecutions.createdAt)],
    limit: 50,
    with: {
      workflow: { columns: { id: true, name: true } },
      stepExecutions: {
        orderBy: [asc(workflowStepExecutions.position)],
        with: { execution: { columns: { id: true, status: true } } },
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

  const workflowError = await validateWorkflowId(ctx.org.id, parsed.data.workflowId);
  if (workflowError) return NextResponse.json({ error: workflowError }, { status: 404 });

  const [wfExec] = await db.insert(workflowExecutions).values({
    organizationId: ctx.org.id,
    workflowId: parsed.data.workflowId,
    status: "pending",
    createdBy: ctx.userId,
  }).returning();

  // Fire and forget
  import("@/lib/run-workflow").then(m => m.runWorkflow(wfExec.id)).catch(console.error);

  const full = await db.query.workflowExecutions.findFirst({
    where: eq(workflowExecutions.id, wfExec.id),
    with: {
      workflow: { columns: { id: true, name: true } },
      stepExecutions: {
        orderBy: [asc(workflowStepExecutions.position)],
        with: { execution: { columns: { id: true, status: true } } },
      },
    },
  });

  return NextResponse.json(full, { status: 201 });
}
