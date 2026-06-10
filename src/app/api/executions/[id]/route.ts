import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const execution = await db.query.executions.findFirst({
    where: and(eq(executions.id, id), eq(executions.organizationId, ctx.org.id)),
    with: {
      playbook: { columns: { id: true, name: true } },
      inventory: { columns: { id: true, name: true } },
    },
  });

  if (!execution) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(execution);
}
