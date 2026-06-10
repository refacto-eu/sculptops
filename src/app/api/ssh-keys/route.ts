import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { sshKeys } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { encrypt } from "@/lib/crypto";
import { createHash } from "crypto";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const createKeySchema = z.object({
  name: z.string().min(1).max(255),
  privateKey: z.string().min(1),
  publicKey: z.string().optional(),
});

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.query.sshKeys.findMany({
    where: eq(sshKeys.organizationId, ctx.org.id),
    orderBy: [desc(sshKeys.createdAt)],
    columns: {
      encryptedPrivateKey: false,
      iv: false,
      authTag: false,
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
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { name, privateKey, publicKey } = parsed.data;
  const { encryptedData, iv, authTag } = encrypt(privateKey);

  const fingerprint = createHash("md5")
    .update(privateKey)
    .digest("hex")
    .replace(/(.{2})/g, "$1:")
    .slice(0, -1);

  const [key] = await db
    .insert(sshKeys)
    .values({
      name,
      organizationId: ctx.org.id,
      encryptedPrivateKey: encryptedData,
      iv,
      authTag,
      publicKey: publicKey || null,
      fingerprint,
    })
    .returning({
      id: sshKeys.id,
      name: sshKeys.name,
      fingerprint: sshKeys.fingerprint,
      publicKey: sshKeys.publicKey,
      createdAt: sshKeys.createdAt,
    });

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "ssh_key", resourceId: key.id, resourceName: key.name, ipAddress: getClientIp(req) });
  return NextResponse.json(key, { status: 201 });
}
