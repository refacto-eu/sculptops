import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizationMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      createdAt: organizationMembers.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, ctx.org.id));

  // Non-admins see the team but not individual emails
  const isAdmin = ctx.role === "admin";
  const members = rows.map(m => ({
    ...m,
    email: isAdmin || m.userId === ctx.userId ? m.email : null,
  }));

  return NextResponse.json(members);
}
