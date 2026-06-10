import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiTokens, organizationMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const patchSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

type MemberRole = z.infer<typeof patchSchema>["role"];

async function capMemberTokenRoles(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  userId: string,
  role: MemberRole
) {
  if (role === "admin") return;

  const elevatedRoles: MemberRole[] = role === "viewer" ? ["admin", "member"] : ["admin"];
  for (const tokenRole of elevatedRoles) {
    await tx
      .update(apiTokens)
      .set({ role })
      .where(and(
        eq(apiTokens.organizationId, organizationId),
        eq(apiTokens.createdBy, userId),
        eq(apiTokens.role, tokenRole),
      ));
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  if (userId === ctx.userId) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const updated = await db.transaction(async (tx) => {
    const [member] = await tx
      .update(organizationMembers)
      .set({ role: parsed.data.role })
      .where(and(
        eq(organizationMembers.organizationId, ctx.org.id),
        eq(organizationMembers.userId, userId),
      ))
      .returning();

    if (member) {
      await capMemberTokenRoles(tx, ctx.org.id, userId, parsed.data.role);
    }

    return member;
  });

  if (!updated) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "member", resourceId: userId, metadata: { role: parsed.data.role }, ipAddress: getClientIp(req) });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  if (userId === ctx.userId) {
    return NextResponse.json({ error: "Cannot remove yourself from the organization" }, { status: 400 });
  }

  const deleted = await db.transaction(async (tx) => {
    const [member] = await tx
      .delete(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, ctx.org.id),
        eq(organizationMembers.userId, userId),
      ))
      .returning();

    if (member) {
      await tx
        .delete(apiTokens)
        .where(and(
          eq(apiTokens.organizationId, ctx.org.id),
          eq(apiTokens.createdBy, userId),
        ));
    }

    return member;
  });

  if (!deleted) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "member", resourceId: userId, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
