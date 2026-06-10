import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { assertSafeOutboundHost } from "@/lib/security";

const schema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  try {
    await assertSafeOutboundHost(parsed.data.host, "SMTP host");
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: parsed.data.host,
      port: parsed.data.port,
      secure: parsed.data.secure,
      auth: parsed.data.username
        ? { user: parsed.data.username, pass: parsed.data.password ?? "" }
        : undefined,
    });
    await transporter.verify();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
