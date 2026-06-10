import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { servers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentOrg, requireWrite } from "@/lib/get-org";
import { decrypt } from "@/lib/crypto";
import { spawn } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getCurrentOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireWrite(ctx); if (denied) return denied;

  const server = await db.query.servers.findFirst({
    where: and(eq(servers.id, id), eq(servers.organizationId, ctx.org.id)),
    with: { sshKey: true },
  });

  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const keyDir = join(tmpdir(), `ssh-test-${randomUUID()}`);
  await mkdir(keyDir, { recursive: true });
  let keyPath: string | null = null;

  try {
    if (server.sshKey) {
      const { normalizePrivateKey } = await import("@/lib/ansible");
      const privateKey = normalizePrivateKey(decrypt(
        server.sshKey.encryptedPrivateKey,
        server.sshKey.iv,
        server.sshKey.authTag
      ));
      keyPath = join(keyDir, "key.pem");
      await writeFile(keyPath, privateKey, { mode: 0o600 });
    }

    // Use spawn to avoid shell injection — each value is a separate argv element
    const sshArgsList = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      "-p", String(server.port),
      ...(keyPath ? ["-i", keyPath] : []),
      "-l", server.username,
      server.host,
      "echo", "OK",
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn("ssh", sshArgsList);
      const timer = setTimeout(() => { child.kill(); reject(new Error("Connection timed out")); }, 15000);
      let stderr = "";
      child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Object.assign(new Error("SSH failed"), { stderr }));
      });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
    });

    await db
      .update(servers)
      .set({ lastConnectedAt: new Date(), status: "reachable" })
      .where(and(eq(servers.id, id), eq(servers.organizationId, ctx.org.id)));

    return NextResponse.json({ success: true, message: "Connection successful" });
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: string };
    const raw = (e.stderr?.trim() ?? e.message ?? "").toLowerCase();
    // Sanitize: map known patterns to safe messages, never expose raw system output
    const message =
      raw.includes("timed out") || raw.includes("timeout") ? "Connection timed out — check host and port" :
      raw.includes("refused") ? "Connection refused — check port and firewall" :
      raw.includes("auth") || raw.includes("permission") ? "Authentication failed — check SSH key or username" :
      raw.includes("no route") || raw.includes("unreachable") ? "Host unreachable — check IP address" :
      "Connection failed — check host, port, and credentials";

    console.error("[test-connection] SSH error:", e.stderr?.trim() ?? e.message);

    await db
      .update(servers)
      .set({ status: "unreachable" })
      .where(and(eq(servers.id, id), eq(servers.organizationId, ctx.org.id)));

    return NextResponse.json({ success: false, message }, { status: 502 });
  } finally {
    if (keyPath) await unlink(keyPath).catch(() => {});
    await import("fs/promises").then((fs) => fs.rm(keyDir, { recursive: true, force: true }));
  }
}
