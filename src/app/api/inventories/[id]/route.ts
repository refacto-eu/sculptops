import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { inventories, inventoryGroups, inventoryHosts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { validateServerIds } from "@/lib/security";

const updateInventorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  groups: z
    .array(
      z.object({
        name: z.string().min(1),
        variables: z.record(z.string()).default({}),
        hosts: z.array(
          z.object({
            serverId: z.string().uuid(),
            variables: z.record(z.string()).default({}),
          })
        ),
      })
    )
    .optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inventory = await db.query.inventories.findFirst({
    where: and(eq(inventories.id, id), eq(inventories.organizationId, ctx.org.id)),
    with: {
      groups: {
        with: { hosts: { with: { server: true } } },
      },
    },
  });

  if (!inventory) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...inventory,
    groups: inventory.groups.map(group => ({
      ...group,
      hosts: group.hosts.filter(host => host.server.organizationId === ctx.org.id),
    })),
  });
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
  const parsed = updateInventorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { groups, ...rest } = parsed.data;
  if (groups !== undefined) {
    const serverError = await validateServerIds(
      ctx.org.id,
      groups.flatMap(group => group.hosts.map(host => host.serverId))
    );
    if (serverError) return NextResponse.json({ error: serverError }, { status: 404 });
  }

  const [updated] = await db
    .update(inventories)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(inventories.id, id), eq(inventories.organizationId, ctx.org.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (groups !== undefined) {
    await db.transaction(async (tx) => {
      await tx.delete(inventoryGroups).where(eq(inventoryGroups.inventoryId, id));

      for (const group of groups) {
        const [g] = await tx
          .insert(inventoryGroups)
          .values({ inventoryId: id, name: group.name, variables: group.variables })
          .returning();

        if (group.hosts.length > 0) {
          await tx.insert(inventoryHosts).values(
            group.hosts.map((h) => ({
              groupId: g.id,
              serverId: h.serverId,
              variables: h.variables,
            }))
          );
        }
      }
    });
  }

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "inventory", resourceId: updated.id, resourceName: updated.name, ipAddress: getClientIp(req) });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [deleted] = await db
    .delete(inventories)
    .where(and(eq(inventories.id, id), eq(inventories.organizationId, ctx.org.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "inventory", resourceId: deleted.id, resourceName: deleted.name, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
