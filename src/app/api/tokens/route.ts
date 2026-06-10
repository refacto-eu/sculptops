import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg } from "@/lib/get-org";
import { generateToken, hashToken } from "@/lib/api-token";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2 };

const createSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  expiresAt: z.string().datetime().optional(), // ISO-8601 or omit for never
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.apiTokens.findMany({
    where: and(
      eq(apiTokens.organizationId, ctx.org.id),
      eq(apiTokens.createdBy, ctx.userId),
    ),
    columns: {
      id: true, name: true, role: true,
      lastUsedAt: true, expiresAt: true, createdAt: true,
      tokenHash: false, // never returned
    },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  // A token can never exceed the creator's own role
  if (ROLE_RANK[parsed.data.role] > ROLE_RANK[ctx.role]) {
    return NextResponse.json({ error: "Cannot create a token with higher privileges than your own role" }, { status: 403 });
  }

  const rawToken = generateToken();
  const hash = hashToken(rawToken);

  const [row] = await db.insert(apiTokens).values({
    organizationId: ctx.org.id,
    createdBy: ctx.userId,
    name: parsed.data.name,
    tokenHash: hash,
    role: parsed.data.role,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  }).returning({
    id: apiTokens.id, name: apiTokens.name, role: apiTokens.role,
    expiresAt: apiTokens.expiresAt, createdAt: apiTokens.createdAt,
  });

  await writeAuditLog({
    organizationId: ctx.org.id,
    userId: ctx.userId,
    action: "created",
    resourceType: "api_token",
    resourceId: row.id,
    resourceName: row.name,
    ipAddress: getClientIp(req),
  });

  // rawToken is returned ONCE here — never stored, never retrievable again
  return NextResponse.json({ ...row, token: rawToken }, { status: 201 });
}
