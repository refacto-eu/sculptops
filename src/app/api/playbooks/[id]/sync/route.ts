import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { playbooks, playbookVersions } from "@/lib/db/schema";
import { eq, and, max } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { decryptFromString } from "@/lib/crypto";
import { spawn } from "child_process";
import { mkdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { assertSafeGitUrl, safeJoinUnder } from "@/lib/security";
import { safePlaybook } from "@/lib/playbook-response";

function spawnAsync(cmd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env } });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.on("error", () => resolve({ code: 1, stderr }));
  });
}

function buildAuthUrl(repoUrl: string, token?: string | null): string {
  if (!token) return repoUrl;
  return repoUrl.replace(/^https:\/\//, `https://x-access-token:${encodeURIComponent(token)}@`);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const playbook = await db.query.playbooks.findFirst({
    where: and(eq(playbooks.id, id), eq(playbooks.organizationId, ctx.org.id)),
  });
  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!playbook.gitRepo || !playbook.gitPath) {
    return NextResponse.json({ error: "Playbook is not linked to a Git repository" }, { status: 422 });
  }
  try {
    await assertSafeGitUrl(playbook.gitRepo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Git repository URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const token = playbook.gitToken ? decryptFromString(playbook.gitToken) : null;
  const tmpDir = join(tmpdir(), `git-sync-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    const authUrl = buildAuthUrl(playbook.gitRepo, token);
    const branch = playbook.gitBranch ?? "main";

    const { code, stderr } = await spawnAsync("git", [
      "clone", "--depth", "1", "--branch", branch,
      "--single-branch", "--no-tags",
      authUrl, tmpDir,
    ], { ...process.env, GIT_TERMINAL_PROMPT: "0" });

    if (code !== 0) {
      const msg = stderr.includes("not found") || stderr.includes("Repository not found")
        ? "Repository not found — check URL and token"
        : `Git clone failed: ${stderr.slice(0, 200)}`;
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    let content: string;
    const safePath = safeJoinUnder(tmpDir, playbook.gitPath);
    if (!safePath) {
      return NextResponse.json({ error: "Invalid Git file path" }, { status: 400 });
    }

    try {
      content = await readFile(safePath, "utf8");
    } catch {
      return NextResponse.json({ error: `File "${playbook.gitPath}" not found in repository` }, { status: 422 });
    }

    const [{ value: maxVersion }] = await db
      .select({ value: max(playbookVersions.version) })
      .from(playbookVersions)
      .where(eq(playbookVersions.playbookId, id));

    const [updated] = await db
      .update(playbooks)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(playbooks.id, id), eq(playbooks.organizationId, ctx.org.id)))
      .returning();

    await db.insert(playbookVersions).values({
      playbookId: id,
      version: (maxVersion ?? 0) + 1,
      content,
      changedBy: ctx.userId,
    });

    await writeAuditLog({
      organizationId: ctx.org.id,
      userId: ctx.userId,
      action: "updated",
      resourceType: "playbook",
      resourceId: id,
      resourceName: playbook.name,
      metadata: { source: "git-sync", repo: playbook.gitRepo, branch },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(safePlaybook(updated));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
