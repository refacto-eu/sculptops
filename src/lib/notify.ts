import { db } from "@/lib/db";
import { notificationSettings, smtpSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { assertSafeHttpUrl, assertSafeOutboundHost } from "@/lib/security";

interface ExecutionEvent {
  organizationId: string;
  executionId: string;
  playbookName: string;
  playbookId: string | null;
  inventoryId: string | null;
  status: "success" | "failed";
}

// ─── Webhook senders ──────────────────────────────────────────────────────────

function buildSlackBody(e: ExecutionEvent) {
  const ok = e.status === "success";
  return {
    attachments: [{
      color: ok ? "#2eb886" : "#e01e5a",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ok
              ? `:white_check_mark: Playbook *${e.playbookName}* succeeded`
              : `:x: Playbook *${e.playbookName}* failed`,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `Execution \`${e.executionId.slice(0, 8)}\` · ${new Date().toISOString()} · SculptOps` }],
        },
      ],
    }],
  };
}

function buildDiscordBody(e: ExecutionEvent) {
  const ok = e.status === "success";
  return {
    embeds: [{
      title: ok ? "✅ Playbook succeeded" : "❌ Playbook failed",
      description: `**${e.playbookName}**`,
      color: ok ? 0x2eb886 : 0xe01e5a,
      fields: [
        { name: "Execution ID", value: `\`${e.executionId.slice(0, 8)}\``, inline: true },
        { name: "Status", value: e.status, inline: true },
      ],
      footer: { text: "SculptOps" },
      timestamp: new Date().toISOString(),
    }],
  };
}

function buildGenericBody(e: ExecutionEvent) {
  return {
    event: `execution.${e.status}`,
    executionId: e.executionId,
    status: e.status,
    playbookName: e.playbookName,
    playbookId: e.playbookId,
    inventoryId: e.inventoryId,
    timestamp: new Date().toISOString(),
  };
}

async function sendWebhook(url: string, body: unknown) {
  const safeUrl = await assertSafeHttpUrl(url, "Webhook URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    await fetch(safeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Email sender ─────────────────────────────────────────────────────────────

async function sendEmail(smtp: typeof smtpSettings.$inferSelect, e: ExecutionEvent) {
  const { createTransport } = await import("nodemailer");
  await assertSafeOutboundHost(smtp.host, "SMTP host");

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

  const ok = e.status === "success";
  const subject = ok
    ? `✅ [SculptOps] Playbook "${e.playbookName}" succeeded`
    : `❌ [SculptOps] Playbook "${e.playbookName}" failed`;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:${ok ? "#2eb886" : "#e01e5a"};padding:12px 20px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:16px">${ok ? "✅ Execution succeeded" : "❌ Execution failed"}</h2>
      </div>
      <div style="background:#18181b;padding:20px;border-radius:0 0 8px 8px;color:#e4e4e7">
        <p style="margin:0 0 12px"><strong>Playbook:</strong> ${e.playbookName}</p>
        <p style="margin:0 0 12px"><strong>Status:</strong> ${e.status}</p>
        <p style="margin:0 0 12px"><strong>Execution ID:</strong> <code>${e.executionId.slice(0, 8)}</code></p>
        <p style="margin:0 0 0;color:#71717a;font-size:12px">Sent by SculptOps · ${new Date().toISOString()}</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
    to: smtp.recipients.join(", "),
    subject,
    html,
  });
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

export async function sendExecutionNotification(event: ExecutionEvent) {
  try {
    const [webhooks, smtp] = await Promise.all([
      db.query.notificationSettings.findMany({
        where: eq(notificationSettings.organizationId, event.organizationId),
      }),
      db.query.smtpSettings.findFirst({
        where: eq(smtpSettings.organizationId, event.organizationId),
      }),
    ]);

    const shouldFire = (onFailure: boolean, onSuccess: boolean) =>
      (event.status === "failed" && onFailure) || (event.status === "success" && onSuccess);

    // Webhooks — each channel is independent
    for (const webhook of webhooks) {
      if (webhook.enabled && webhook.webhookUrl && shouldFire(webhook.onFailure, webhook.onSuccess)) {
        const body =
          webhook.channelType === "slack" ? buildSlackBody(event) :
          webhook.channelType === "discord" ? buildDiscordBody(event) :
          buildGenericBody(event);
        sendWebhook(webhook.webhookUrl, body).catch(() => {});
      }
    }

    // Email
    if (smtp?.enabled && smtp.recipients.length > 0 && shouldFire(smtp.onFailure, smtp.onSuccess)) {
      sendEmail(smtp, event).catch(() => {});
    }
  } catch {
    // Notification failure must never crash the execution pipeline
  }
}
