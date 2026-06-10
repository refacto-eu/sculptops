import { db } from "@/lib/db";
import { playbooks, playbookVersions } from "@/lib/db/schema";
import { and, eq, max } from "drizzle-orm";
import { decryptFromString } from "@/lib/crypto";
import { spawn } from "child_process";
import { mkdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { assertSafeGitUrl, safeJoinUnder } from "@/lib/security";

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

export async function syncPlaybookById(playbookId: string, organizationId?: string): Promise<{ ok: boolean; error?: string }> {
  const playbook = await db.query.playbooks.findFirst({
    where: organizationId
      ? and(eq(playbooks.id, playbookId), eq(playbooks.organizationId, organizationId))
      : eq(playbooks.id, playbookId),
  });
  if (!playbook) return { ok: false, error: "Playbook not found" };
  if (!playbook.gitRepo || !playbook.gitPath) return { ok: true }; // no git config — nothing to sync

  try {
    await assertSafeGitUrl(playbook.gitRepo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Git repository URL";
    return { ok: false, error: message };
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
      // Sanitize stderr before surfacing — strip any credentials that may appear in URLs
      const safe = stderr.replace(/x-access-token:[^@\s]+@/gi, "x-access-token:***@")
                         .replace(/\/\/[^:]+:[^@\s]+@/g, "//***:***@");
      const msg = safe.includes("not found") || safe.includes("Repository not found")
        ? "Repository not found — check URL and token"
        : safe.includes("auth") || safe.includes("credential")
        ? "Authentication failed — check your access token"
        : "Git clone failed — check repository URL, branch, and file path";
      return { ok: false, error: msg };
    }

    let content: string;
    const safePath = safeJoinUnder(tmpDir, playbook.gitPath);
    if (!safePath) return { ok: false, error: "Invalid Git file path" };

    try {
      content = await readFile(safePath, "utf8");
    } catch {
      return { ok: false, error: `File "${playbook.gitPath}" not found in repository` };
    }

    const [{ value: maxVersion }] = await db
      .select({ value: max(playbookVersions.version) })
      .from(playbookVersions)
      .where(eq(playbookVersions.playbookId, playbookId));

    await db.update(playbooks)
      .set({ content, updatedAt: new Date() })
      .where(organizationId
        ? and(eq(playbooks.id, playbookId), eq(playbooks.organizationId, organizationId))
        : eq(playbooks.id, playbookId));

    await db.insert(playbookVersions).values({
      playbookId,
      version: (maxVersion ?? 0) + 1,
      content,
    });

    return { ok: true };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
