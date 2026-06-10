import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { spawn } from "child_process";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const { id } = await params;

  const execution = await db.query.executions.findFirst({
    where: and(eq(executions.id, id), eq(executions.organizationId, ctx.org.id)),
    columns: { id: true, status: true },
  });

  if (!execution) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (execution.status !== "running" && execution.status !== "pending") {
    return NextResponse.json({ error: "Execution is not running" }, { status: 400 });
  }

  // Mark as cancelled first so run-execution.ts won't overwrite the status
  await db
    .update(executions)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(executions.id, id), eq(executions.organizationId, ctx.org.id)));

  // Kill the Docker container (predictable name set in ansible.ts)
  const containerName = `ansible-exec-${id}`;
  await new Promise<void>((resolve) => {
    const child = spawn("docker", ["kill", containerName]);
    child.on("close", () => resolve());
  });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "cancelled", resourceType: "execution", resourceId: id, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
