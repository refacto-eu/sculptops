import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { smtpSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { decrypt } from "@/lib/crypto";
import { assertSafeOutboundHost } from "@/lib/security";

const schema = z.object({
  recipients: z.array(z.string().email()).min(1),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const smtp = await db.query.smtpSettings.findFirst({ where: eq(smtpSettings.organizationId, ctx.org.id) });
  if (!smtp) return NextResponse.json({ error: "SMTP is not configured" }, { status: 400 });

  try {
    await assertSafeOutboundHost(smtp.host, "SMTP host");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid SMTP host";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let password: string | undefined;
  if (smtp.encryptedPassword && smtp.iv && smtp.authTag) {
    password = decrypt(smtp.encryptedPassword, smtp.iv, smtp.authTag);
  }

  try {
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.username ? { user: smtp.username, pass: password } : undefined,
    });

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
      to: parsed.data.recipients.join(", "),
      subject: "✅ SculptOps — SMTP test",
      html: `<p>Your SMTP configuration is working correctly.</p><p style="color:#666;font-size:12px">Sent at ${new Date().toISOString()}</p>`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    // Log full error server-side, return sanitized message to client
    const raw = err instanceof Error ? err.message : "SMTP error";
    console.error("[smtp/test] error:", raw);
    const message =
      raw.includes("ECONNREFUSED") || raw.includes("connect") ? "Connection refused — check host and port" :
      raw.includes("ETIMEDOUT") || raw.includes("timeout")   ? "Connection timed out — check host and port" :
      raw.includes("auth") || raw.includes("535")            ? "Authentication failed — check username and password" :
      raw.includes("ENOTFOUND")                              ? "Host not found — check SMTP host" :
      "SMTP test failed — check your configuration";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
