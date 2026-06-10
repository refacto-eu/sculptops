import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { webhookTokens, playbooks, inventories } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { generateWebhookToken, hashToken } from "@/lib/api-token";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(255),
  playbookId: z.string().uuid(),
  inventoryId: z.string().uuid(),
  gitBranch: z.string().max(255).optional(),
  options: z.object({
    dryRun: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    limitHosts: z.string().optional(),
    extraVars: z.record(z.string()).default({}),
  }).default({}),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.webhookTokens.findMany({
    where: eq(webhookTokens.organizationId, ctx.org.id),
    orderBy: [desc(webhookTokens.createdAt)],
    columns: { tokenHash: false },
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

  const [ownedPlaybook, ownedInventory] = await Promise.all([
    db.query.playbooks.findFirst({ where: and(eq(playbooks.id, parsed.data.playbookId), eq(playbooks.organizationId, ctx.org.id)), columns: { id: true } }),
    db.query.inventories.findFirst({ where: and(eq(inventories.id, parsed.data.inventoryId), eq(inventories.organizationId, ctx.org.id)), columns: { id: true } }),
  ]);
  if (!ownedPlaybook || !ownedInventory) return NextResponse.json({ error: "Playbook or inventory not found" }, { status: 404 });

  const token = generateWebhookToken();

  const [row] = await db.insert(webhookTokens).values({
    ...parsed.data,
    organizationId: ctx.org.id,
    createdBy: ctx.userId,
    tokenHash: hashToken(token),
  }).returning();

  const full = await db.query.webhookTokens.findFirst({
    where: eq(webhookTokens.id, row.id),
    columns: { tokenHash: false },
    with: {
      playbook: { columns: { id: true, name: true } },
      inventory: { columns: { id: true, name: true } },
    },
  });

  if (!full) return NextResponse.json({ error: "Webhook was created but could not be loaded" }, { status: 500 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "webhook", resourceId: row.id, resourceName: row.name, ipAddress: getClientIp(req) });
  return NextResponse.json({ ...full, token }, { status: 201 });
}
