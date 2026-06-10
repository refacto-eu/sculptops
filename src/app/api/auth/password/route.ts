import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "At least 8 characters"),
});

// Rate limit: 5 attempts per user per 15 minutes
const pwRateLimit = new Map<string, { count: number; resetAt: number }>();

export async function PUT(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const entry = pwRateLimit.get(ctx.userId);
  if (entry && now < entry.resetAt) {
    if (entry.count >= 5) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }
    entry.count++;
  } else {
    pwRateLimit.set(ctx.userId, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const user = await db.query.users.findFirst({
    where: eq(users.id, ctx.userId),
    columns: { id: true, password: true },
  });

  if (!user?.password) {
    return NextResponse.json({ error: "Password change not available for this account" }, { status: 400 });
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(users).set({ password: hash, updatedAt: new Date() }).where(eq(users.id, ctx.userId));

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "updated", resourceType: "account", resourceId: ctx.userId, metadata: { field: "password" }, ipAddress: getClientIp(req) });
  return NextResponse.json({ success: true });
}
