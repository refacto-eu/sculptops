import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { playbooks, playbookVersions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playbook = await db.query.playbooks.findFirst({
    where: and(eq(playbooks.id, id), eq(playbooks.organizationId, ctx.org.id)),
    columns: { id: true },
  });

  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await db.query.playbookVersions.findMany({
    where: eq(playbookVersions.playbookId, id),
    orderBy: [desc(playbookVersions.version)],
    limit: 50,
    with: { changedByUser: { columns: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(versions);
}
