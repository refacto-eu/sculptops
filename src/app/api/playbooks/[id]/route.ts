import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { playbooks, playbookVersions } from "@/lib/db/schema";
import { eq, and, max } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { encryptToString } from "@/lib/crypto";
import { assertSafeGitUrl } from "@/lib/security";
import { safePlaybook } from "@/lib/playbook-response";

const updatePlaybookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  gitRepo: z.string().url().nullable().optional(),
  gitBranch: z.string().max(100).nullable().optional(),
  gitPath: z.string().max(500).nullable().optional(),
  gitToken: z.string().optional(), // raw token — will be encrypted before storing
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playbook = await db.query.playbooks.findFirst({
    where: and(eq(playbooks.id, id), eq(playbooks.organizationId, ctx.org.id)),
  });

  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(safePlaybook(playbook));
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
  const parsed = updatePlaybookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  if (parsed.data.gitRepo) {
    try {
      await assertSafeGitUrl(parsed.data.gitRepo);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid Git repository URL";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const { gitToken: rawToken, ...rest } = parsed.data;
  const gitTokenUpdate = rawToken !== undefined
    ? { gitToken: rawToken ? encryptToString(rawToken) : null }
    : {};

  const [updated] = await db
    .update(playbooks)
    .set({ ...rest, ...gitTokenUpdate, updatedAt: new Date() })
    .where(and(eq(playbooks.id, id), eq(playbooks.organizationId, ctx.org.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.content) {
    const [{ value }] = await db
      .select({ value: max(playbookVersions.version) })
      .from(playbookVersions)
      .where(eq(playbookVersions.playbookId, id));

    await db.insert(playbookVersions).values({
      playbookId: id,
      version: (value ?? 0) + 1,
      content: parsed.data.content,
      changedBy: ctx.userId,
    });
  }

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "playbook", resourceId: updated.id, resourceName: updated.name, ipAddress: getClientIp(req) });
  return NextResponse.json(safePlaybook(updated));
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
    .delete(playbooks)
    .where(and(eq(playbooks.id, id), eq(playbooks.organizationId, ctx.org.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "deleted", resourceType: "playbook", resourceId: deleted.id, resourceName: deleted.name, metadata: { tags: deleted.tags }, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
