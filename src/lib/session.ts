import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, organizations, organizationMembers, auditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Stable UUIDs for the dev user/org — used only when SKIP_AUTH=true
const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEV_ORG_ID = "00000000-0000-0000-0000-000000000002";

let devSeeded = false;

async function seedDevUser() {
  if (devSeeded) return;
  devSeeded = true;

  const existing = await db.query.users.findFirst({
    where: eq(users.id, DEV_USER_ID),
  });

  if (!existing) {
    const hash = await bcrypt.hash("password", 10);
    await db.insert(users).values({
      id: DEV_USER_ID,
      email: "dev@localhost",
      name: "Dev User",
      password: hash,
    });
    await db.insert(organizations).values({
      id: DEV_ORG_ID,
      name: "My Organization",
      slug: "my-org",
    });
    await db.insert(organizationMembers).values({
      organizationId: DEV_ORG_ID,
      userId: DEV_USER_ID,
      role: "admin",
    });
    await db.insert(auditLogs).values({
      organizationId: DEV_ORG_ID,
      userId: DEV_USER_ID,
      action: "created",
      resourceType: "server",
      resourceName: "test-server-01",
      metadata: { note: "TEST — ceci est une entrée de démonstration" },
    });
  }
}

export interface AuthContext {
  userId: string;
  org: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date };
  role: string;
}

/**
 * Returns { userId, org, role } for the current request.
 * When SKIP_AUTH=true, auto-seeds and returns the dev user — no login required.
 * Returns null if unauthenticated (when SKIP_AUTH=false).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  if (process.env.NODE_ENV === "production" && process.env.SKIP_AUTH === "true") {
    throw new Error("SKIP_AUTH=true is not allowed in production");
  }
  if (process.env.SKIP_AUTH === "true") {
    await seedDevUser();
    const membership = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, DEV_USER_ID),
      with: { organization: true },
    });
    if (!membership) return null;
    return { userId: DEV_USER_ID, org: membership.organization, role: membership.role };
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, session.user.id),
    with: { organization: true },
  });
  if (!membership) return null;

  return { userId: session.user.id, org: membership.organization, role: membership.role };
}
