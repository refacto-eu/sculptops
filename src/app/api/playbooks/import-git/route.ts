import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { db } from "@/lib/db";
import { playbooks, playbookVersions } from "@/lib/db/schema";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { encryptToString } from "@/lib/crypto";
import { spawn } from "child_process";
import { mkdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { assertSafeGitUrl, safeJoinUnder } from "@/lib/security";
import { safePlaybook } from "@/lib/playbook-response";

const schema = z.object({
  name: z.string().min(1).max(255),
  repoUrl: z.string().url().startsWith("https://"),
  branch: z.string().min(1).max(100).default("main"),
  filePath: z.string().min(1).max(500),
  token: z.string().optional(),
});

function spawnAsync(cmd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env } });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.on("error", () => resolve({ code: 1, stderr }));
  });
}

function buildAuthUrl(repoUrl: string, token?: string): string {
  if (!token) return repoUrl;
  return repoUrl.replace(/^https:\/\//, `https://x-access-token:${encodeURIComponent(token)}@`);
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const [body, bodyErr] = await parseBody(req);
  if (bodyErr) return bodyErr;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { name, repoUrl, branch, filePath, token } = parsed.data;
  try {
    await assertSafeGitUrl(repoUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Git repository URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const tmpDir = join(tmpdir(), `git-import-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    const authUrl = buildAuthUrl(repoUrl, token);

    const { code, stderr } = await spawnAsync("git", [
      "clone", "--depth", "1", "--branch", branch,
      "--single-branch", "--no-tags",
      authUrl, tmpDir,
    ], { ...process.env, GIT_TERMINAL_PROMPT: "0" });

    if (code !== 0) {
      const msg = stderr.includes("not found") || stderr.includes("Repository not found")
        ? "Repository not found — check the URL and token"
        : stderr.includes("branch") || stderr.includes("reference")
        ? `Branch "${branch}" not found`
        : "Git clone failed — check URL, branch, and access token";
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    let content: string;
    const safePath = safeJoinUnder(tmpDir, filePath);
    if (!safePath) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    try {
      content = await readFile(safePath, "utf8");
    } catch {
      return NextResponse.json({ error: `File "${filePath}" not found in repository` }, { status: 422 });
    }

    const encryptedToken = token ? encryptToString(token) : null;

    const [playbook] = await db.insert(playbooks).values({
      organizationId: ctx.org.id,
      name,
      content,
      gitRepo: repoUrl,
      gitBranch: branch,
      gitPath: filePath,
      gitToken: encryptedToken,
    }).returning();

    await db.insert(playbookVersions).values({
      playbookId: playbook.id,
      version: 1,
      content,
      changedBy: ctx.userId,
    });

    await writeAuditLog({
      organizationId: ctx.org.id,
      userId: ctx.userId,
      action: "created",
      resourceType: "playbook",
      resourceId: playbook.id,
      resourceName: playbook.name,
      metadata: { source: "git", repo: repoUrl, branch, path: filePath },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(safePlaybook(playbook), { status: 201 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
