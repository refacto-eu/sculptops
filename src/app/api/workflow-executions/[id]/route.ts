import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workflowExecutions, workflowStepExecutions } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wfExec = await db.query.workflowExecutions.findFirst({
    where: and(eq(workflowExecutions.id, id), eq(workflowExecutions.organizationId, ctx.org.id)),
    with: {
      workflow: { columns: { id: true, name: true } },
      stepExecutions: {
        orderBy: [asc(workflowStepExecutions.position)],
        with: {
          execution: {
            columns: { id: true, status: true, startedAt: true, finishedAt: true },
            with: { playbook: { columns: { id: true, name: true } }, inventory: { columns: { id: true, name: true } } },
          },
        },
      },
    },
  });

  if (!wfExec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(wfExec);
}
