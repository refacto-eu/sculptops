import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { inventories } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";import { writeAuditLog, getClientIp } from "@/lib/audit";

const createInventorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.inventories.findMany({
    where: eq(inventories.organizationId, ctx.org.id),
    orderBy: [desc(inventories.createdAt)],
    with: {
      groups: {
        with: { hosts: { with: { server: true } } },
      },
    },
  });

  return NextResponse.json(rows.map(inventory => ({
    ...inventory,
    groups: inventory.groups.map(group => ({
      ...group,
      hosts: group.hosts.filter(host => host.server.organizationId === ctx.org.id),
    })),
  })));
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createInventorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const [inventory] = await db
    .insert(inventories)
    .values({ ...parsed.data, organizationId: ctx.org.id })
    .returning();

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "inventory", resourceId: inventory.id, resourceName: inventory.name, ipAddress: getClientIp(req) });
  return NextResponse.json(inventory, { status: 201 });
}
