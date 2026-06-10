import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { webhookTokens, executions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { syncPlaybookById } from "@/lib/sync-playbook";
import { hashToken, isWebhookToken } from "@/lib/api-token";

const overrideSchema = z.object({
  dryRun: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
  limitHosts: z.string().min(1).max(255).optional(),
  extraVars: z.record(z.string().max(2000)).optional(),
}).strict();

const g = global as typeof globalThis & {
  webhookRateLimits?: Map<string, { count: number; resetAt: number }>;
};

function rateLimit(req: NextRequest, token: string): NextResponse | null {
  const max = Number.parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX ?? "30", 10);
  const windowMs = Number.parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  if (!Number.isFinite(max) || max <= 0) return null;

  const now = Date.now();
  const key = token;
  const store = g.webhookRateLimits ??= new Map();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= max) {
    return NextResponse.json({ error: "Too many webhook requests" }, { status: 429 });
  }

  current.count += 1;
  return null;
}

async function readWebhookBody(req: NextRequest): Promise<[unknown, NextResponse | null]> {
  const maxBytes = Number.parseInt(process.env.WEBHOOK_MAX_BODY_BYTES ?? "65536", 10);
  const contentLength = Number.parseInt(req.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return [null, NextResponse.json({ error: "Webhook body too large" }, { status: 413 })];
  }

  let bodyText = "";
  try {
    bodyText = await req.text();
  } catch {
    return [null, NextResponse.json({ error: "Invalid request body" }, { status: 400 })];
  }

  if (Buffer.byteLength(bodyText, "utf8") > maxBytes) {
    return [null, NextResponse.json({ error: "Webhook body too large" }, { status: 413 })];
  }

  if (!bodyText) return [null, null];

  try {
    return [JSON.parse(bodyText), null];
  } catch {
    return [null, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })];
  }
}

function extractPushBranch(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const ref = (body as Record<string, unknown>).ref;
  if (typeof ref !== "string") return null;
  // GitHub/GitLab: "refs/heads/main" → "main", or just "main"
  return ref.replace(/^refs\/heads\//, "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!isWebhookToken(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  const limited = rateLimit(req, token);
  if (limited) return limited;

  const webhook = await db.query.webhookTokens.findFirst({
    where: eq(webhookTokens.tokenHash, hashToken(token)),
  });

  if (!webhook) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (!webhook.playbookId || !webhook.inventoryId) {
    return NextResponse.json({ error: "Webhook is missing playbook or inventory" }, { status: 422 });
  }

  const githubEvent = req.headers.get("x-github-event");
  const gitlabEvent = req.headers.get("x-gitlab-event");
  const isPushEvent =
    githubEvent === "push" ||
    gitlabEvent === "Push Hook" ||
    gitlabEvent === "Tag Push Hook";

  let bodyJson: unknown = null;
  const [parsedBody, bodyErr] = await readWebhookBody(req);
  if (bodyErr) return bodyErr;
  bodyJson = parsedBody;

  if (isPushEvent) {
    const pushedBranch = extractPushBranch(bodyJson);
    if (webhook.gitBranch && pushedBranch && pushedBranch !== webhook.gitBranch) {
      // silently ignore — push was to a different branch
      return NextResponse.json({ skipped: true, reason: "branch mismatch" });
    }
  }

  // For non-push requests body may contain option overrides; for push events we ignore overrides
  const bodyOverrides = !isPushEvent && bodyJson && typeof bodyJson === "object"
    ? overrideSchema.safeParse(bodyJson)
    : { success: true as const, data: {} };

  if (!bodyOverrides.success) {
    return NextResponse.json({ error: bodyOverrides.error.errors[0].message }, { status: 400 });
  }

  const options = { ...webhook.options, ...bodyOverrides.data };

  // Auto-sync playbook from git so the execution runs the latest code
  if (isPushEvent) {
    const result = await syncPlaybookById(webhook.playbookId, webhook.organizationId).catch(() => ({ ok: false, error: "Git sync failed" }));
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Git sync failed" }, { status: 422 });
    }
  }

  const [execution] = await db.insert(executions).values({
    organizationId: webhook.organizationId,
    playbookId: webhook.playbookId,
    inventoryId: webhook.inventoryId,
    options,
    status: "pending",
    createdBy: webhook.createdBy,
  }).returning();

  // Update stats (fire-and-forget)
  db.update(webhookTokens)
    .set({
      lastTriggeredAt: new Date(),
      triggerCount: (webhook.triggerCount ?? 0) + 1,
    })
    .where(eq(webhookTokens.id, webhook.id))
    .then(() => {})
    .catch(() => {});

  import("@/lib/run-execution").then(m => m.runExecution(execution.id)).catch(() => {});

  return NextResponse.json({ executionId: execution.id, message: "Execution triggered" }, { status: 202 });
}
