import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { getCurrentOrg, requireAdmin } from "@/lib/get-org";
import { assertSafeHttpUrl } from "@/lib/security";

const schema = z.object({
  webhookUrl: z.string().url(),
  channelType: z.enum(["generic", "slack", "discord"]).default("generic"),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireAdmin(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });

  try {
    await assertSafeHttpUrl(parsed.data.webhookUrl, "Webhook URL");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const { channelType } = parsed.data;
    const testBody =
      channelType === "slack"
        ? {
            attachments: [{
              color: "#2eb886",
              blocks: [
                { type: "section", text: { type: "mrkdwn", text: ":white_check_mark: *SculptOps* — test notification" } },
                { type: "context", elements: [{ type: "mrkdwn", text: `Sent at ${new Date().toISOString()}` }] },
              ],
            }],
          }
        : channelType === "discord"
        ? {
            embeds: [{
              title: "✅ Test notification",
              description: "SculptOps is connected to this channel.",
              color: 0x2eb886,
              footer: { text: "SculptOps" },
              timestamp: new Date().toISOString(),
            }],
          }
        : {
            event: "test",
            message: "SculptOps notification test",
            organizationId: ctx.org.id,
            timestamp: new Date().toISOString(),
          };

    const res = await fetch(parsed.data.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(testBody),
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ error: `Remote returned ${res.status}` }, { status: 502 });
    return NextResponse.json({ success: true });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
