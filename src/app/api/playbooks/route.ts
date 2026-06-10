import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { playbooks } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { safePlaybook, safePlaybooks } from "@/lib/playbook-response";

const createPlaybookSchema = z.object({
  name:                z.string().min(1).max(1024),
  description:         z.string().optional(),
  content:             z.string().default("---\n- hosts: all\n  tasks: []\n"),
  tags:                z.array(z.string().max(256)).max(30).default([]),
  communitySourceId:   z.string().uuid().optional(),
  communitySourceName: z.string().max(255).optional(),
  communityAuthorName: z.string().max(255).optional(),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.playbooks.findMany({
    where: eq(playbooks.organizationId, ctx.org.id),
    orderBy: [desc(playbooks.updatedAt)],
    with: { creator: { columns: { name: true, email: true } } },
  });

  return NextResponse.json(safePlaybooks(rows));
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createPlaybookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const [playbook] = await db
    .insert(playbooks)
    .values({ ...parsed.data, organizationId: ctx.org.id, createdBy: ctx.userId })
    .returning();

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "playbook", resourceId: playbook.id, resourceName: playbook.name, metadata: { tags: playbook.tags }, ipAddress: getClientIp(req) });
  return NextResponse.json(safePlaybook(playbook), { status: 201 });
}
