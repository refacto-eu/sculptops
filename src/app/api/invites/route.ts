import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { inviteTokens, smtpSettings } from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { assertSafeOutboundHost } from "@/lib/security";
import { hashToken } from "@/lib/api-token";

const createSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  email: z.string().email().optional(),
});

async function sendInviteEmail(orgId: string, to: string, orgName: string, role: string, inviteUrl: string, expiresInDays: number) {
  const smtp = await db.query.smtpSettings.findFirst({ where: eq(smtpSettings.organizationId, orgId) });
  if (!smtp?.host) throw new Error("SMTP is not configured");
  await assertSafeOutboundHost(smtp.host, "SMTP host");

  const { createTransport } = await import("nodemailer");
  let password: string | undefined;
  if (smtp.encryptedPassword && smtp.iv && smtp.authTag) {
    password = decrypt(smtp.encryptedPassword, smtp.iv, smtp.authTag);
  }

  const transporter = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.username ? { user: smtp.username, pass: password } : undefined,
  });

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
    to,
    subject: `You've been invited to join ${orgName} on SculptOps`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#18181b;padding:24px;border-radius:12px;color:#e4e4e7">
          <h2 style="margin:0 0 12px;color:#fff;font-size:18px">You're invited to ${orgName}</h2>
          <p style="margin:0 0 8px;color:#a1a1aa">You've been invited to join as <strong style="color:#fff">${role}</strong>.</p>
          <p style="margin:0 0 20px;color:#a1a1aa">Click the link below to create your account and join the team:</p>
          <a href="${inviteUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Accept invitation</a>
          <p style="margin:20px 0 0;color:#52525b;font-size:12px">This link expires in ${expiresInDays} day${expiresInDays > 1 ? "s" : ""} and can only be used once.</p>
        </div>
      </div>`,
  });
}

export async function GET() {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const rows = await db.query.inviteTokens.findMany({
    where: and(
      eq(inviteTokens.organizationId, ctx.org.id),
      isNull(inviteTokens.usedAt),
      gt(inviteTokens.expiresAt, new Date()),
    ),
    columns: { tokenHash: false },
    with: { createdByUser: { columns: { name: true, email: true } } },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parsed.data.expiresInDays);

  // Only the SHA-256 hash is stored — the raw token is returned once, below
  const [row] = await db
    .insert(inviteTokens)
    .values({
      organizationId: ctx.org.id,
      tokenHash: hashToken(token),
      role: parsed.data.role,
      expiresAt,
      createdBy: ctx.userId,
    })
    .returning();

  let emailError: string | undefined;
  if (parsed.data.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const inviteUrl = `${appUrl}/register?invite=${token}`;
    try {
      await sendInviteEmail(ctx.org.id, parsed.data.email, ctx.org.name, parsed.data.role, inviteUrl, parsed.data.expiresInDays);
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Failed to send email";
    }
  }

  await writeAuditLog({ organizationId: ctx.org.id, userId: ctx.userId, action: "created", resourceType: "invite", resourceId: row.id, metadata: { role: parsed.data.role, emailed: !!parsed.data.email }, ipAddress: getClientIp(req) });

  // Return the raw token exactly once so the creator can copy the link
  const { tokenHash: _tokenHash, ...safeRow } = row;
  return NextResponse.json({ ...safeRow, token, emailError }, { status: 201 });
}
