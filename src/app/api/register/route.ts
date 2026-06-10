import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, organizations, organizationMembers, inviteTokens } from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { slugify } from "@/lib/utils";
import { getClientIp } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/api-token";

const registerSchema = z.union([
  z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8),
    orgName: z.string().min(2).max(100),
    inviteToken: z.undefined(),
  }),
  z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8),
    inviteToken: z.string().min(1),
    orgName: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  // 10 registration attempts per IP per hour
  const ip = getClientIp(req) || "unknown";
  if (!checkRateLimit(`register:ip:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { name, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ name, email, password: passwordHash }).returning();

  if (parsed.data.inviteToken) {
    // Atomic: claim the invite in a single UPDATE conditioned on usedAt IS NULL
    // This prevents race conditions where two concurrent registrations use the same invite
    const [claimed] = await db
      .update(inviteTokens)
      .set({ usedAt: new Date(), usedByUserId: user.id })
      .where(and(
        eq(inviteTokens.tokenHash, hashToken(parsed.data.inviteToken)),
        isNull(inviteTokens.usedAt),
        gt(inviteTokens.expiresAt, new Date()),
      ))
      .returning();

    if (!claimed) {
      await db.delete(users).where(eq(users.id, user.id));
      return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 400 });
    }

    await db.insert(organizationMembers).values({
      organizationId: claimed.organizationId,
      userId: user.id,
      role: claimed.role,
    });
  } else {
    const orgName = parsed.data.orgName!;
    const slug = slugify(orgName) + "-" + Math.random().toString(36).slice(2, 7);
    const [org] = await db.insert(organizations).values({ name: orgName, slug }).returning();
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "admin" });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
