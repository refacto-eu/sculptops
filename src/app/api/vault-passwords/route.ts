import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { vaultPasswords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";import { encrypt } from "@/lib/crypto";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  password: z.string().min(1),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.vaultPasswords.findMany({
    where: eq(vaultPasswords.organizationId, ctx.org.id),
    orderBy: [desc(vaultPasswords.createdAt)],
    columns: {
      id: true, name: true, description: true,
      provider: true, createdAt: true, updatedAt: true,
      // Never return the encrypted password fields to the client
      encryptedPassword: false, iv: false, authTag: false,
    },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { encryptedData, iv, authTag } = encrypt(parsed.data.password);

  const [row] = await db.insert(vaultPasswords).values({
    organizationId: ctx.org.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    encryptedPassword: encryptedData,
    iv,
    authTag,
  }).returning({
    id: vaultPasswords.id,
    name: vaultPasswords.name,
    description: vaultPasswords.description,
    provider: vaultPasswords.provider,
    createdAt: vaultPasswords.createdAt,
    updatedAt: vaultPasswords.updatedAt,
  });

  await writeAuditLog({
    organizationId: ctx.org.id,
    userId: ctx.userId,
    action: "created",
    resourceType: "vault_password",
    resourceId: row.id,
    resourceName: row.name,
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(row, { status: 201 });
}
